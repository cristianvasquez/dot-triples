import rdf from 'rdf-ext'

// Shared canonical RDF term helpers for both Node and browser consumers.
// Keep this module standalone: no Node built-ins and no imports from other repo modules.

const namespaces = {
  name: rdf.namespace('urn:name:'),
  token: rdf.namespace('urn:token:'),
}

export const UNTYPED_TOKEN = rdf.namedNode('urn:token:_')

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
  if (s == null || s === '' || s === '_') return UNTYPED_TOKEN
  assertTrimmed(s)
  return namespaces.token[encodeURIComponent(s)]
}

export function tokenFromURI(term) {
  if (!term || term.termType !== 'NamedNode') return null
  if (term.value === UNTYPED_TOKEN.value) return null
  const base = namespaces.token().value
  if (!term.value.startsWith(base)) return null
  return decodeURIComponent(term.value.slice(base.length))
}

export function tokenToLiteral(s) {
  assertTrimmed(s)
  return rdf.literal(String(s))
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
