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

- A Markdown file produces a document node and concept nodes.
- If `name` is absent and `file` is present, the canonical note name is derived via `getNameFromPath(file)` from `canonical-md`.
- The document node is `urn:name:<name>.md`.
- The top concept node is `urn:name:<name>`.
- `##` and deeper headings materialize section concept nodes like `urn:name:<name>%23Section`.
- Properties before the first section heading attach to the document node until the first `#` heading materializes the top concept.
- Properties inside sections attach to that section concept.
- `[[Wiki Links]]` become `urn:name:` IRIs.
- Default predicates use `urn:token:`.
- Known CURIEs are preserved during parsing and expanded later.
- `label` and `title` stay plain string literals.
- Fenced code blocks suppress field parsing and emit `urn:code-block:<language>` triples.

## Pipeline

```text
markdown -> triplify -> curie expansion -> typed literals -> serialize
```

## Development

```bash
pnpm --filter triplifier-md test
pnpm --filter triplifier-md bench:workspace
```
