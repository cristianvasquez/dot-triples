---
uuid: 6376f05a-c670-4ccb-9f68-a08f26d7ea59
repo-uri: osg://repo/github.com/cristianvasquez/dot-triples
repo-name: dot-triples
layout: node.js
tags: [repo/rdf]
repo-group: rdf
---

# [dot-triples](osg://repo/github.com/cristianvasquez/dot-triples)

Tooling to produce and query RDF from markdown.

This library produces triples but does not take care of semantics. One can say semantics are deferred: emits urn:token:/urn:name:, maps later via CONSTRUCT statements.

Other critical part of the toolkit is [[rdf-cli]].

- [[canonical-md]] declare all namespaces used in the [[document-model]].
- [[sparql-md]] knows how to rewrite to standard SPARQL queries.

Example: [[triplification example]]

## Workspace

```bash
pnpm install
pnpm test
```
