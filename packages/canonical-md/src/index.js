import rdf from 'rdf-ext'
import { PREFIXES } from './prefixes.js'

export { PREFIXES }

// Shared canonical RDF term helpers for both Node and browser consumers.
// Keep this module standalone: no Node built-ins and no imports from other repo modules.

const namespaces = {
  name: rdf.namespace('urn:name:'),
  token: rdf.namespace('urn:token:'),
}

// The vocabulary of the document model, as @osg/model shapes/document.ttl
// states it. Deferred-semantics terms (urn:name:, urn:token:) are minted by
// the helpers below; the structural terms come from here.
const ns = {
  document: rdf.namespace('osg://vocab/document#'),
  resource: rdf.namespace('osg://vocab/resource#'),
  schema: rdf.namespace(PREFIXES.schema),
  dct: rdf.namespace(PREFIXES.dct),
  oa: rdf.namespace(PREFIXES.oa),
  rdf: rdf.namespace(PREFIXES.rdf),
  rdfs: rdf.namespace(PREFIXES.rdfs),
}

export const vocab = Object.freeze({
  type: ns.rdf.type,
  value: ns.rdf.value,
  label: ns.rdfs.label,
  File: ns.document.File,
  Resource: ns.resource.Resource,
  ResourceReference: ns.resource.ResourceReference,
  source: ns.resource.source,
  selector: ns.resource.selector,
  about: ns.schema.about,
  hasPart: ns.schema.hasPart,
  keywords: ns.schema.keywords,
  programmingLanguage: ns.schema.programmingLanguage,
  SoftwareSourceCode: ns.schema.SoftwareSourceCode,
  Quotation: ns.schema.Quotation,
  references: ns.dct.references,
  // Containment between two references into one document: the rectangle a
  // canvas group draws and the rectangles inside it. dct:hasPart, not
  // schema:hasPart, which the document domain reserves for a code block or a
  // quotation.
  dctHasPart: ns.dct.hasPart,
  created: ns.dct.created,
  modified: ns.dct.modified,
  conformsTo: ns.dct.conformsTo,
  FragmentSelector: ns.oa.FragmentSelector,
  TextQuoteSelector: ns.oa.TextQuoteSelector,
  exact: ns.oa.exact,
  // Fragment syntaxes a selector conforms to.
  OBSIDIAN_LINKS: rdf.namedNode('https://obsidian.md/help/links'),
  RFC5147: rdf.namedNode('http://tools.ietf.org/rfc/rfc5147'),
  JSON_CANVAS: rdf.namedNode('https://jsoncanvas.org/spec/1.0/'),
  MEDIA_FRAGMENTS: rdf.namedNode('http://www.w3.org/TR/media-frags/'),
})

// Keys the document model names. They are the default mappings of
// triplifier-md's mapQuad, so they apply to a frontmatter key and to a body
// field key alike; every other key stays a urn:token: predicate.
export const FRONTMATTER_TERMS = Object.freeze({
  title: vocab.label,
  tags: vocab.keywords,
  created: vocab.created,
  modified: vocab.modified,
})

function parseIdentifier(value, kind) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${kind} must be a non-empty string`)
  }
  if (value !== value.trim()) {
    throw new Error(`Value must be pre-trimmed, got: ${JSON.stringify(value)}`)
  }
  // Also rejects unpaired UTF-16 surrogates. Keep Node 18 compatibility.
  encodeURIComponent(value)
  return value
}

// JavaScript represents validated names and tokens as strings. The manifest
// gives them distinct types; these are the validation boundaries.
export function parseName(value) {
  return parseIdentifier(value, 'Name')
}

export function parseToken(value) {
  return parseIdentifier(value, 'Token')
}

export function nameToURI(s) {
  return namespaces.name[encodeURIComponent(parseName(s))]
}

function identifierFromURI(term, base, parse) {
  if (!term || term.termType !== 'NamedNode' || typeof term.value !== 'string') return null
  if (!term.value.startsWith(base)) return null
  try {
    return parse(decodeURIComponent(term.value.slice(base.length)))
  } catch {
    return null
  }
}

export function nameFromURI(term) {
  return identifierFromURI(term, namespaces.name().value, parseName)
}

export function tokenToURI(s) {
  return namespaces.token[encodeURIComponent(parseToken(s))]
}

export function tokenFromURI(term) {
  return identifierFromURI(term, namespaces.token().value, parseToken)
}

export function tokenToLiteral(s) {
  return rdf.literal(parseToken(s))
}

// A heading name is `<note>#<heading>`, split at the first '#'. A note name
// carries no '#'. Reversible: the IRI decodes to the text that produced it.
export function splitHeadingName(name) {
  const at = String(name).indexOf('#')
  if (at < 0) return { note: name, heading: null }
  return { note: name.slice(0, at), heading: name.slice(at + 1) }
}

