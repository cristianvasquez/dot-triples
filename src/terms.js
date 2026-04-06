import { basename } from 'node:path'
import { readFileSync } from 'node:fs'
import rdf from 'rdf-ext'

const NAME_BASE = 'urn:name:'
const PROPERTY_BASE = 'urn:property:'
const CURIE = /^[a-zA-Z][\w-]*:[^\s]+$/
const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:[^\s]*$/
const MAPPINGS = Object.freeze(
  JSON.parse(readFileSync(new URL('./mappings.json', import.meta.url), 'utf8'))
)

export function namedNodeFromValue(value, fallbackBase) {
  const stringValue = String(value).trim()

  if (!stringValue) {
    throw new Error('Cannot build IRI from empty value')
  }

  if (stringValue.startsWith('[[') && stringValue.endsWith(']]')) {
    return rdf.namedNode(`${NAME_BASE}${encodeURI(stringValue.slice(2, -2).trim())}`)
  }

  if (CURIE.test(stringValue)) return rdf.namedNode(stringValue)

  if (ABSOLUTE_IRI.test(stringValue)) return rdf.namedNode(stringValue)

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
  if (frontmatter.uri) return namedNodeFromValue(frontmatter.uri, NAME_BASE)
  const localName = basename(sourceId, '.md')
  return rdf.namedNode(`${NAME_BASE}${encodeURI(localName)}`)
}

export function predicateIri(key) {
  const mappedKey = MAPPINGS[key]
  if (mappedKey) {
    return namedNodeFromValue(mappedKey, PROPERTY_BASE)
  }

  return namedNodeFromValue(key, PROPERTY_BASE)
}
