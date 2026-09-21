import rdf from 'rdf-ext'
import { FRONTMATTER_TERMS, nameFromURI, tokenFromURI } from 'canonical-md'
import { PREFIXES } from 'canonical-md/prefixes'
import { hasInvalidIriChars, sanitizeAbsoluteIriForNQuads, sanitizeKnownAbsoluteIriForNQuads } from './iri.js'

export { PREFIXES }

// The mappings a caller gets when it gives none: the frontmatter keys the
// document model names (title -> rdfs:label, ...). A caller that gives
// `mappings` replaces them, so it spreads FRONTMATTER_TERMS in to keep them.
export const MAPPINGS = FRONTMATTER_TERMS

// `prefix:local` -> namespace + local, or null. A value whose local part
// starts with `//` is an IRI with an authority (osg://repo/..., http://...),
// never a CURIE. A local part with a character no IRI may carry (whitespace,
// <, >, ...) is not a CURIE either: `schema: name` stays a deferred name.
export function expandCurie(curie, prefixes = PREFIXES) {
  const separator = curie.indexOf(':')
  if (separator <= 0) return null
  const prefix = curie.slice(0, separator)
  const suffix = curie.slice(separator + 1)
  if (suffix.startsWith('//') || hasInvalidIriChars(suffix)) return null
  const base = prefixes[prefix]
  return base ? `${base}${suffix}` : null
}

// A predicate mapping value is a NamedNode, a CURIE or an absolute IRI.
function mappedTerm(value, prefixes) {
  if (typeof value !== 'string') {
    if (value?.termType !== 'NamedNode' || typeof value.value !== 'string') {
      throw new TypeError('Predicate mapping must be a NamedNode or an IRI/CURIE string')
    }
    return value
  }
  const expanded = expandCurie(value, prefixes)
  return rdf.namedNode(expanded ? sanitizeAbsoluteIriForNQuads(expanded) : value)
}

// The expansion is percent-encoded where N-Quads rejects it, as a known
// absolute IRI is: `schema:a[1]` gives https://schema.org/a%5B1%5D.
function expandedTerm(curie, prefixes) {
  const expanded = expandCurie(curie, prefixes)
  return expanded ? rdf.namedNode(sanitizeAbsoluteIriForNQuads(expanded)) : null
}

// The readers write deferred forms only: a key is urn:token:<key>, a
// CURIE-like value is urn:name:<value>. This resolves them, in every syntax:
//
//   predicate urn:token:<key>  mappings[key], else <key> as a CURIE
//   any       urn:name:<curie> <curie> expanded
//   any       absolute IRI     percent-encoded where N-Quads rejects it
//
// What does not resolve stays deferred: a stable IRI that a query can find.
function mapTerm(term, { prefixes, mappings }, position) {
  if (term.termType !== 'NamedNode') return term

  if (position === 'predicate') {
    const key = tokenFromURI(term)
    if (key !== null) {
      if (Object.hasOwn(mappings, key)) return mappedTerm(mappings[key], prefixes)
      return expandedTerm(key, prefixes) ?? term
    }
  }

  const name = nameFromURI(term)
  if (name !== null) return expandedTerm(name, prefixes) ?? term

  const sanitized = sanitizeKnownAbsoluteIriForNQuads(term.value)
  if (sanitized && sanitized !== term.value) return rdf.namedNode(sanitized)
  return term
}

export function mapQuad(quad, options = {}) {
  const { prefixes = PREFIXES, mappings = MAPPINGS } = options
  const tables = { prefixes, mappings }
  return rdf.quad(
    mapTerm(quad.subject, tables, 'subject'),
    mapTerm(quad.predicate, tables, 'predicate'),
    mapTerm(quad.object, tables, 'object'),
    quad.graph
  )
}

export const internals = {
  expandCurie
}
