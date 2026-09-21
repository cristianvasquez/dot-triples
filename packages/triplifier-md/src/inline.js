import rdf from 'rdf-ext'
import { fragmentSelectorNode, lineRange, nameFromURI, nameToURI, splitHeadingName, textQuoteSelectorNode, vocab } from 'canonical-md'
import {
  isAbsoluteIri,
  objectTerm,
  plainLiteralTerm,
  predicateNode,
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
// A bare IRI in prose. Brackets are excluded from an IRI everywhere except
// the authority, where RFC 3986 writes an IPv6 address as an IP-literal
// (`http://[::1]/docs`), so that one form is admitted explicitly.
const NAMED_REFERENCE = /(^|[\s(>])([a-zA-Z][\w+.-]*:(?:\/\/\[[0-9A-Fa-f:.]+\][^\s<>)\]},"'`\\^|{}]*|[^\s<>)\]},"'`\\^|{}]+))/g
// The checkbox of a task list item: `- [x]`, `- [ ]` and the Obsidian custom
// states (`- [/]`, `- [>]`, ...). It is list syntax, not a [token] reference.
const TASK_CHECKBOX = /^(\s*(?:[-*+]|\d+[.)])\s+)(\[[^\[\]]\])(?=\s|$)/

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

// A field line: `key :: value`, optionally after a list marker. `::` is the
// separator and the whitespace around it is noise, so `key::value`,
// `key :: value` and `key ::value` are the same field. The key must not start
// with '#' (a heading) or ':' .
const FIELD_LINE = /^\s*([^:#][^\n]*?)\s*::\s*(.+?)\s*$/
const LIST_MARKER = /^\s*[-*+]\s+/

// `::` also occurs inside ordinary text -- an IPv6 authority
// (`http://[::1]/docs`), a C++ scope, a Rust path -- where it is not a
// separator and the line is a link or prose. A key is a predicate name, so it
// carries no link or URL punctuation; a candidate key that does means the
// `::` belonged to a URL and the line is not a field. This does not catch
// `std::vector` in prose, whose key (`See std`) is indistinguishable from a
// real multi-word key such as `lives in`.
const FIELD_KEY_REJECT = /[[\]()/<>"]/

export function createInlineExtractor(options = {}) {
  const {
    onQuad = () => {},
    wikiContext = () => ({}),
  } = options

  const describedHeadings = new Set()
  const labeledUrls = new Set()

  const emit = (subject, predicate, object) => onQuad(rdf.quad(subject, predicate, object))

  // A key is always urn:token:<key>. Mappings and CURIE expansion are not
  // the reader's job: mapQuad resolves the token after every syntax.
  function resolvePredicate(key) {
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
    const selector = fragmentSelectorNode(value, conformsTo)
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
    const selector = textQuoteSelectorNode(text)
    emit(subject, vocab.selector, selector)
    emit(selector, vocab.type, vocab.TextQuoteSelector)
    emit(selector, vocab.exact, rdf.literal(text))
    return selector
  }

  // `key :: value` on the given subject. Returns false when the line is not a
  // field, so the caller can try the next reading.
  function field(line, subject) {
    // The list marker and the task checkbox are list syntax, not part of the
    // key; `- [x] due :: 2026-01-01` is a field on the task.
    const body = line.replace(TASK_CHECKBOX, '').replace(LIST_MARKER, '')
    const match = body.match(FIELD_LINE)
    if (!match) return false

    const [, key, rawValue] = match
    if (FIELD_KEY_REJECT.test(key)) return false
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

    const checkbox = line.match(TASK_CHECKBOX)
    if (checkbox) {
      const start = checkbox[1].length
      occupiedRanges.push([start, start + checkbox[2].length])
    }

    for (const match of line.matchAll(MARKDOWN_LINK)) {
      const [, label, uri] = match
      if (!label || !uri || !isAbsoluteIri(uri)) continue

      matched = true
      // The same rule as a field value: a known scheme is an IRI, anything
      // else (`dprod:DataProduct`) a urn:name: that mapQuad may expand.
      const target = objectTerm(uri)
      emit(subject, vocab.references, target)
      occupiedRanges.push([match.index, match.index + match[0].length])

      if (!labeledUrls.has(target.value)) {
        emit(target, vocab.label, rdf.literal(label))
        labeledUrls.add(target.value)
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
