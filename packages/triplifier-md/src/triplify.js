import rdf from 'rdf-ext'
import { FRONTMATTER_TERMS, lineRange, nameFromURI, nameToURI, splitHeadingName, vocab } from 'canonical-md'
import { parseSimpleYaml, parseScalar } from './frontmatter.js'
import {
  documentNode,
  objectTerm,
  plainLiteralTerm,
  predicateNode,
  sectionConceptNode,
  topConceptName,
  topConceptNode,
  urlNode,
  isAbsoluteIri,
} from './terms.js'

// The document model, as @osg/model shapes/document.ttl states it:
//
//   the file      <urn:name:Note.md>  a document:File; frontmatter; schema:about
//                                     each note and heading it materialised
//   the note      <urn:name:Note>     a resource:Resource; label from the first H1
//   a heading     <urn:name:Note%23H> a resource:ResourceReference: source the
//                                     note, an Obsidian fragment selector (its
//                                     identity), and per occurrence an RFC 5147
//                                     line selector (where) and a text quote of
//                                     the heading line (what)
//   a part        blank node          a code block or blockquote: a reference
//                                     with line and quote selectors, typed
//                                     schema:SoftwareSourceCode or schema:Quotation
//
// Fields stay urn:token: predicates. Prose references are dct:references.
// A [[Note#Heading]] link anywhere emits the heading's identity (source and
// fragment selector), because a name and a fragment are all it takes; the
// owning file adds the location when it is triplified.

