---
uuid: 02e36de5-f5e9-4b83-821c-0f1592d8599e
repo-name: sparql-md
layout: node.js
tags: [repo/rdf, package/rdf]
repo-group: rdf
---

# sparql-md

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
