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

- `nameToURI`
- `nameFromURI`
- `tokenToURI`
- `tokenFromURI`
- `tokenToLiteral`
- `UNTYPED_TOKEN`
- `getNameFromPath`
- `getDocName`
- `pathToFileURL`
- `fileURLToPath`

## Example

```js
import { getDocName, getNameFromPath, nameToURI, pathToFileURL, tokenToURI } from 'canonical-md'

nameToURI('Alice Smith')
tokenToURI('has name')
getNameFromPath('/tmp/note.md')
getDocName('Alice Smith')
pathToFileURL('/tmp/note.md')
```

## Development

```bash
pnpm --filter canonical-md test
```