const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g
const WIKI_LINK = /\[\[([^\]]+)\]\]/g
const TOKEN_REFERENCE = /\[([^\[\]]+)\](?!\()/g
const NAMED_REFERENCE = /(^|[\s(>])([a-zA-Z][\w+.-]*:[^\s<>)\]},"'`\\^|{}]+)/g

function extractPlainText(text) {
  return text.replace(MARKDOWN_LINK, '$1').replace(WIKI_LINK, '$1').replace(TOKEN_REFERENCE, '$1')
}

function rangeOverlaps(ranges, start, end) {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)
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
  const localDocumentNode = documentNode(options)
  const localTopConceptNode = topConceptNode(options)
  const noteName = topConceptName(options)

  const materializedConcepts = new Set()
  const describedHeadings = new Set()
  const labeledConcepts = new Set()
  const labeledUrls = new Set()
  const quotedHeadings = new Set()

  let lineNumber = 0
  let frontmatterLines = []
  let inFrontmatter = false
  let atDocumentStart = true
  let inCodeFence = false
  let codeFenceLanguage = null
  let codeFenceLines = []
  let codeFenceStart = 0
  let blockquoteLines = []
  let blockquoteStart = 0
  let firstH1Seen = false
  let noteTitle = null
  let currentHeadingNode = null
  let documentStarted = false

  const emit = (subject, predicate, object) => onQuad(rdf.quad(subject, predicate, object))

  const wikiContext = () => ({ noteName, noteTitle })

  // Every object goes through here, so a heading IRI produced anywhere -- a
  // field value, a frontmatter value, a prose link -- gets its identity
  // described once.
  function emitObject(subject, predicate, value, { plainObject = false } = {}) {
    if (Array.isArray(value)) {
      for (const item of value) emitObject(subject, predicate, item, { plainObject })
      return
    }
    const object = plainObject ? plainLiteralTerm(value) : objectTerm(value, wikiContext())
    emit(subject, predicate, object)
    describeHeadingIfAny(object)
  }

  function describeHeadingIfAny(term) {
    if (term.termType !== 'NamedNode') return
    const name = nameFromURI(term)
    if (name === null) return
    const { note, heading } = splitHeadingName(name)
    if (heading === null || !note) return
    describeHeading(term, note, heading)
  }

  function describeHeading(headingTerm, note, heading) {
    if (describedHeadings.has(headingTerm.value)) return
    describedHeadings.add(headingTerm.value)
    emit(headingTerm, vocab.type, vocab.ResourceReference)
    emit(headingTerm, vocab.source, nameToURI(note))
    const selector = rdf.blankNode()
    emit(headingTerm, vocab.selector, selector)
    emit(selector, vocab.type, vocab.FragmentSelector)
    emit(selector, vocab.value, rdf.literal(heading))
    emit(selector, vocab.conformsTo, vocab.OBSIDIAN_LINKS)
  }

  function emitLineSelector(subject, firstLine, lastLine) {
    const selector = rdf.blankNode()
    emit(subject, vocab.selector, selector)
    emit(selector, vocab.type, vocab.FragmentSelector)
    emit(selector, vocab.value, rdf.literal(lineRange(firstLine, lastLine)))
    emit(selector, vocab.conformsTo, vocab.RFC5147)
  }

  function emitQuoteSelector(subject, text) {
    const selector = rdf.blankNode()
    emit(subject, vocab.selector, selector)
    emit(selector, vocab.type, vocab.TextQuoteSelector)
    emit(selector, vocab.exact, rdf.literal(text))
  }

  function ensureDocument() {
    if (documentStarted) return
    documentStarted = true
    emit(localDocumentNode, vocab.type, vocab.File)
  }

  function currentSubject() {
    if (currentHeadingNode) return currentHeadingNode
    if (firstH1Seen) return localTopConceptNode
    return localDocumentNode
  }

  function emitLabelIfNeeded(subject, label) {
    if (!label || labeledConcepts.has(subject.value)) return
    emit(subject, vocab.label, rdf.literal(label))
    labeledConcepts.add(subject.value)
  }

  function materializeLocalConcept(subject, label) {
    if (!materializedConcepts.has(subject.value)) {
      materializedConcepts.add(subject.value)
      emit(localDocumentNode, vocab.about, subject)
    }
    emitLabelIfNeeded(subject, label)
  }

  function emitFrontmatter(frontmatter) {
    for (const [key, value] of Object.entries(frontmatter)) {
      const mapped = options.mappings?.[key]
      const predicate = mapped ? rdf.namedNode(mapped) : (FRONTMATTER_TERMS[key] ?? predicateNode(key))
      const plainObject = predicate.equals(vocab.label) || predicate.equals(vocab.keywords)
      emitObject(localDocumentNode, predicate, value, { plainObject })
    }
  }

  function handleHeading(line) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*$/)
    if (!headingMatch) return false

    const depth = headingMatch[1].length
    const title = headingMatch[2].trim()
    if (!title) return true

    if (depth === 1 && !firstH1Seen) {
      firstH1Seen = true
      noteTitle = extractPlainText(title)
      currentHeadingNode = null
      emit(localTopConceptNode, vocab.type, vocab.Resource)
      materializeLocalConcept(localTopConceptNode, noteTitle)
      handleUnnamedNamedReferences(title, localTopConceptNode)
      return true
    }

    const headingNode = sectionConceptNode(options, title)
    currentHeadingNode = headingNode
    describeHeading(headingNode, noteName, title)
    materializeLocalConcept(headingNode, extractPlainText(title))
    emitLineSelector(headingNode, lineNumber, lineNumber)
    const quoteKey = `${headingNode.value}\n${line}`
    if (!quotedHeadings.has(quoteKey)) {
      quotedHeadings.add(quoteKey)
      emitQuoteSelector(headingNode, line)
    }
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
    const mapped = options.mappings?.[trimmedKey]
    const predicate = mapped ? rdf.namedNode(mapped) : predicateNode(trimmedKey)
    emitObject(currentSubject(), predicate, parsedValue)

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
      emit(subject, vocab.references, target)
      occupiedRanges.push([match.index, match.index + match[0].length])

      if (!labeledUrls.has(target.value)) {
        emit(target, vocab.label, rdf.literal(label))
        labeledUrls.add(target.value)
      }
    }

    for (const pattern of [WIKI_LINK, TOKEN_REFERENCE]) {
      for (const match of line.matchAll(pattern)) {
        const [, targetName] = match
        if (!targetName || !targetName.trim()) continue

        const start = match.index
        const end = start + match[0].length
        if (rangeOverlaps(occupiedRanges, start, end)) continue

        matched = true
        occupiedRanges.push([start, end])
        emitObject(subject, vocab.references, match[0])
      }
    }

    for (const match of line.matchAll(NAMED_REFERENCE)) {
      const value = match[2]
      if (!value || !value.trim()) continue

      const start = match.index + match[1].length
      const end = start + value.length
      if (rangeOverlaps(occupiedRanges, start, end)) continue

      matched = true
      occupiedRanges.push([start, end])
      emitObject(subject, vocab.references, value)
    }

    return matched
  }

  function emitPart(kind, firstLine, lastLine, text, language = null) {
    const part = rdf.blankNode()
    emit(currentSubject(), vocab.hasPart, part)
    emit(part, vocab.type, vocab.ResourceReference)
    emit(part, vocab.type, kind)
    emit(part, vocab.source, localTopConceptNode)
    emitLineSelector(part, firstLine, lastLine)
    emitQuoteSelector(part, text)
    if (language) emit(part, vocab.programmingLanguage, rdf.literal(language))
  }

  function emitCodeBlock() {
    // The fence lines themselves are the location; the quote is the content.
    emitPart(vocab.SoftwareSourceCode, codeFenceStart, lineNumber, codeFenceLines.join('\n'), codeFenceLanguage)
  }

  function emitBlockquote() {
    if (!blockquoteLines.length) return
    emitPart(vocab.Quotation, blockquoteStart, blockquoteStart + blockquoteLines.length - 1, blockquoteLines.join('\n'))
    blockquoteLines = []
  }

  function processBodyLine(line) {
    const trimmedLine = line.trimStart()

    if (trimmedLine.startsWith('```')) {
      emitBlockquote()
      if (inCodeFence) {
        emitCodeBlock()
        inCodeFence = false
        codeFenceLanguage = null
        codeFenceLines = []
        return
      }

      inCodeFence = true
      codeFenceStart = lineNumber
      codeFenceLanguage = trimmedLine.slice(3).trim().split(/\s+/, 1)[0] || null
      codeFenceLines = []
      return
    }

    if (inCodeFence) {
      codeFenceLines.push(line)
      return
    }

    const blockquoteMatch = line.match(/^\s*>\s?(.*)$/)
    if (blockquoteMatch) {
      if (!blockquoteLines.length) blockquoteStart = lineNumber
      blockquoteLines.push(blockquoteMatch[1])
      return
    }

    emitBlockquote()

    if (handleHeading(line)) return
    if (handleField(line)) return
    handleUnnamedNamedReferences(line)
  }

  return {
    writeLine(line) {
      ensureDocument()
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
      ensureDocument()
      if (inCodeFence) {
        // CommonMark auto-closes a fenced code block at end of document.
        // Emit what we have rather than aborting the whole batch on one
        // malformed file.
        emitCodeBlock()
        inCodeFence = false
        codeFenceLanguage = null
        codeFenceLines = []
      }

      emitBlockquote()

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

  // A final newline ends the last line; it does not start an empty one. The
  // stream transform makes the same call, so both paths count lines alike.
  const lines = String(content).split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  for (const line of lines) {
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
