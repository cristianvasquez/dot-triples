import rdf from 'rdf-ext'

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
  schema: rdf.namespace('https://schema.org/'),
  dct: rdf.namespace('http://purl.org/dc/terms/'),
  oa: rdf.namespace('http://www.w3.org/ns/oa#'),
  rdf: rdf.namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
  rdfs: rdf.namespace('http://www.w3.org/2000/01/rdf-schema#'),
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
  created: ns.dct.created,
  modified: ns.dct.modified,
  conformsTo: ns.dct.conformsTo,
  FragmentSelector: ns.oa.FragmentSelector,
  TextQuoteSelector: ns.oa.TextQuoteSelector,
  exact: ns.oa.exact,
  // Fragment syntaxes a selector conforms to.
  OBSIDIAN_LINKS: rdf.namedNode('https://obsidian.md/help/links'),
  RFC5147: rdf.namedNode('http://tools.ietf.org/rfc/rfc5147'),
})

// Frontmatter keys the document model names. Applied to frontmatter only;
// every other key is a urn:token: predicate.
export const FRONTMATTER_TERMS = Object.freeze({
  title: vocab.label,
  tags: vocab.keywords,
  created: vocab.created,
  modified: vocab.modified,
})

function assertTrimmed(s) {
  if (typeof s === 'string' && s !== s.trim()) {
    throw new Error(`Value must be pre-trimmed, got: ${JSON.stringify(s)}`)
  }
}

export function nameToURI(s) {
  if (s == null || s === '') {
    throw new Error('Name must not be null, undefined, or empty')
  }
  assertTrimmed(s)
  return namespaces.name[encodeURIComponent(s)]
}

export function nameFromURI(term) {
  if (!term || term.termType !== 'NamedNode') return null
  const base = namespaces.name().value
  if (!term.value.startsWith(base)) return null
  return decodeURIComponent(term.value.slice(base.length))
}

export function tokenToURI(s) {
  if (s == null || s === '') {
    throw new Error('Token must not be null, undefined, or empty')
  }
  assertTrimmed(s)
  return namespaces.token[encodeURIComponent(s)]
}

export function tokenFromURI(term) {
  if (!term || term.termType !== 'NamedNode') return null
  const base = namespaces.token().value
  if (!term.value.startsWith(base)) return null
  return decodeURIComponent(term.value.slice(base.length))
}

export function tokenToLiteral(s) {
  assertTrimmed(s)
  return rdf.literal(String(s))
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

export function getNameFromPath(filePath) {
  const fileName = String(filePath).split(/[\\/]/).pop() ?? ''
  return fileName.replace(/\.md$/i, '')
}

export function getDocName(name) {
  if (name == null || name === '') {
    throw new Error('Name must not be null, undefined, or empty')
  }
  assertTrimmed(name)
  return `${name}.md`
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
