---
uuid: a5f6c8bc-fac6-4478-a837-ffc17e1f0b39
repo-uri: osg://repo/local:b4537a2796e64312b60024322e090f4195eb0dd2
repo-name: dot-triples
---

# [A simpler and faster triplifier](osg://repo/local:b4537a2796e64312b60024322e090f4195eb0dd2)

This repo strips `vault-triplifier` down to the subset I actually use:

- YAML frontmatter
- Obsidian-style `predicate :: value` lines
- N-Triples output on stdout

It deliberately avoids most of the heavier machinery from `vault-triplifier`.

## Usage

```bash
cat note.md | node src/cli.js
cat note.md | triplify
```

The CLI reads Markdown from stdin and runs one in-process pipeline:

`triplify -> mapping -> typed-literals -> serialize`.

It emits final N-Triples on stdout.

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

Code blocks with an info string are also preserved:

````md
## Queries

```sparql
SELECT * WHERE {
  ?s ?p ?o .
}
```
````

That emits a section triple like:

```nt
<urn:name:stdin#Queries> <urn:code-block:sparql> "SELECT * WHERE {\n  ?s ?p ?o .\n}" .
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
- Absolute IRIs and `[[Wiki Links]]` are emitted as resources.
- Known CURIEs like `schema:Person` are preserved by `triplify` and expanded later by `mapping`.
- `rdfs:label` values always stay plain string literals.
- Lines like `- property :: value` are accepted; list markers are ignored before field parsing.
- Backticks keep values literal, but with the current syntax-only design they mainly help preserve commas or formatting.
- Fenced code blocks still suppress `::` field parsing inside the fence.
- Fenced code blocks with an info string emit one triple on the current document or section subject.
- The predicate for those triples is `urn:code-block:<language>`, and the object is the raw block content as a plain string literal.

## Optional filters

Inside that pipeline:

- `mapping` expands known CURIEs in RDF term positions.
- `typed-literals` upgrades plain literals into booleans, numbers, and date/dateTime literals when they match the expected lexical forms.
- serialization happens last, after the quad transforms.

## Included

- Document-level triples from YAML frontmatter.
- Section-level triples from `##` and `###` headings.
- Obsidian-style `predicate :: value` fields.
- Predicate aliases are read from `src/mappings.json`, including `is a`, `a`, and `type` mapping to `rdf:type`.
- Reversible `urn:name:` and `urn:property:` URI generation.
- Separate in-process CURIE expansion with `mapping`.
- Separate in-process literal typing with `typed-literals`.
- Internal quad-based transforms with `rdf-ext`.
- A comparison script against the original `vault-triplifier`.

## Left Out

- Explicit triple syntax like `[[Alice]] :: manages :: [[Bob]]`.
- Inline parenthetical fields like `Alice (role :: facilitator)`.
- Configurable partitioning modes other than the default `headers-h2-h3` behavior.
- Selectors, offsets, and annotation metadata.
- Document provenance and file-representation triples.
- Canvas processing.
- Property mappings as a built-in stage.
- Section-level `uri :: ...` overrides.
- Full Markdown AST parsing.

## Development

```bash
npm test
```

Note: `npm test` currently also runs the workspace benchmark because it lives under `test/`.