// An RFC 5147 line range for 1-based inclusive lines. RFC 5147 counts line
// positions from 0, so line 10 alone is "line=9,10".
export function lineRange(firstLine, lastLine = firstLine) {
  if (!Number.isInteger(firstLine) || firstLine < 1 || !Number.isInteger(lastLine) || lastLine < firstLine) {
    throw new Error(`Invalid line range: ${firstLine}-${lastLine}`)
  }
  return `line=${firstLine - 1},${lastLine}`
}

// Selectors describe values independently of a source. Equal selectors can
// therefore be shared. Encode each component separately to avoid collisions
// between syntax, value, and source, and keep these out of urn:name: mapping.
function encodeSelectorValue(value) {
  if (typeof value !== 'string') throw new TypeError('Selector value must be a string')
  return encodeURIComponent(value)
}

function encodeNode(node) {
  if (node?.termType !== 'NamedNode' || typeof node.value !== 'string' || !node.value) {
    throw new TypeError('Selector syntax and reference source must be NamedNodes with non-empty IRIs')
  }
  return encodeURIComponent(node.value)
}

export function fragmentSelectorNode(value, conformsTo) {
  return rdf.namedNode(`urn:selector:fragment:${encodeNode(conformsTo)}:${encodeSelectorValue(value)}`)
}

export function textQuoteSelectorNode(text) {
  return rdf.namedNode(`urn:selector:quote:${encodeSelectorValue(text)}`)
}

// A reference selects a location in a particular source. Its identity changes
// when the location changes, even if the selected text remains the same.
export function fragmentReferenceNode(source, value, conformsTo) {
  return rdf.namedNode(`urn:reference:${encodeNode(source)}:${encodeNode(conformsTo)}:${encodeSelectorValue(value)}`)
}

export function getNameFromPath(filePath) {
  const fileName = String(filePath).split(/[\\/]/).pop() ?? ''
  return fileName.replace(/\.md$/i, '')
}

export function getDocName(name) {
  return `${parseName(name)}.md`
}

function pathToFileURL(filepath) {
  if (!filepath.startsWith('/') && !filepath.match(/^[A-Za-z]:/)) {
    filepath = '/' + filepath
  }

  const isWindowsPath = filepath.match(/^\/[A-Za-z]:/)

  if (isWindowsPath) {
    const [, drive, ...pathParts] = filepath.split('/')
    const encodedParts = pathParts.map(segment =>
      encodeURIComponent(segment).replace(/%2F/g, '/')
    )
    const encodedPath = [drive, ...encodedParts].join('/')
    return rdf.namedNode('file:///' + encodedPath)
  }

  const encodedPath = filepath.split('/')
    .map(segment => encodeURIComponent(segment).replace(/%2F/g, '/'))
    .join('/')
  return rdf.namedNode('file://' + encodedPath)
}

function fileURLToPath(term) {
  const fileUrl = term.value
  if (!fileUrl.startsWith('file://')) {
    throw new Error('URL must use file: protocol')
  }
  let path = fileUrl.slice(7)
  if (path.startsWith('/') && path[2] === ':') {
    path = path.slice(1)
  }
  return path.split('/').map(decodeURIComponent).join('/')
}

export {
  fileURLToPath,
  pathToFileURL,
}
