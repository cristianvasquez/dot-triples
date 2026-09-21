import { mapQuad, typeQuad } from 'triplifier-md'
import { triplifyCanvas } from './triplify.js'

export { createCanvasProcessor, parseCanvas, triplifyCanvas } from './triplify.js'
export { area, containment, contains } from './containment.js'
export { createCanvasQuadTransform } from './streams.js'
export { PREFIXES, MAPPINGS } from 'triplifier-md'

export function canProcess (absolutePath) {
  return absolutePath.endsWith('.canvas')
}

export function triplifyToQuads (content, options = {}) {
  return triplifyCanvas(content, options).map(quad => typeQuad(mapQuad(quad, options)))
}
