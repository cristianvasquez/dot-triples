---
repo-uri: osg://repo/github.com/cristianvasquez/dot-triples
repo-name: sparql-md
layout: node.js
tags: [repo/rdf, package/rdf]
repo-group: rdf
---

# [sparql-md](osg://repo/github.com/cristianvasquez/dot-triples)

`sparql-md` rewrites SPARQL text that uses the canonical Markdown RDF conventions.

## Boundary

This package owns:

- wiki-link replacement such as `[[Note]]`
- token placeholder replacement such as `__label__`
- context-aware token replacement for `__THIS__`, `__DOC__`, and `__REPO__`
- SPARQL parsing after rewrite
- repository/file rewrite context helpers

## Example

```js
import { rewriteAndParseQuery } from 'sparql-md'

const result = rewriteAndParseQuery(
  'SELECT * WHERE { __THIS__ __label__ [[Linked Note]] }',
  { filePath: '/notes/example.md' }
)
```

`__label__` rewrites to `<urn:token:label>` and `[[Linked Note]]` rewrites to
`<urn:name:Linked%20Note>`.
