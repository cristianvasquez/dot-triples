import rdf from 'rdf-ext'
import { parseSimpleYaml, parseScalar } from './frontmatter.js'
import {
  UNTYPED_TOKEN,
  documentNode,
  objectTerm,
  metaPredicateNode,
  plainLiteralTerm,
  predicateNode,
  sectionConceptNode,
  topConceptNode,
  urlNode,
  isAbsoluteIri,
} from './terms.js'

const RDFS_LABEL = rdf.namedNode('rdfs:label')
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g
const WIKI_LINK = /\[\[([^\]]+)\]\]/g
const TOKEN_REFERENCE = /\[([^\[\]]+)\](?!\()/g
const NAMED_REFERENCE = /(^|[\s(>])([a-zA-Z][\w+.-]*:[^\s<>)\]},"']+)/g

function rangeOverlaps(ranges, start, end) {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)
}

function emitQuads(onQuad, subject, predicate, value, options = {}) {
  const { plainObject = false } = options

  if (Array.isArray(value)) {
    for (const item of value) emitQuads(onQuad, subject, predicate, item, options)
    return
  }

  const object = plainObject ? plainLiteralTerm(value) : objectTerm(value)
  onQuad(rdf.quad(subject, predicate, object))
}

function createQuadWriter(onQuad) {
  return (subject, predicate, value, options = {}) => {
    emitQuads(onQuad, subject, predicate, value, options)
  }
}

