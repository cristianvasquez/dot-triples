import rdf from 'rdf-ext'
import { createTriplifyProcessor } from './triplify.js'
import { mapQuad, PREFIXES } from './curie-expansion.js'
import { typeQuad } from './typed-literals.js'
import { NAME_BASE, PROPERTY_BASE } from './terms.js'

export { createTriplifyQuadTransform, createCurieExpansionQuadTransform, createTypedLiteralsQuadTransform } from './streams.js'
export { PREFIXES } from './curie-expansion.js'

export function pathToFileURL(absolutePath) {
  return rdf.namedNode('file://' + absolutePath)
}

export function fileURLToPath(term) {
  return term.value.replace(/^file:\/\//, '')
}

export function nameToUri(name) {
  return rdf.namedNode(`${NAME_BASE}${encodeURIComponent(name)}`)
}

export function nameFromUri(term) {
  if (!term || term.termType !== 'NamedNode') return null
  const { value } = term
  if (!value.startsWith(NAME_BASE)) return null
  return decodeURIComponent(value.slice(NAME_BASE.length))
}

export function propertyToUri(property) {
  return rdf.namedNode(`${PROPERTY_BASE}${encodeURIComponent(property)}`)
}

export function propertyFromUri(term) {
  if (!term || term.termType !== 'NamedNode') return null
  const { value } = term
  if (!value.startsWith(PROPERTY_BASE)) return null
  return decodeURIComponent(value.slice(PROPERTY_BASE.length))
}

export function canProcess(absolutePath) {
  return absolutePath.endsWith('.md')
}

export function triplifyToQuads(content, options = {}) {
  const quads = []
  const processor = createTriplifyProcessor({
    ...options,
    onQuad(quad) {
      quads.push(typeQuad(mapQuad(quad)))
    }
  })

  for (const line of String(content).split('\n')) {
    processor.writeLine(line)
  }

  processor.end()
  return quads
}
