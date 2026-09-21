import rdf from 'rdf-ext'
import { getNameFromPath, nameToURI } from 'canonical-md'

// Naming for a JSON Canvas file.
//
// A canvas keeps its extension in its name: `urn:name:Board.canvas`, as
// `![[photo.png]]` gives `urn:name:photo.png`. Markdown is the exception that
// drops its extension, because a note and its file are two nodes there. A
// canvas has no note: the file is the whole resource, and an Obsidian link to
// it reads `[[Board.canvas]]`, so one IRI serves both.
//
// A node of the canvas is an anchor: `urn:name:Board.canvas%23<nodeId>`, the
// same `<resource>#<fragment>` shape a heading reference uses.

const CANVAS_EXTENSION = /\.canvas$/i
const SCHEME_WITH_AUTHORITY = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//
const INVALID_IRI_CHARS = /[\s<>"{}|\\^`]/

export function canvasNameFromPath (filePath) {
  return String(filePath).split(/[\\/]/).pop() ?? ''
}

// The canvas name: the file name, extension included. `name` wins over
// `file`, as in triplifier-md.
export function resolveCanvasName (options = {}) {
  const explicitName = String(options.name ?? '').trim()
  if (explicitName) return explicitName

  const file = String(options.file ?? options.sourceId ?? '').trim()
  if (!file) {
    throw new Error('triplifyCanvas requires a name or file')
  }

  return canvasNameFromPath(file)
}

// The display name: the file name without `.canvas`.
export function canvasLabel (canvasName) {
  return String(canvasName).replace(CANVAS_EXTENSION, '')
}

export function canvasNode (canvasName) {
  return nameToURI(canvasName)
}

export function anchorNode (canvasName, nodeId) {
  return nameToURI(`${canvasName}#${nodeId}`)
}

// What a `file` node points at. A Markdown file resolves to its note
// (`bob/Bob.md` -> `urn:name:Bob`); any other file keeps its extension
// (`houses/img.png` -> `urn:name:img.png`). A `subpath` (`#Methods`,
// `#^block-id`) names a part of it, giving the heading IRI a Markdown link
// would give.
export function fileTargetName (file, subpath) {
  const name = getNameFromPath(file)
  if (!name) return null

  const fragment = String(subpath ?? '').replace(/^#/, '').trim()
  return fragment ? `${name}#${fragment}` : name
}

export function urlNode (value) {
  const iri = String(value).trim()
  if (!iri || INVALID_IRI_CHARS.test(iri)) return null
  return rdf.namedNode(iri)
}

// An edge label that is already an absolute IRI is the predicate, verbatim.
// Anything else is `urn:token:<label>`, as a Markdown field key is, and
// triplifier-md's mapQuad resolves it: a mapping first, then a CURIE against
// a known prefix.
export function isAbsolutePredicateIri (label) {
  const trimmed = String(label).trim()
  if (INVALID_IRI_CHARS.test(trimmed)) return false
  return SCHEME_WITH_AUTHORITY.test(trimmed) || trimmed.startsWith('urn:')
}

// A W3C Media Fragments rectangle, in canvas coordinates. Canvas coordinates
// are signed and the origin is arbitrary, which a media fragment does not
// promise; the value is read back by a canvas, not by a media player.
export function mediaFragment (node) {
  const { x, y, width, height } = node
  const numbers = [x, y, width, height]
  if (!numbers.every(value => Number.isFinite(value))) return null
  return `xywh=${numbers.join(',')}`
}
