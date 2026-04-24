import rdf from 'rdf-ext'
import { parseSimpleYaml, parseScalar } from './frontmatter.js'
import {
  UNTYPED_TOKEN,
  documentNode,
  objectTerm,
  owningDocumentNodeForConceptName,
  plainLiteralTerm,
  predicateNode,
  sectionConceptNode,
  topConceptName,
  topConceptNode,
  urlNode,
  wikiConceptName,
  isAbsoluteIri,
} from './terms.js'

const RDFS_LABEL = rdf.namedNode('rdfs:label')
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

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
  const localTopConceptName = topConceptName(options)

  const materializedConcepts = new Set()
  const labeledConcepts = new Set()
  const labeledUrls = new Set()
  const outlineLines = []

  let frontmatterLines = []
  let inFrontmatter = false
  let atDocumentStart = true
  let inCodeFence = false
  let codeFenceLanguage = null
  let codeFenceLines = []
  let firstH1Seen = false
  let currentSectionNode = null
  let currentSectionTitle = null
  let currentSectionMaterialized = false

  function currentSubject() {
    if (currentSectionNode) return currentSectionNode
    if (firstH1Seen) return localTopConceptNode
    return localDocumentNode
  }

  function materializeConceptByName(conceptName) {
    if (!conceptName) return null

    const conceptNode = rdf.namedNode(`urn:name:${encodeURIComponent(conceptName)}`)
    const key = conceptNode.value
    if (!materializedConcepts.has(key)) {
      materializedConcepts.add(key)
      writeQuad(owningDocumentNodeForConceptName(conceptName), predicateNode('about'), conceptNode)
    }

    return conceptNode
  }

  function emitLabelIfNeeded(subject, label) {
    if (!label || labeledConcepts.has(subject.value)) return
    writeQuad(subject, RDFS_LABEL, label, { plainObject: true })
    labeledConcepts.add(subject.value)
  }

  function ensureCurrentSectionMaterialized() {
    if (!currentSectionNode || currentSectionMaterialized) return
    materializeConceptByName(`${localTopConceptName}#${currentSectionTitle}`)
    emitLabelIfNeeded(currentSectionNode, currentSectionTitle)
    currentSectionMaterialized = true
  }

  function emitFrontmatter(frontmatter) {
    for (const [key, value] of Object.entries(frontmatter)) {
      writeQuad(localDocumentNode, predicateNode(key), value)
    }
  }

  function appendOutline(depth, title) {
    const indent = '\t'.repeat(Math.max(0, depth - 1))
    outlineLines.push(`${indent}* ${title}`)
  }

  function handleHeading(line) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*$/)
    if (!headingMatch) return false

    const depth = headingMatch[1].length
    const title = headingMatch[2].trim()
    if (!title) return true

    appendOutline(depth, title)

    if (depth === 1) {
      currentSectionNode = null
      currentSectionTitle = null
      currentSectionMaterialized = false

      if (!firstH1Seen) {
        firstH1Seen = true
        materializeConceptByName(localTopConceptName)
        emitLabelIfNeeded(localTopConceptNode, title)
      }

      return true
    }

    const sectionNode = sectionConceptNode(options, title)
    currentSectionNode = sectionNode
    currentSectionTitle = title
    currentSectionMaterialized = false
    return true
  }

  function handleField(line) {
    const normalizedLine = line.replace(/^\s*[-*+]\s+/, '')
    const match = normalizedLine.match(/^\s*([^:#][^:]*?)\s*::\s*(.+?)\s*$/)
    if (!match) return false

    const [, key, rawValue] = match
    const trimmedKey = key.trim()
    const parsedValue = parseFieldValue(rawValue)
    ensureCurrentSectionMaterialized()
    writeQuad(currentSubject(), predicateNode(trimmedKey), parsedValue)

    const conceptName = wikiConceptName(parsedValue)
    if (conceptName) {
      materializeConceptByName(conceptName)
    }

    return true
  }

  function handleMarkdownLinks(line) {
    let matched = false

    for (const match of line.matchAll(MARKDOWN_LINK)) {
      const [, label, uri] = match
      if (!label || !uri || !isAbsoluteIri(uri)) continue

      matched = true
      ensureCurrentSectionMaterialized()
      const target = urlNode(uri)
      writeQuad(currentSubject(), UNTYPED_TOKEN, target)

      if (!labeledUrls.has(target.value)) {
        writeQuad(target, RDFS_LABEL, label, { plainObject: true })
        labeledUrls.add(target.value)
      }
    }

    return matched
  }

  function emitCodeBlock() {
    if (!codeFenceLanguage) return
    ensureCurrentSectionMaterialized()
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
    handleMarkdownLinks(line)
  }

  function emitOutlineIfNeeded() {
    if (!outlineLines.length) return
    writeQuad(localDocumentNode, predicateNode('outline'), outlineLines.join('\n'), {
      plainObject: true
    })
  }

  return {
    writeLine(line) {
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

      emitOutlineIfNeeded()
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
