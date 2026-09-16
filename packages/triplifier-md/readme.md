---
uuid: a5f6c8bc-fac6-4478-a837-ffc17e1f0b39
layout: node.js
tags: [repo/osg, package/rdf]
repo-group: rdf
---

# triplifier-md

`triplifier-md` turns Markdown into RDF quads and N-Triples.

## Boundary

This package owns:

- frontmatter parsing
- Obsidian-style `predicate :: value` parsing
- section/heading partitioning
- CURIE expansion
- typed-literal upgrades
- stream transforms
- N-Triples serialization
- the `triplify` CLI

The inline layer -- `key :: value` fields, prose references, selectors and the heading identity a link implies -- is `triplifier-md/inline`. [[triplifier-canvas]] reuses it for the text cards of a canvas, so there is one implementation of the syntax.

## Usage

```bash
cat note.md | triplify
cat note.md | node packages/triplifier-md/src/cli.js
```

## Example Input

```md
---
uri: https://example.com/people/alice
title: Alice
tags: [person, staff]
---

role :: Product Manager
knows :: [[Bob Smith]]
born :: 2024-03-15
type :: schema:Person
```

## Behavior

Output follows the document domain of `@osg/model` (`shapes/document.ttl`); see [[document-model]].

- A Markdown file produces a file node, a note node and heading nodes.
- If `name` is absent and `file` is present, the note name is derived via `getNameFromPath(file)` from `canonical-md`.
- The file is `urn:name:<name>.md`, a `document:File`, and lists what it materialised with `schema:about`.
- The note is `urn:name:<name>`, a `resource:Resource`, materialised by the first `#` heading.
- Later headings are `urn:name:<name>%23Heading`, references into the note: source, an Obsidian fragment selector, a line-range selector and a quote of the heading line.
- Fields before the first `#` heading attach to the file; fields under a heading attach to that heading.
- `[[Wiki Links]]` become `urn:name:` IRIs; a `[[Note#Heading]]` link also emits the heading's source and fragment selector.
- Field predicates use `urn:token:`; prose references use `dct:references`.
- Known CURIEs are preserved during parsing and expanded later.
- `title`, `tags`, `created` and `modified` frontmatter keys map to `rdfs:label`, `schema:keywords`, `dct:created`, `dct:modified`.
- Fenced code blocks and blockquotes are parts: references with a line range and a quote, typed `schema:SoftwareSourceCode` or `schema:Quotation`.

## Pipeline

```text
markdown -> triplify -> curie expansion -> typed literals -> serialize
```

## Development

```bash
pnpm --filter triplifier-md test
pnpm --filter triplifier-md bench:workspace
```
