---
uuid: 68dc9035-aec0-472b-8600-873e2222a95c
layout: node.js
tags: [repo/osg, package/rdf]
repo-group: rdf
---

# triplifier-canvas

`triplifier-canvas` turns an Obsidian [JSON Canvas](https://jsoncanvas.org) file into RDF quads and N-Triples.

The point of the package is the edges. Drag two notes onto a canvas, draw a labelled arrow between them, and the label becomes a property between the two notes — the same notes `triplifier-md` describes, so the two graphs merge.

## Boundary

This package owns:

- JSON Canvas node and edge reading
- anchors: a node as a reference into the canvas, with its id and its rectangle as selectors
- edge labels as predicates
- geometric group containment
- the `triplify-canvas` CLI

Markdown inside a text card is parsed by `triplifier-md/inline`, which is the one implementation of the `key :: value` and link syntax.

## Usage

```bash
cat Board.canvas | triplify-canvas Board.canvas
cat Board.canvas | node packages/triplifier-canvas/src/cli.js Board.canvas
```

```js
import { triplifyToQuads } from 'triplifier-canvas'

const quads = triplifyToQuads(content, { file: 'boards/Board.canvas' })
```

## Behavior

Output follows the document domain of `@osg/model` (`shapes/document.ttl` and `shapes/resource.ttl`); see [[canvas-model]].

- The canvas is `urn:name:<name>.canvas`, a `document:File`. It keeps its extension: a canvas has no note behind it, and an Obsidian link reads `[[Board.canvas]]`.
- Every node is an anchor, `urn:name:<name>.canvas%23<nodeId>`, a `resource:ResourceReference` whose source is the canvas. Its selectors are the node id (JSON Canvas) and the rectangle (`xywh=`, W3C Media Fragments). The canvas lists each anchor with `schema:about`.
- A node is not an entity. What it points at is: a `file` node points at the note (`bob/Bob.md` gives `urn:name:Bob`), a `link` node at its URL, with `dct:references`. A `text` or `group` node points at nothing and stands for itself.
- A `text` card carries its text as an `oa:TextQuoteSelector`, and its `key :: value` fields and links attach to the anchor.
- A `group` carries its label as `rdfs:label` and holds, with `dct:hasPart`, each node drawn inside it. Only the smallest containing group, so nested groups nest. A group holds what a node points at: the note behind a `file` node, the URL behind a `link` node, the anchor itself for a text card or a group. Containment is geometric and is the one relation computed rather than read; it lives in `src/containment.js`.
- An edge states a property between what its two ends point at. The label resolves like a field key: `options.mappings` first, then a CURIE against a known prefix, then `urn:token:<label>`. A label that is already an absolute IRI is the predicate. An unlabelled edge is `dct:references`.
- The arrowheads give the direction. JSON Canvas defaults to an arrow at the `to` end. Two arrowheads state the property both ways; a line with no arrowhead reads `from` to `to`.
- An edge to a node id that is not in the file states nothing.

## Example

```json
{
  "nodes": [
    { "id": "n1", "type": "file", "file": "bob/Bob.md", "x": 0, "y": 0, "width": 400, "height": 400 },
    { "id": "n2", "type": "file", "file": "houses/BobHouse.md", "x": 0, "y": -500, "width": 400, "height": 158 }
  ],
  "edges": [
    { "id": "e1", "fromNode": "n1", "toNode": "n2", "label": "lives in" }
  ]
}
```

```
<urn:name:Bob> <urn:token:lives%20in> <urn:name:BobHouse> .
```

plus the canvas, the two anchors and their selectors.

## Pipeline

```text
canvas -> triplify -> curie expansion -> typed literals -> serialize
```

JSON cannot be read line by line, so `createCanvasQuadTransform` buffers the whole file and emits every quad on flush. It is a stream for symmetry with the Markdown pipeline, not for incrementality.

## Development

```bash
pnpm --filter triplifier-canvas test
```
