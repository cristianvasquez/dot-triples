# A simpler and faster triplifier

This repo strips `vault-triplifier` down to the subset I actually use:

- YAML frontmatter
- Obsidian-style `predicate :: value` lines
- N-Triples output on stdout

It deliberately ignores heavier features like AST partitioning, selectors, canvases, and code-fence parsing.
The one structural rule kept from `vault-triplifier` is the default heading partitioning: `##` creates section entities and `###` creates nested sub-section entities.

## Usage

```bash
cat note.md | node src/cli.js
cat note.md | triplify
cat note.md | triplify | typed-literals
```

The CLI reads Markdown from stdin and emits N-Triples.

## Supported input

```md
---
uri: https://example.com/people/alice
title: Alice
tags: [person, staff]
active: true
---

role :: Product Manager
knows :: [[Bob Smith]]
born :: 2024-03-15
type :: schema:Person
```

## Current rules

- One Markdown document becomes one RDF subject.
- Default subject IRIs follow `vault-triplifier` and use `urn:name:<note-name>`.
- Default heading behavior follows `vault-triplifier`'s `headers-h2-h3` mode.
- `## Heading` creates a section subject like `urn:name:note#Heading`.
- `### Heading` creates a nested section subject like `urn:name:note#Parent#Heading`.
- Properties before the first `##` stay on the document subject.
- Properties inside a `##` or `###` section attach to that section subject.
- `frontmatter.uri` overrides the subject IRI.
- Every other frontmatter key becomes a predicate/object pair.
- Every `predicate :: value` line becomes a predicate/object pair.
- Default predicate IRIs use `urn:property:<field-name>`.
- Comma-separated values produce multiple triples.
- `[[Wiki Links]]` become `urn:name:<linked-note>` IRIs.
- Plain values stay plain string literals.
- Absolute IRIs, CURIEs like `schema:Person`, and `[[Wiki Links]]` are emitted as resources.
- Backticks keep values literal, but with the current syntax-only design they mainly help preserve commas or formatting.
- Fenced code blocks are ignored while scanning `::` fields.

## Optional filters

This repo also includes a separate `typed-literals` filter so typing stays outside the Markdown parser:

```bash
cat note.md | triplify | typed-literals
```

That filter upgrades plain literals into booleans, numbers, and date/dateTime literals when they match the expected lexical forms.

## Development

```bash
npm test
```
