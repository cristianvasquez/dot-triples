import rdf from 'rdf-ext'
import { getDocName, getNameFromPath, nameToURI, tokenToURI } from 'canonical-md'
import { isKnownAbsoluteIri } from './iri.js'

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

export function plainLiteralTerm(value) {
  return rdf.literal(String(value))
}

// The target of a wikilink, before resolution. Obsidian allows a display
// alias or image size after `|` ([[Note|Alias]], ![[image.png|411]]); that
// part is presentation and must not leak into the identifier. A leading `#`
// ([[#Heading]]) names a heading in the current note; it is kept here and
// resolved by the caller, which knows the note.
export function normalizeWikiConceptName(name) {
  const trimmed = String(name).trim()
  return trimmed.split('|', 1)[0].trim()
}

// Resolve a wikilink target to a name. `[[#Heading]]` becomes `<note>#Heading`,
// except when the heading is the note itself (its name, or its first H1),
// which resolves to the note.
export function resolveWikiName(target, { noteName, noteTitle } = {}) {
  if (!target.startsWith('#')) return target
  const heading = target.slice(1).trim()
  if (!heading) return ''
  if (!noteName) return heading
  if (heading === noteName || heading === noteTitle) return noteName
  return `${noteName}#${heading}`
}

export function objectTerm(value, context = {}) {
  if (Array.isArray(value)) {
    return value.map(item => objectTerm(item, context))
  }

  if (value && typeof value === 'object' && typeof value.termType === 'string') {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
      const name = resolveWikiName(normalizeWikiConceptName(trimmed.slice(2, -2)), context)
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
      // A known scheme is an IRI. Anything else (`schema:Person`,
      // `dprod:DataProduct`) is a name: mapQuad expands it when its prefix
      // is known, and otherwise it stays urn:name:.
      if (isKnownAbsoluteIri(trimmed)) return rdf.namedNode(trimmed)
      return nameToURI(trimmed)
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
