---
uuid: 6376f05a-c670-4ccb-9f68-a08f26d7ea59
repo-uri: osg://repo/github.com/cristianvasquez/dot-triples
repo-name: dot-triples
layout: node.js
tags: [repo/rdf]
repo-group: rdf
---

# dot-triples

dot-triples reads Markdown notes and JSON Canvas boards and writes RDF. The output follows one document model, so notes and canvases that refer to the same thing give the same IRI. You can read files one at a time, in any order, and merge the results into one graph.

For interfaces, behavior, usage, and known defects, see [spec/manifest.hs](spec/manifest.hs).

## The model

The model has four kinds of nodes:

| Node | IRI | Type |
|---|---|---|
| File | `urn:name:Alice.md` | `document:File` |
| Note | `urn:name:Alice` | `resource:Resource` |
| Heading | `urn:name:Alice#Skills` | `resource:ResourceReference` |
| Part (code block, blockquote) | `urn:reference:…` | `schema:SoftwareSourceCode` or `schema:Quotation` |

The file is `schema:about` the note and its headings. A heading has the note as `resource:source`. A heading or part has selectors that locate it in the text: an Obsidian link fragment, an RFC 5147 line range, and a text quote (Web Annotation `oa:` selectors).

A canvas is one file node, `urn:name:Board.canvas`. Each canvas node is an anchor, `urn:name:Board.canvas#<id>`, with a JSON Canvas id selector and a media fragment (`xywh=`). An anchor refers to what the canvas node shows: a note, a file, or a URL. An edge between two canvas nodes is a property between the things they show. A group contains the nodes inside its rectangle (`dct:hasPart`).

The structural terms come from the `document` and `resource` shapes of the external model (`osg://repo/192.168.68.58/OS/model`).

## Names and tokens

The reader does not decide what a word means. It writes two kinds of deferred identifiers:

- `urn:name:<text>` for a thing: a note, a heading, a file, a CURIE that is not resolved.
- `urn:token:<text>` for a word: a field key, a `[token]`.

`[[Alice#Skills]]` in any note and `## Skills` in `Alice.md` give the same IRI. This is how independent files join.

A mapping step then resolves what it can. Known prefixes expand CURIEs. A small table maps `title` and `tags` to `rdfs:label` and `schema:keywords`. Names and tokens that the mapping step does not resolve stay deferred. SPARQL CONSTRUCTs downstream give them classes and datatypes.

Values stay strings. The reader does not guess that `00123` is a number.

## Example

`Alice.md`:

````markdown
---
tags: [person]
---
# Alice
knows :: [[Bob]]
schema:jobTitle :: Engineer

## Skills
See [[Carol#Work]] and [friend].
````

Result (selectors removed):

```turtle
<urn:name:Alice.md> a document:File ;
  schema:about <urn:name:Alice>, <urn:name:Alice%23Skills> ;
  schema:keywords "person" .

<urn:name:Alice> a resource:Resource ;
  rdfs:label "Alice" ;
  <urn:token:knows> <urn:name:Bob> ;
  schema:jobTitle "Engineer" .

<urn:name:Alice%23Skills> a resource:ResourceReference ;
  rdfs:label "Skills" ;
  resource:source <urn:name:Alice> ;
  dct:references <urn:name:Carol%23Work>, <urn:token:friend> .
```

`knows` has no mapping, so it stays a token. `schema:jobTitle` expands because `schema` is a known prefix.

## Querying

`sparql-md` lets you write queries with the same names: `[[Bob]]`, `__knows__`, and `__THIS__` for the current note. It rewrites them to the IRIs above.

## Packages

- `canonical-md`: names, tokens, vocabulary, prefixes.
- `triplifier-md`: Markdown reader and `triplify` CLI.
- `triplifier-canvas`: Canvas reader and `triplify-canvas` CLI.
- `sparql-md`: query rewrite.
