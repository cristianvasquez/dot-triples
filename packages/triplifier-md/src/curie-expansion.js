import rdf from 'rdf-ext'
import { PREFIXES } from './prefixes.js'

export { PREFIXES }

function expandCurie(curie, prefixes = PREFIXES) {
  const separator = curie.indexOf(':')
  const prefix = curie.slice(0, separator)
  const suffix = curie.slice(separator + 1)
  const base = prefixes[prefix]
  return base ? `${base}${suffix}` : null
}

function mapTerm(term, prefixes) {
  if (term.termType !== 'NamedNode') return term

  const expanded = expandCurie(term.value, prefixes)
  return expanded ? rdf.namedNode(expanded) : term
}

export function mapQuad(quad, prefixes = PREFIXES) {
  return rdf.quad(
    mapTerm(quad.subject, prefixes),
    mapTerm(quad.predicate, prefixes),
    mapTerm(quad.object, prefixes),
    quad.graph
  )
}

export const internals = {
  expandCurie
}
