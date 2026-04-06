import rdf from 'rdf-ext'
import {
  createLineTransform,
  createQuadTransform,
  parseTripleLine,
  serializeTripleLine
} from './ntriples.js'
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

export async function mapLine(line) {
  const quad = await parseTripleLine(line)
  if (!quad) return ''
  return serializeTripleLine(mapQuad(quad))
}

export async function mapping(input) {
  const parts = []

  for (const line of String(input).split('\n')) {
    parts.push(await mapLine(line))
  }

  return parts.join('\n')
}

export function createMappingTransform() {
  return createLineTransform(mapQuad)
}

export function createMappingQuadTransform() {
  return createQuadTransform(mapQuad)
}

export const internals = {
  expandCurie,
  mapLine,
  mapQuad
}
