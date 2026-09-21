import { triplify } from './triplify.js'
import { mapQuad } from './curie-expansion.js'
import { typeQuad } from './typed-literals.js'

export { createTriplifyQuadTransform, createMappingQuadTransform, createTypedLiteralsQuadTransform } from './streams.js'
export { mapQuad, PREFIXES, MAPPINGS } from './curie-expansion.js'
export { typeQuad } from './typed-literals.js'

export function canProcess(absolutePath) {
  return absolutePath.endsWith('.md')
}

export function triplifyToQuads(content, options = {}) {
  return triplify(content, options).map(quad => typeQuad(mapQuad(quad, options)))
}
