import rdf from 'rdf-ext'

// Shared canonical RDF term helpers for both Node and browser consumers.
// Keep this module standalone: no Node built-ins and no imports from other repo modules.

function toUri(text, namespace) {
  return namespace[encodeURI(text)]
}

function fromUri(term, namespace) {
  if (!term || term.termType !== 'NamedNode') {
    return null
  }

  const base = namespace().value
  if (!term.value.startsWith(base)) {
    return null
  }

  const suffix = term.value.slice(base.length)
  return decodeURI(suffix)
}

const namespaces = {
  property: rdf.namespace('urn:property:'),
  name: rdf.namespace('urn:name:')
}

const NAME_BASE = namespaces.name().value
const PROPERTY_BASE = namespaces.property().value

function propertyToUri(property) {
  return toUri(property, namespaces.property)
}

function propertyFromUri(term) {
  return fromUri(term, namespaces.property)
}

function nameToUri(name) {
  return toUri(name, namespaces.name)
}

function nameFromUri(term) {
  return fromUri(term, namespaces.name)
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
  NAME_BASE,
  PROPERTY_BASE,
  fileURLToPath,
  nameFromUri,
  nameToUri,
  pathToFileURL,
  propertyFromUri,
  propertyToUri
}
