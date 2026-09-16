import rdf from 'rdf-ext'
import { lineRange, nameFromURI, nameToURI, splitHeadingName, vocab } from 'canonical-md'
import { PREFIXES, expandCurie } from './curie-expansion.js'
import {
  isAbsoluteIri,
  objectTerm,
  plainLiteralTerm,
  predicateNode,
  urlNode,
} from './terms.js'

// The inline layer of the Markdown syntax: field lines, prose references,
// selectors and the heading identity a link implies. It holds no notion of a
// line number, a heading level or a document; the caller supplies the subject.
//
// Extracted so that a second triplifier over Markdown-flavoured text --
// triplifier-canvas, whose text cards carry the same `key :: value` fields and
// the same links -- runs one implementation of the syntax, not a copy.

const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g
const WIKI_LINK = /\[\[([^\]]+)\]\]/g
const TOKEN_REFERENCE = /\[([^\[\]]+)\](?!\()/g
const NAMED_REFERENCE = /(^|[\s(>])([a-zA-Z][\w+.-]*:[^\s<>)\]},"'`\\^|{}]+)/g

export function extractPlainText(text) {
  return text.replace(MARKDOWN_LINK, '$1').replace(WIKI_LINK, '$1').replace(TOKEN_REFERENCE, '$1')
}

function rangeOverlaps(ranges, start, end) {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)
}

export function parseFieldValue(value) {
  const trimmed = String(value).trim()

  if (!trimmed) return ''

  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

// A field line: `key :: value`, optionally after a list marker. The key must
// not start with '#' (a heading) or ':' .
const FIELD_LINE = /^\s*([^:#][^\n]*?)\s*::\s*(.+?)\s*$/
const LIST_MARKER = /^\s*[-*+]\s+/

export function createInlineExtractor(options = {}) {
  const {
    onQuad = () => {},
    prefixes: extraPrefixes = {},
    mappings = {},
    wikiContext = () => ({}),
  } = options

  const prefixes = { ...PREFIXES, ...extraPrefixes }
  const describedHeadings = new Set()
  const labeledUrls = new Set()

  const emit = (subject, predicate, object) => onQuad(rdf.quad(subject, predicate, object))

  // A mapped key wins outright; otherwise a CURIE against a known prefix
  // resolves to that vocabulary term; anything else stays a urn:token:
  // predicate, deferred until a mapping or prefix names it.
  function resolvePredicate(key, { frontmatterTerm = null } = {}) {
    const mapped = mappings?.[key]
    if (mapped) return rdf.namedNode(mapped)
    if (frontmatterTerm) return frontmatterTerm
    const expanded = expandCurie(key, prefixes)
    if (expanded) return rdf.namedNode(expanded)
    return predicateNode(key)
  }

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
    emitFragmentSelector(headingTerm, heading, vocab.OBSIDIAN_LINKS)
  }

  // A part of a resource, named by a fragment under a stated syntax. The
  // syntaxes in use: Obsidian links for a heading, RFC 5147 for a line range,
  // and, in triplifier-canvas, the JSON Canvas node id and a media fragment.
  function emitFragmentSelector(subject, value, conformsTo) {
    const selector = rdf.blankNode()
    emit(subject, vocab.selector, selector)
    emit(selector, vocab.type, vocab.FragmentSelector)
    emit(selector, vocab.value, rdf.literal(value))
    emit(selector, vocab.conformsTo, conformsTo)
    return selector
  }

  function emitLineSelector(subject, firstLine, lastLine) {
    return emitFragmentSelector(subject, lineRange(firstLine, lastLine), vocab.RFC5147)
  }

  function emitQuoteSelector(subject, text) {
    const selector = rdf.blankNode()
    emit(subject, vocab.selector, selector)
    emit(selector, vocab.type, vocab.TextQuoteSelector)
    emit(selector, vocab.exact, rdf.literal(text))
    return selector
  }

  // `key :: value` on the given subject. Returns false when the line is not a
  // field, so the caller can try the next reading.
  function field(line, subject) {
    const match = line.replace(LIST_MARKER, '').match(FIELD_LINE)
    if (!match) return false

    const [, key, rawValue] = match
    emitObject(subject, resolvePredicate(key.trim()), parseFieldValue(rawValue))
    return true
  }

  // Links in prose: [label](url), [[Note]], [[Note#Heading]], [token] and bare
  // IRIs, each dct:references on the subject. Ranges already consumed by an
  // earlier pattern are skipped, so [label](url) is not read a second time as
  // a [token].
  function references(line, subject) {
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

  return {
    emit,
    emitObject,
    emitFragmentSelector,
    emitLineSelector,
    emitQuoteSelector,
    describeHeading,
    describeHeadingIfAny,
    resolvePredicate,
    field,
    references,
  }
}

export const internals = {
  parseFieldValue,
}
