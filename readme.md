# A simpler and faster triplifier

This repo strips `vault-triplifier` down to the subset I actually use:

- YAML frontmatter
- Obsidian-style `predicate :: value` lines
- N-Triples output on stdout

It deliberately avoids most of the heavier machinery from `vault-triplifier`.
The goal is not full feature parity. The goal is a smaller tool that preserves the Markdown-to-RDF behavior that is actually used most often.

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
- `### Heading` creates a section subject like `urn:name:note#Heading`.
- Properties before the first `##` stay on the document subject.
- Properties inside a `##` or `###` section attach to that section subject.
- `frontmatter.uri` overrides the subject IRI.
- Every other frontmatter key becomes a predicate/object pair.
- Every `predicate :: value` line becomes a predicate/object pair.
- Default predicate IRIs use `urn:property:<field-name>`.
- Names and properties keep the reversible URI convention from `vault-triplifier`.
- Comma-separated values produce multiple triples.
- `[[Wiki Links]]` become `urn:name:<linked-note>` IRIs.
- Plain values stay plain string literals.
- Absolute IRIs, CURIEs like `schema:Person`, and `[[Wiki Links]]` are emitted as resources.
- `rdfs:label` values always stay plain string literals.
- Lines like `- property :: value` are accepted; list markers are ignored before field parsing.
- Backticks keep values literal, but with the current syntax-only design they mainly help preserve commas or formatting.
- Fenced code blocks are ignored while scanning `::` fields.

## Optional filters

This repo also includes a separate `typed-literals` filter so typing stays outside the Markdown parser:

```bash
cat note.md | triplify | typed-literals
```

That filter upgrades plain literals into booleans, numbers, and date/dateTime literals when they match the expected lexical forms.

## Included

- Document-level triples from YAML frontmatter.
- Section-level triples from `##` and `###` headings.
- Obsidian-style `predicate :: value` fields.
- `is a`, `a`, and `type` mapping to `rdf:type`.
- Reversible `urn:name:` and `urn:property:` URI generation.
- Separate post-processing with `typed-literals`.
- A comparison script against the original `vault-triplifier`.

## Left Out

- Explicit triple syntax like `[[Alice]] :: manages :: [[Bob]]`.
- Inline parenthetical fields like `Alice (role :: facilitator)`.
- Configurable partitioning modes other than the default `headers-h2-h3` behavior.
- Selectors, offsets, and annotation metadata.
- Document provenance and file-representation triples.
- Canvas processing.
- Code-block parsing as RDF.
- Property mappings as a built-in stage.
- Section-level `uri :: ...` overrides.
- Full Markdown AST parsing.

## Comparison

This repo includes a practical diff script to compare the smaller tool with the original implementation on real notes:

```bash
npm run compare -- --typed /path/to/note.md
```

The comparison is not a raw text diff of the full RDF output. It filters the larger graph down to the subset this repo is meant to preserve, then reports:

- triples missing in the small tool
- triples added by the small tool

This is meant to support "close enough for the useful subset", not bit-for-bit equivalence.

## Development

```bash
npm test
```