function parseFieldValue(value) {
  const trimmed = String(value).trim()

  if (!trimmed) return ''

  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

export function createTriplifyProcessor(options = {}) {
  const { onQuad = () => {} } = options
  const writeQuad = createQuadWriter(onQuad)
  const localDocumentNode = documentNode(options)
  const localTopConceptNode = topConceptNode(options)

  const materializedConcepts = new Set()
  const labeledConcepts = new Set()
  const labeledUrls = new Set()

  let lineNumber = 0
  let frontmatterLines = []
  let inFrontmatter = false
  let atDocumentStart = true
  let inCodeFence = false
  let codeFenceLanguage = null
  let codeFenceLines = []
  let firstH1Seen = false
  let currentHeadingNode = null

  function currentSubject() {
    if (currentHeadingNode) return currentHeadingNode
    if (firstH1Seen) return localTopConceptNode
    return localDocumentNode
  }

  function emitLabelIfNeeded(subject, label) {
    if (!label || labeledConcepts.has(subject.value)) return
    writeQuad(subject, RDFS_LABEL, label, { plainObject: true })
    labeledConcepts.add(subject.value)
  }

  function materializeLocalConcept(subject, label) {
    if (!subject) return
    if (!materializedConcepts.has(subject.value)) {
      materializedConcepts.add(subject.value)
      writeQuad(localDocumentNode, predicateNode('about'), subject)
    }
    emitLabelIfNeeded(subject, label)
  }

  function emitFrontmatter(frontmatter) {
    for (const [key, value] of Object.entries(frontmatter)) {
      const mapped = options.mappings?.[key]
      const predicate = mapped ? rdf.namedNode(mapped) : predicateNode(key)
      writeQuad(localDocumentNode, predicate, value)
    }
  }

  function emitHeadingMeta(subject, rawLine, depth) {
    writeQuad(subject, metaPredicateNode('raw'), rawLine, { plainObject: true })
    writeQuad(subject, metaPredicateNode('depth'), String(depth), { plainObject: true })
    writeQuad(subject, metaPredicateNode('line'), String(lineNumber), { plainObject: true })
  }

  function handleHeading(line) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*$/)
    if (!headingMatch) return false

    const depth = headingMatch[1].length
    const title = headingMatch[2].trim()
    if (!title) return true

    if (depth === 1) {
      if (!firstH1Seen) {
        firstH1Seen = true
        currentHeadingNode = null
        materializeLocalConcept(localTopConceptNode, title)
        emitHeadingMeta(localTopConceptNode, line, depth)
        handleUnnamedNamedReferences(title, localTopConceptNode)
        return true
      }
    }

    const headingNode = sectionConceptNode(options, title)
    currentHeadingNode = headingNode
    materializeLocalConcept(headingNode, title)
    emitHeadingMeta(headingNode, line, depth)
    handleUnnamedNamedReferences(title, headingNode)
    return true
  }

  function handleField(line) {
    const normalizedLine = line.replace(/^\s*[-*+]\s+/, '')
    const match = normalizedLine.match(/^\s*([^:#][^:]*?)\s*::\s*(.+?)\s*$/)
    if (!match) return false

    const [, key, rawValue] = match
    const trimmedKey = key.trim()
    const parsedValue = parseFieldValue(rawValue)
    writeQuad(currentSubject(), predicateNode(trimmedKey), parsedValue)

    return true
  }

  function handleUnnamedNamedReferences(line, subject = currentSubject()) {
    let matched = false
    const occupiedRanges = []

    for (const match of line.matchAll(MARKDOWN_LINK)) {
      const [, label, uri] = match
      if (!label || !uri || !isAbsoluteIri(uri)) continue

      matched = true
      const target = urlNode(uri)
      writeQuad(subject, UNTYPED_TOKEN, target)
      occupiedRanges.push([match.index, match.index + match[0].length])

      if (!labeledUrls.has(target.value)) {
        writeQuad(target, RDFS_LABEL, label, { plainObject: true })
        labeledUrls.add(target.value)
      }
    }

    for (const match of line.matchAll(WIKI_LINK)) {
      const [, targetName] = match
      if (!targetName) continue

      const start = match.index
      const end = start + match[0].length
      if (rangeOverlaps(occupiedRanges, start, end)) continue

      matched = true
      occupiedRanges.push([start, end])
      writeQuad(subject, UNTYPED_TOKEN, objectTerm(match[0]))
    }

    for (const match of line.matchAll(TOKEN_REFERENCE)) {
      const [, tokenName] = match
      if (!tokenName) continue

      const start = match.index
      const end = start + match[0].length
      if (rangeOverlaps(occupiedRanges, start, end)) continue

      matched = true
      occupiedRanges.push([start, end])
      writeQuad(subject, UNTYPED_TOKEN, objectTerm(match[0]))
    }

    for (const match of line.matchAll(NAMED_REFERENCE)) {
      const value = match[2]
      if (!value) continue

      const start = match.index + match[1].length
      const end = start + value.length
      if (rangeOverlaps(occupiedRanges, start, end)) continue

      matched = true
      occupiedRanges.push([start, end])
      writeQuad(subject, UNTYPED_TOKEN, objectTerm(value))
    }

    return matched
  }

  function emitCodeBlock() {
    if (!codeFenceLanguage) return
    writeQuad(currentSubject(), rdf.namedNode(`urn:code-block:${encodeURIComponent(codeFenceLanguage)}`), codeFenceLines.join('\n'), {
      plainObject: true
    })
  }

  function processBodyLine(line) {
    const trimmedLine = line.trimStart()

    if (trimmedLine.startsWith('```')) {
      if (inCodeFence) {
        emitCodeBlock()
        inCodeFence = false
        codeFenceLanguage = null
        codeFenceLines = []
        return
      }

      inCodeFence = true
      codeFenceLanguage = trimmedLine.slice(3).trim().split(/\s+/, 1)[0] || null
      codeFenceLines = []
      return
    }

    if (inCodeFence) {
      codeFenceLines.push(line)
      return
    }

    if (handleHeading(line)) return
    if (handleField(line)) return
    handleUnnamedNamedReferences(line)
  }

  return {
    writeLine(line) {
      lineNumber++
      const normalizedLine = line.replace(/\r$/, '')

      if (atDocumentStart) {
        atDocumentStart = false

        if (normalizedLine === '---') {
          inFrontmatter = true
          frontmatterLines = []
          return
        }
      }

      if (inFrontmatter) {
        if (normalizedLine === '---') {
          inFrontmatter = false
          emitFrontmatter(parseSimpleYaml(frontmatterLines.join('\n')))
          frontmatterLines = []
          return
        }

        frontmatterLines.push(normalizedLine)
        return
      }

      processBodyLine(normalizedLine)
    },

    end() {
      if (inCodeFence) {
        const location = options.file || options.sourceId || options.name || 'markdown input'
        throw new Error(`Unclosed fenced code block in ${location}`)
      }

      if (inFrontmatter) {
        inFrontmatter = false
        processBodyLine('---')
        for (const line of frontmatterLines) {
          processBodyLine(line)
        }
        frontmatterLines = []
      }

    }
  }
}

export function triplify(content, options = {}) {
  const quads = []
  const processor = createTriplifyProcessor({
    ...options,
    onQuad(quad) {
      quads.push(quad)
    }
  })

  for (const line of String(content).split('\n')) {
    processor.writeLine(line)
  }

  processor.end()
  return quads
}

export const internals = {
  parseSimpleYaml,
  parseScalar,
  parseFieldValue,
}
