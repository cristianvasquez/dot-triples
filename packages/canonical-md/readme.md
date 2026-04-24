---
repo-uri: osg://repo/github.com/cristianvasquez/dot-triples
repo-name: canonical-md
layout: node.js
tags: [repo/rdf, package/rdf]
repo-group: rdf
---

# [canonical-md](osg://repo/github.com/cristianvasquez/dot-triples)

`canonical-md` owns the canonical RDF naming helpers shared by the other packages.

## Boundary

This package exports:

- `nameToUri`
- `nameFromUri`
- `propertyToUri`
- `propertyFromUri`
- `pathToFileURL`
- `fileURLToPath`
- `NAME_BASE`
- `PROPERTY_BASE`

## Example

```js
import { nameToUri, propertyToUri, pathToFileURL } from 'canonical-md'

nameToUri('Alice Smith')
propertyToUri('has name')
pathToFileURL('/tmp/note.md')
```

## Development

```bash
pnpm --filter canonical-md test
```
