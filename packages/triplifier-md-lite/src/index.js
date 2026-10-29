import { mapQuad } from 'triplifier-md'
import { triplify } from './triplify.js'

export { triplify }

export function canProcess(absolutePath) {
  return absolutePath.endsWith('.md')
}

// mapQuad resolves keys and CURIEs as in triplifier-md (title -> rdfs:label).
export function triplifyToQuads(content, options = {}) {
  return triplify(content, options).map(quad => mapQuad(quad, options))
}
