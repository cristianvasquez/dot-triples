---
uuid: 912ff0ce-471f-402f-8f1a-b6d9f92c0f37
repo-group: rdf
tags: [spec/rdf]
---

# canvas-model

The SHACL contract is the same one Markdown answers to: `shapes/document.ttl` and `shapes/resource.ttl` in [model](osg://repo/local:e8f91724f0402986bb4471229a092c12a0fdae49). This page says how an Obsidian [JSON Canvas](https://jsoncanvas.org) file maps onto it. No new class and no new vocabulary: a canvas is a document, a node is a reference into it, and the parts of a reference are selectors. See [[document-model]] for the Markdown half.

## Two kinds of nodes

**The canvas** is `urn:name:<name>.canvas`, a `document:File`. It keeps its extension, unlike a note. A Markdown file is two nodes, the file and the note it materialises, because `[[Alice]]` must resolve to the note from any file. A canvas has no such body: the file is the whole resource, and an Obsidian link to it reads `[[Board.canvas]]`. One IRI serves both.

**A node of the canvas** is an anchor: `urn:name:<name>.canvas%23<nodeId>`, a `resource:ResourceReference` whose `resource:source` is the canvas. The same `<resource>#<fragment>` shape a heading reference uses. The node id is the only name a canvas node has — it is opaque, it is stable across edits, and nothing else in the file identifies a rectangle.

## Selectors

An anchor carries two fragment selectors, and a text card a third selector for its content.

| Selector | Says | `dct:conformsTo` |
|---|---|---|
| `oa:FragmentSelector`, `rdf:value` the node id | which node: its identity | `https://jsoncanvas.org/spec/1.0/` |
| `oa:FragmentSelector`, `rdf:value` `xywh=x,y,w,h` | where the rectangle is | `http://www.w3.org/TR/media-frags/` |
| `oa:TextQuoteSelector`, `oa:exact` the text | what the card says | — |

```
<urn:name:Board.canvas%2305f8fdf93ab87df8>  rdf:type          resource:ResourceReference
<urn:name:Board.canvas%2305f8fdf93ab87df8>  resource:source   <urn:name:Board.canvas>
<urn:name:Board.canvas%2305f8fdf93ab87df8>  resource:selector [ a oa:FragmentSelector ; rdf:value "05f8fdf93ab87df8" ; dct:conformsTo <https://jsoncanvas.org/spec/1.0/> ]
<urn:name:Board.canvas%2305f8fdf93ab87df8>  resource:selector [ a oa:FragmentSelector ; rdf:value "xywh=-1541,-1233,250,56" ; dct:conformsTo <http://www.w3.org/TR/media-frags/> ]
<urn:name:Board.canvas%2305f8fdf93ab87df8>  resource:selector [ a oa:TextQuoteSelector ; oa:exact "## Bob" ]
<urn:name:Board.canvas>                     schema:about      <urn:name:Board.canvas%2305f8fdf93ab87df8>
```

A media fragment is written with the canvas's own coordinates, which are signed and have an arbitrary origin. The value is read back by a canvas, not by a media player.

## An anchor is not an entity

A node is a rectangle. What it points at is the entity, when there is one.

| Node type | Points at | Predicate |
|---|---|---|
| `file` | the note: `bob/Bob.md` gives `urn:name:Bob`, `houses/img.png` gives `urn:name:img.png` | `dct:references` |
| `file` with `subpath` | the heading: `#Bio` gives `urn:name:Bob%23Bio`, described as a Markdown link describes it | `dct:references` |
| `link` | its URL when the scheme is known, else `urn:name:<url>`; nothing when the URL has characters no IRI may carry | `dct:references` |
| `text` | nothing; the anchor stands for it | — |
| `group` | nothing; the anchor stands for it | — |

`dct:references`, not `schema:about`: the document domain types every subject of `schema:about` as a `document:File`, so the canvas alone may use it.

## Edges

An edge states a property between what its two ends point at. This is why a canvas is worth triplifying: two notes dragged onto a board and one labelled arrow give a property that merges with what the two notes state about themselves.

```
Bob.md  --lives in-->  houses/BobHouse.md
```

```
<urn:name:Bob>  <urn:token:lives%20in>  <urn:name:BobHouse>
```

The label resolves exactly as a Markdown field key does, so the same drawing means the same thing on either side of the vault:

| Label | Predicate |
|---|---|
| an IRI with a known scheme, `https://schema.org/knows` | the IRI |
| a key in the mappings | the mapped IRI, by the mapping step |
| a CURIE against a known prefix, `rdfs:seeAlso` | `http://www.w3.org/2000/01/rdf-schema#seeAlso`, by the mapping step |
| anything else, `lives in` | `urn:token:lives%20in` |
| no label | `dct:references` |

Whitespace in a label is collapsed, so a label wrapped over two lines gives one predicate. An edge to a node id that is not in the file states nothing.

### Direction

From the arrowheads. JSON Canvas defaults are `fromEnd: "none"` and `toEnd: "arrow"`.

| `fromEnd` | `toEnd` | Stated |
|---|---|---|
| none | arrow | from → to |
| arrow | none | to → from |
| arrow | arrow | both |
| none | none | from → to |

## Groups

A group is a rectangle with a label; its members are the nodes drawn inside it. JSON Canvas has no membership field, so containment is the one relation computed rather than read: it is geometric, computed once here rather than left to a consumer to derive from four literals. It is a rule of its own, and `triplifier-canvas/src/containment.js` holds it.

A group holds what the node points at, the same term an edge to that node uses: the note behind a `file` node, the URL behind a `link` node, the anchor itself for a text card or a group, which point at nothing.

```
<urn:name:Board.canvas%23outer>  rdfs:label    "Entities"
<urn:name:Board.canvas%23outer>  dct:hasPart   <urn:name:Board.canvas%23inner>
<urn:name:Board.canvas%23inner>  dct:hasPart   <urn:name:Board.canvas%23card>
<urn:name:Board.canvas%23inner>  dct:hasPart   <urn:name:Bob>
```

Only the smallest containing group, so nesting nests and the rest is its transitive closure. `dct:hasPart`, not `schema:hasPart`, which the document domain reserves for a code block or a quotation. A node in no group gets nothing: the canvas already lists it with `schema:about`, and the anchor already names the canvas as its source.

This version of the rule is geometry and nothing else, with limits that stay until it is redone: two groups with the same rectangle hold each other, so the nesting is not always a tree; a tie between two containers of equal area is broken by the node order in the file; a degenerate rectangle (zero or negative size) is not rejected; and a node that sticks out of a group by one pixel is in no group.

A group label is a label. It is not read as a CURIE and it does not name an entity, unlike the prototype this replaces.

## Text cards

The text of a card is Markdown, and it is parsed by the same code as a note: `triplifier-md/inline`, which owns the `key :: value` and link syntax. Fields and references attach to the anchor.

```
## Bob
role :: Product Manager
knows :: [[Alice]]
```

```
<urn:name:Board.canvas%23n1>  resource:selector  [ a oa:TextQuoteSelector ; oa:exact "## Bob\nrole :: Product Manager\nknows :: [[Alice]]" ]
<urn:name:Board.canvas%23n1>  urn:token:role     "Product Manager"
<urn:name:Board.canvas%23n1>  urn:token:knows    <urn:name:Alice>
```

A heading in a card is not a note and does not name one. There is no line selector: a card is not a line-addressed document, and its node id already locates it.

## What is deferred

- An anchor for the edge itself. An edge has an id, so it could be addressed; nothing needs it yet.
- Node and edge colour.
- A wrapping triplifier that resolves `urn:name:` to a `file://` or `obsidian://` URI and places the quads in a graph, as the Markdown side has.
