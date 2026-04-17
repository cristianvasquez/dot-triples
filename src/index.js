import { createTriplifyProcessor } from './triplify.js'
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
