import rdf from 'rdf-ext'
import { Transform } from 'node:stream'
import { PREFIXES } from './prefixes.js'

function expandCurie(curie) {
  const separator = curie.indexOf(':')
  const prefix = curie.slice(0, separator)
  const suffix = curie.slice(separator + 1)
  const base = PREFIXES[prefix]
  return base ? `${base}${suffix}` : null
}

function mapTerm(term) {
  if (term.termType !== 'NamedNode') return term

  const expanded = expandCurie(term.value)
  return expanded ? rdf.namedNode(expanded) : term
}

export function mapQuad(quad) {
  return rdf.quad(
    mapTerm(quad.subject),
    mapTerm(quad.predicate),
    mapTerm(quad.object)
  )
}

export function createMappingQuadTransform() {
  return new Transform({
    objectMode: true,
    transform(quad, encoding, callback) {
      try {
        callback(null, mapQuad(quad))
      } catch (error) {
        callback(error)
      }
    }
  })
}

export const internals = {
  expandCurie
}
