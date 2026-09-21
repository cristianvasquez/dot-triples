import rdf from 'rdf-ext'
import { FRONTMATTER_TERMS, vocab } from 'canonical-md'
import { parseSimpleYaml, parseScalar } from './frontmatter.js'
import { createInlineExtractor, extractPlainText, parseFieldValue } from './inline.js'
import {
  documentNode,
  sectionConceptNode,
  topConceptName,
  topConceptNode,
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
// This module owns the line scanner: frontmatter, headings, fences and
// blockquotes. The inline syntax -- fields, prose references, selectors and
// the heading identity a link implies -- lives in ./inline.js, which
// triplifier-canvas reuses for the text cards of a canvas.

export function createTriplifyProcessor (options = {}) {
  const { onQuad = () => {} } = options
  const localDocumentNode = documentNode(options)
  const localTopConceptNode = topConceptNode(options)
  const noteName = topConceptName(options)

  const inline = createInlineExtractor({
    onQuad,
    wikiContext: () => ({ noteName, noteTitle }),
  })

  const {
    emit,
    emitObject,
    emitLineSelector,
    emitQuoteSelector,
    describeHeading,
    resolvePredicate,
  } = inline

  const materializedConcepts = new Set()
  const labeledConcepts = new Set()
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

  function ensureDocument () {
    if (documentStarted) return
    documentStarted = true
    emit(localDocumentNode, vocab.type, vocab.File)
  }

  function currentSubject () {
    if (currentHeadingNode) return currentHeadingNode
    if (firstH1Seen) return localTopConceptNode
    return localDocumentNode
  }

  function emitLabelIfNeeded (subject, label) {
    if (!label || labeledConcepts.has(subject.value)) return
    emit(subject, vocab.label, rdf.literal(label))
    labeledConcepts.add(subject.value)
  }

  function materializeLocalConcept (subject, label) {
    if (!materializedConcepts.has(subject.value)) {
      materializedConcepts.add(subject.value)
      emit(localDocumentNode, vocab.about, subject)
    }
    emitLabelIfNeeded(subject, label)
  }

  function emitFrontmatter (frontmatter) {
    for (const [key, value] of Object.entries(frontmatter)) {
      // The predicate stays urn:token:<key>; mapQuad maps it (title ->
      // rdfs:label by default). A label or a keyword is text, not a term.
      const predicate = resolvePredicate(key)
      const term = FRONTMATTER_TERMS[key]
      const plainObject = term === vocab.label || term === vocab.keywords
      emitObject(localDocumentNode, predicate, value, { plainObject })
    }
  }

  function handleHeading (line) {
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
      inline.references(title, localTopConceptNode)
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
    inline.references(title, headingNode)
    return true
  }

  function emitPart (kind, firstLine, lastLine, text, language = null) {
    const part = rdf.blankNode()
    emit(currentSubject(), vocab.hasPart, part)
    emit(part, vocab.type, vocab.ResourceReference)
    emit(part, vocab.type, kind)
    emit(part, vocab.source, localTopConceptNode)
    emitLineSelector(part, firstLine, lastLine)
    emitQuoteSelector(part, text)
    if (language) emit(part, vocab.programmingLanguage, rdf.literal(language))
  }

  function emitCodeBlock () {
    // The fence lines themselves are the location; the quote is the content.
    emitPart(vocab.SoftwareSourceCode, codeFenceStart, lineNumber, codeFenceLines.join('\n'), codeFenceLanguage)
  }

  function emitBlockquote () {
    if (!blockquoteLines.length) return
    emitPart(vocab.Quotation, blockquoteStart, blockquoteStart + blockquoteLines.length - 1, blockquoteLines.join('\n'))
    blockquoteLines = []
  }

  function processBodyLine (line) {
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
    if (inline.field(line, currentSubject())) return
    inline.references(line, currentSubject())
  }

  return {
    writeLine (line) {
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

    end () {
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

export function triplify (content, options = {}) {
  const quads = []
  const processor = createTriplifyProcessor({
    ...options,
    onQuad (quad) {
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
