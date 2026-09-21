import rdf from 'rdf-ext'
import { nameToURI } from 'canonical-md'

const KNOWN_ABSOLUTE_IRI_PREFIXES = [
  'http://',
  'https://',
  'file://',
  'urn:',
  'mailto:',
  'tel:',
  'obsidian:',
  // The system's own schemes: osg://repo/..., osg://vocab/..., pkg: purls and
  // app:// software IRIs. Not listed, they would read as CURIEs downstream
  // and be rewritten to urn:name: identifiers.
  'osg:',
  'pkg:',
  'app:',
]
const PERCENT_ENCODED_BYTE = /^[0-9A-Fa-f]{2}$/
const FORBIDDEN_IRI_CHARS = new Set(['<', '>', '"', '{', '}', '|', '\\', '^', '`'])
const utf8Encoder = new TextEncoder()

// Keep Markdown URI/IRI repair isolated here. The RDF serializer assumes
// NamedNode values are already legal N-Quads IRIs, but real Markdown corpora
// contain browser-tolerated URL text such as raw query brackets or multiple
// fragment hashes that Oxygraph rejects.
//
// TODO: evaluate replacing or validating this with `uri-js` later. `uri-js`
// implements RFC-style URI/IRI parsing and serialization, but generic URL
// canonicalizers do not necessarily match RDF/N-Quads parser behavior or our
// "preserve already-valid IRIs" requirement. Keep Oxygraph-backed tests around
// any future library-backed change.

export function isKnownAbsoluteIri(value) {
  const lowerValue = value.toLowerCase()
  return KNOWN_ABSOLUTE_IRI_PREFIXES.some((prefix) => lowerValue.startsWith(prefix))
}

// Characters no IRI may carry in N-Quads, not even percent-encoded later.
const INVALID_IRI_CHARS = /[\s<>"{}|\\^`]/

export function hasInvalidIriChars(value) {
  return INVALID_IRI_CHARS.test(value)
}

// THE rule every reader uses to read a text as an identifier: a Markdown field
// value, a Markdown link target, a canvas link node, a canvas edge label.
//
//   knownIri   the text as an IRI when its scheme is known, else null
//   iriOrName  that IRI, else urn:name:<text>, which mapQuad expands when the
//              text is a CURIE with a known prefix
//
// Both return null when the text is empty or has characters no IRI may carry;
// the caller decides whether that is an error.
export function knownIri(value) {
  const text = String(value ?? '').trim()
  if (!text || INVALID_IRI_CHARS.test(text) || !isKnownAbsoluteIri(text)) return null
  return rdf.namedNode(text)
}

export function iriOrName(value) {
  const text = String(value ?? '').trim()
  if (!text || INVALID_IRI_CHARS.test(text)) return null
  return knownIri(text) ?? nameToURI(text)
}

function isControlCodePoint(codePoint) {
  return codePoint <= 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)
}

function percentEncodeCodePoint(char) {
  return Array.from(utf8Encoder.encode(char), (byte) => (
    `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  )).join('')
}

function authorityBounds(value) {
  const schemeSeparator = value.indexOf(':')
  if (schemeSeparator < 0 || value.slice(schemeSeparator + 1, schemeSeparator + 3) !== '//') {
    return null
  }

  const authorityStart = schemeSeparator + 3
  const authorityEndCandidates = ['/', '?', '#']
    .map((char) => value.indexOf(char, authorityStart))
    .filter((index) => index >= 0)
  const authorityEnd = authorityEndCandidates.length
    ? Math.min(...authorityEndCandidates)
    : value.length

  return { authorityStart, authorityEnd }
}

function protectedIpLiteralBrackets(value) {
  const indexes = new Set()
  const bounds = authorityBounds(value)
  if (!bounds) {
    return indexes
  }

  const { authorityStart, authorityEnd } = bounds
  const authority = value.slice(authorityStart, authorityEnd)
  const hostStart = authorityStart + authority.lastIndexOf('@') + 1

  if (value[hostStart] !== '[') {
    return indexes
  }

  const hostEnd = value.indexOf(']', hostStart + 1)
  if (hostEnd < 0 || hostEnd >= authorityEnd) {
    return indexes
  }

  const afterHost = hostEnd + 1
  if (afterHost !== authorityEnd && value[afterHost] !== ':') {
    return indexes
  }

  const literal = value.slice(hostStart + 1, hostEnd)
  if (!literal.includes(':') && !/^v[0-9A-Fa-f]+\./.test(literal)) {
    return indexes
  }

  indexes.add(hostStart)
  indexes.add(hostEnd)
  return indexes
}

export function sanitizeAbsoluteIriForNQuads(value) {
  const protectedBrackets = protectedIpLiteralBrackets(value)
  let output = ''
  let sawFragmentDelimiter = false

  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index)
    const char = String.fromCodePoint(codePoint)

    if (char === '%' && PERCENT_ENCODED_BYTE.test(value.slice(index + 1, index + 3))) {
      output += char
    } else if (char === '%') {
      output += percentEncodeCodePoint(char)
    } else if (char === '#') {
      if (sawFragmentDelimiter) {
        output += percentEncodeCodePoint(char)
      } else {
        output += char
        sawFragmentDelimiter = true
      }
    } else if ((char === '[' || char === ']') && !protectedBrackets.has(index)) {
      output += percentEncodeCodePoint(char)
    } else if (FORBIDDEN_IRI_CHARS.has(char) || isControlCodePoint(codePoint)) {
      output += percentEncodeCodePoint(char)
    } else {
      output += char
    }

    index += char.length
  }

  return output
}

export function sanitizeKnownAbsoluteIriForNQuads(value) {
  return isKnownAbsoluteIri(value) ? sanitizeAbsoluteIriForNQuads(value) : null
}
