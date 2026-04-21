import { triplify } from './triplify.js'
import { mapQuad, PREFIXES } from './curie-expansion.js'
import { typeQuad } from './typed-literals.js'
export {
  fileURLToPath,
  nameFromUri,
  nameToUri,
  pathToFileURL,
  propertyFromUri,
  propertyToUri
} from './canonical.js'

export { createTriplifyQuadTransform, createCurieExpansionQuadTransform, createTypedLiteralsQuadTransform } from './streams.js'
export { PREFIXES } from './curie-expansion.js'

export function canProcess(absolutePath) {
  return absolutePath.endsWith('.md')
}

export function triplifyToQuads(content, options = {}) {
  return triplify(content, options).map(quad => typeQuad(mapQuad(quad)))
}
