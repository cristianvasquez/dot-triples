import { basename } from 'node:path'
import rdf from 'rdf-ext'
import { UNTYPED_TOKEN, nameToURI, tokenToURI } from 'canonical-md'

const CURIE = /^[a-zA-Z][\w-]*:[^\s]+$/
const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:[^\s]*$/

export function resolveName(options = {}) {
  const explicitName = String(options.name ?? '').trim()
  if (explicitName) return explicitName

  const file = String(options.file ?? options.sourceId ?? '').trim()
  if (!file) {
    throw new Error('triplify requires a name or file')
  }

  const base = basename(file)
  return base.endsWith('.md') ? base.slice(0, -3) : base
}

export function documentName(options = {}) {
  return `${resolveName(options)}.md`
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
  return nameToURI(`${ownerName}.md`)
}

export function predicateNode(key) {
  return tokenToURI(String(key).trim())
}

export function plainLiteralTerm(value) {
  return rdf.literal(String(value))
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
      return nameToURI(trimmed.slice(2, -2).trim())
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return tokenToURI(trimmed.slice(1, -1).trim())
    }

    if (CURIE.test(trimmed) || ABSOLUTE_IRI.test(trimmed)) {
      return rdf.namedNode(trimmed)
    }
  }

  return rdf.literal(String(value))
}

export function urlNode(value) {
  return rdf.namedNode(String(value).trim())
}

export function isAbsoluteIri(value) {
  return ABSOLUTE_IRI.test(String(value).trim())
}

export function wikiConceptName(value) {
  const trimmed = String(value).trim()
  if (!trimmed.startsWith('[[') || !trimmed.endsWith(']]')) return null
  return trimmed.slice(2, -2).trim()
}

export { UNTYPED_TOKEN }
