import rdf from 'rdf-ext'
import { nameToURI, vocab } from 'canonical-md'
import { createInlineExtractor } from 'triplifier-md/inline'
import { containment } from './containment.js'
import {
  anchorNode,
  canvasLabel,
  canvasNode,
  fileTargetName,
  isAbsolutePredicateIri,
  mediaFragment,
  resolveCanvasName,
  urlNode,
} from './terms.js'

// A JSON Canvas file under the document model of @osg/model:
//
//   the canvas   <urn:name:Board.canvas>       a document:File; label; schema:about
//                                              every anchor it draws
//   an anchor    <urn:name:Board.canvas%23id>  a resource:ResourceReference: source
//                                              the canvas, a JSON Canvas fragment
//                                              selector (the node id, its identity)
//                                              and a media fragment (the rectangle)
//
// A node is an anchor and nothing more. It is not an entity: the entity, when
// there is one, is what the node points at -- the note behind a `file` node,
// the URL behind a `link` node. A `text` or `group` node points at nothing, so
// it stands for itself.
//
// An edge states a property between what its two ends point at. That is the
// point of the format here: dragging two notes onto a canvas and drawing a
// labelled arrow between them says
//
//   <urn:name:Bob> <urn:token:lives%20in> <urn:name:BobHouse>
//
// which merges with what the two notes state about themselves. An edge between
// two text cards states the same property between the two anchors.

const ARROW = 'arrow'

export function createCanvasProcessor (options = {}) {
  const { onQuad = () => {} } = options

  const canvasName = resolveCanvasName(options)
  const canvas = canvasNode(canvasName)

  // The Markdown inline syntax, shared with triplifier-md: a text card carries
  // the same `key :: value` fields and the same links as a note.
  const inline = createInlineExtractor({ onQuad })
  const { emit } = inline

  function describeFile (node, anchor) {
    const name = fileTargetName(node.file, node.subpath)
    if (!name) return null

    const target = nameToURI(name)
    emit(anchor, vocab.references, target)
    // A subpath makes the target a reference into the note; it gets the same
    // identity a [[Note#Heading]] link gives it.
    inline.describeHeadingIfAny(target)
    return target
  }

  function describeLink (node, anchor) {
    const target = urlNode(node.url)
    if (!target) return null

    emit(anchor, vocab.references, target)
    return target
  }

  function describeText (node, anchor) {
    const text = String(node.text ?? '')
    if (!text) return

    inline.emitQuoteSelector(anchor, text)
    let fence = null
    for (const line of text.split('\n')) {
      const marker = line.replace(/\r$/, '').match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
          fence = null
        }
        continue
      }
      if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
        fence = marker[1]
        continue
      }
      if (inline.field(line, anchor)) continue
      inline.references(line, anchor)
    }
  }

  function describeGroup (node, anchor) {
    const label = String(node.label ?? '').trim()
    if (label) emit(anchor, vocab.label, rdf.literal(label))
  }

  // Returns the term an edge should use for this node: what it points at, or
  // null when it points at nothing and the anchor stands for it.
  function describeNode (node, anchor) {
    switch (node.type) {
      case 'file':
        return describeFile(node, anchor)
      case 'link':
        return describeLink(node, anchor)
      case 'text':
        describeText(node, anchor)
        return null
      case 'group':
        describeGroup(node, anchor)
        return null
      default:
        return null
    }
  }

  // A label that is already an absolute IRI is the predicate. Anything else
  // follows the Markdown field rule: a mapping, then a CURIE against a known
  // prefix, then urn:token:. Whitespace is collapsed so that a label wrapped
  // over two lines in the canvas gives one predicate.
  function edgePredicate (label) {
    const text = String(label ?? '').trim().replace(/\s+/g, ' ')
    if (!text) return vocab.references
    if (isAbsolutePredicateIri(text)) return rdf.namedNode(text)
    return inline.resolvePredicate(text)
  }

  // Which way the property runs, from the arrowheads. JSON Canvas defaults are
  // fromEnd "none" and toEnd "arrow". Two arrowheads state the property both
  // ways; a plain line with no arrowhead reads from -> to.
  function emitEdge (edge, from, to) {
    const predicate = edgePredicate(edge.label)
    const fromArrow = (edge.fromEnd ?? 'none') === ARROW
    const toArrow = (edge.toEnd ?? ARROW) === ARROW

    if (fromArrow) emit(to, predicate, from)
    if (toArrow || !fromArrow) emit(from, predicate, to)
  }

  function write (canvasJson) {
    emit(canvas, vocab.type, vocab.File)
    emit(canvas, vocab.label, rdf.literal(canvasLabel(canvasName)))

    const nodes = Array.isArray(canvasJson?.nodes) ? canvasJson.nodes : []
    const edges = Array.isArray(canvasJson?.edges) ? canvasJson.edges : []

    // What each node id denotes, for an edge and for the group that holds it.
    // A node with no id is not addressable and is dropped; so is a repeated
    // id.
    const denotes = new Map()
    const placed = []

    for (const node of nodes) {
      const id = String(node?.id ?? '').trim()
      if (!id || denotes.has(id)) continue

      const anchor = anchorNode(canvasName, id)
      emit(anchor, vocab.type, vocab.ResourceReference)
      emit(anchor, vocab.source, canvas)
      emit(canvas, vocab.about, anchor)
      inline.emitFragmentSelector(anchor, id, vocab.JSON_CANVAS)

      const rectangle = mediaFragment(node)
      if (rectangle) inline.emitFragmentSelector(anchor, rectangle, vocab.MEDIA_FRAGMENTS)

      const term = describeNode(node, anchor) ?? anchor
      denotes.set(id, term)
      // Only a node the canvas draws can be held by a group.
      if (rectangle) placed.push({ node, anchor, term })
    }

    // The containment rule owns what a group holds; see containment.js.
    for (const [holder, part] of containment(placed)) {
      emit(holder, vocab.dctHasPart, part)
    }

    for (const edge of edges) {
      const from = denotes.get(String(edge?.fromNode ?? '').trim())
      const to = denotes.get(String(edge?.toNode ?? '').trim())
      // An edge to a node that is not in the file states nothing.
      if (!from || !to) continue
      emitEdge(edge, from, to)
    }
  }

  return { write }
}

export function parseCanvas (content) {
  if (Buffer.isBuffer(content)) return JSON.parse(content.toString('utf8'))
  if (content && typeof content === 'object') return content
  return JSON.parse(String(content))
}

export function triplifyCanvas (content, options = {}) {
  const quads = []
  const processor = createCanvasProcessor({
    ...options,
    onQuad (quad) {
      quads.push(quad)
    }
  })

  processor.write(parseCanvas(content))
  return quads
}
