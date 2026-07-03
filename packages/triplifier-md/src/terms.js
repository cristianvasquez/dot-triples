import rdf from 'rdf-ext'
import { UNTYPED_TOKEN, getDocName, getNameFromPath, metaToURI, nameToURI, tokenToURI } from 'canonical-md'

const CURIE = /^[a-zA-Z][\w-]*:[^\s]+$/
const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:[^\s<>"{}|\\^`]*$/
const INVALID_IRI_CHARS = /[\s<>"{}|\\^`]/

export function resolveName(options = {}) {
  const explicitName = String(options.name ?? '').trim()
  if (explicitName) return explicitName

  const file = String(options.file ?? options.sourceId ?? '').trim()
  if (!file) {
    throw new Error('triplify requires a name or file')
  }

  return getNameFromPath(file)
}

export function documentName(options = {}) {
  return getDocName(resolveName(options))
}

export function topConceptName(options = {}) {
  return resolveName(options)
}

export function documentNode(options = {}) {
  return nameToURI(documentName(options))
}

export function topConceptNode(options = {}) {
  return nameToURI(topConceptName(options))
}

export function sectionConceptNode(options, headingText) {
  return nameToURI(`${topConceptName(options)}#${headingText}`)
}

export function owningDocumentNodeForConceptName(conceptName) {
  const ownerName = conceptName.split('#', 1)[0]
  return nameToURI(getDocName(ownerName))
}

export function predicateNode(key) {
  return tokenToURI(String(key).trim())
}

export function metaPredicateNode(key) {
  return metaToURI(String(key).trim())
}

export function plainLiteralTerm(value) {
  return rdf.literal(String(value))
}

export function normalizeWikiConceptName(name) {
  const trimmed = String(name).trim()
  // Obsidian wikilinks/embeds allow a trailing display alias or image size
  // after `|` (e.g. [[Note|Alias]], ![[image.png|411]]). The link target is
  // the part before the first `|`; the alias/size is presentation only and
  // must not leak into the concept identifier.
  const target = trimmed.split('|', 1)[0].trim()
  if (target.startsWith('#')) return target.slice(1).trim()
  return target
}

export function objectTerm(value) {
  if (Array.isArray(value)) {
    return value.map(item => objectTerm(item))
  }

  if (value && typeof value === 'object' && typeof value.termType === 'string') {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
      const name = normalizeWikiConceptName(trimmed.slice(2, -2))
      // Empty/whitespace-only wikilink (e.g. "[[ ]]") is not a reference;
      // keep it as a plain literal rather than throwing on an empty name.
      if (name) return nameToURI(name)
      return rdf.literal(String(value))
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const token = trimmed.slice(1, -1).trim()
      if (token) return tokenToURI(token)
      return rdf.literal(String(value))
    }

    if (CURIE.test(trimmed) || ABSOLUTE_IRI.test(trimmed)) {
      if (INVALID_IRI_CHARS.test(trimmed)) {
        throw new Error(`Invalid IRI (contains forbidden characters): ${trimmed}`)
      }
      return rdf.namedNode(trimmed)
    }
  }

  return rdf.literal(String(value))
}

export function urlNode(value) {
  const iri = String(value).trim()
  if (INVALID_IRI_CHARS.test(iri)) {
    throw new Error(`Invalid IRI (contains forbidden characters): ${iri}`)
  }
  return rdf.namedNode(iri)
}

export function isAbsoluteIri(value) {
  return ABSOLUTE_IRI.test(String(value).trim())
}

export function wikiConceptName(value) {
  const trimmed = String(value).trim()
  if (!trimmed.startsWith('[[') || !trimmed.endsWith(']]')) return null
  return normalizeWikiConceptName(trimmed.slice(2, -2))
}

export { UNTYPED_TOKEN }
