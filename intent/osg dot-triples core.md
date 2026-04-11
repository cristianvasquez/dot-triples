---
tldr: A minimal, fast tool that converts Obsidian-style Markdown notes to N-Triples via an in-process quad pipeline.
repo-uri: osg://repo/local:b4537a2796e64312b60024322e090f4195eb0dd2
repo-group: osg
---

# dot-triples core

## Intent

Provide a focused Markdown-to-RDF converter that covers the subset of `vault-triplifier` features that are actually used: YAML frontmatter, `predicate :: value` body fields, and `##`/`###` section headings. The design goal is a smaller, faster tool — not full feature parity with vault-triplifier.

## Claims

- One Markdown document produces one primary RDF subject.
- The pipeline is fixed and in-process: `triplify → CURIE expansion → typed literals → N-Triples`.
- `triplifyToQuads(content, options)` is the synchronous public entry point; it applies all three stages and returns an array of RDFJS quads.
- `canProcess(path)` returns true only for `.md` files.
- URI utilities (`nameToUri`, `nameFromUri`, `propertyToUri`, `propertyFromUri`, `pathToFileURL`, `fileURLToPath`) encode and decode the `urn:name:` and `urn:property:` schemes, and `file://` paths.
- All three quad-transform stages are also exported as named functions for use by callers who need streaming.
- The tool deliberately omits: explicit triple syntax, inline parentheticals, canvas, selectors, provenance triples, section-level `uri::` overrides, and full Markdown AST parsing.

## Map

> [[src/index.js]]
