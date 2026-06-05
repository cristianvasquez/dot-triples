---
uuid: a5f6c8bc-fac6-4478-a837-ffc17e1f0b39
repo-uri: osg://repo/github.com/cristianvasquez/dot-triples
repo-name: dot-triples
layout: node.js
tags: [repo/rdf]
repo-group: rdf
---

# [dot-triples](osg://repo/github.com/cristianvasquez/dot-triples)

Tooling to produce and query RDF from markdown.

It's oriented to emit lexical and document representations. I map semantics afterwards with [[rdf-cli]].

- [[canonical-md]] declare all namespaces used in the [[document-model]].
- [[sparql-md]] knows how to rewrite to standard SPARQL queries.

Example: [[triplification example]]

## Workspace

```bash
pnpm install
pnpm test
```
