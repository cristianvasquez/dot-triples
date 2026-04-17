import { basename } from 'node:path'
import rdf from 'rdf-ext'
import { NAME_BASE, PROPERTY_BASE, nameToUri, propertyToUri } from './canonical.js'

const CURIE = /^[a-zA-Z][\w-]*:[^\s]+$/
const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:[^\s]*$/
export const MAPPINGS = Object.freeze({
  "is a": "rdf:type",
  "a": "rdf:type",
  "type": "rdf:type",
  "label": "rdfs:label",
  "title": "rdfs:label"
})

export function namedNodeFromValue(value, fallbackBase) {
  const stringValue = String(value).trim()

  if (!stringValue) {
    throw new Error('Cannot build IRI from empty value')
  }

  if (stringValue.startsWith('[[') && stringValue.endsWith(']]')) {
    return nameToUri(stringValue.slice(2, -2).trim())
  }

  if (CURIE.test(stringValue)) return rdf.namedNode(stringValue)

  if (ABSOLUTE_IRI.test(stringValue)) return rdf.namedNode(stringValue)

  if (fallbackBase === NAME_BASE) {
    return nameToUri(stringValue)
  }

  if (fallbackBase === PROPERTY_BASE) {
    return propertyToUri(stringValue)
  }

  return rdf.namedNode(`${fallbackBase}${encodeURI(stringValue)}`)
}

export function objectTerm(value) {
  if (Array.isArray(value)) {
    return value.map(item => objectTerm(item))
  }

  if (typeof value === 'string') {
    if (value.startsWith('[[') && value.endsWith(']]')) {
      return namedNodeFromValue(value, NAME_BASE)
    }

    if (CURIE.test(value) || ABSOLUTE_IRI.test(value)) {
      return namedNodeFromValue(value, NAME_BASE)
    }
  }

  return rdf.literal(String(value))
}

export function plainLiteralTerm(value) {
  return rdf.literal(String(value))
}

export function subjectIri(frontmatter, sourceId = 'stdin') {
  if (frontmatter.uri && String(frontmatter.uri).trim()) {
    return namedNodeFromValue(frontmatter.uri, NAME_BASE)
  }
  const localName = basename(sourceId, '.md')
  return nameToUri(localName)
}

export function predicateIri(key, mappings = MAPPINGS) {
  const normalized = String(key).trim()
  const mappedKey = mappings[normalized] ?? mappings[normalized.toLowerCase()]
  if (mappedKey) {
    return namedNodeFromValue(mappedKey, PROPERTY_BASE)
  }

  return namedNodeFromValue(normalized, PROPERTY_BASE)
}
