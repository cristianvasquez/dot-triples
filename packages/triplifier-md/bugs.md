# Bugs

## Bug 1: Body `::` fields ignore `options.mappings`

**File:** `src/triplify.js` — `handleField()`

`emitFrontmatter` correctly consults `options.mappings` before choosing a predicate:

```js
// emitFrontmatter — correct
const mapped = options.mappings?.[key]
const predicate = mapped ? rdf.namedNode(mapped) : predicateNode(key)
```

`handleField` did not — it always called `predicateNode(trimmedKey)`:

```js
// handleField — bug (fixed)
writeQuad(currentSubject(), predicateNode(trimmedKey), parsedValue)
```

**Effect:** Any `key :: value` field in the document body produced `urn:token:<key>` even when the caller passed a mapping for that key. Frontmatter fields with the same key were mapped correctly.

**Reproduce:**

```js
import { triplify } from 'triplifier-md'

const quads = triplify('knows :: [[Bob]]\n', {
  file: 'test.md',
  mappings: { knows: 'foaf:knows' },
})

// was:      urn:token:knows
// expected: foaf:knows  (before CURIE expansion)
console.log(quads.map(q => q.predicate.value))
```

**Fix:** Apply the mapping lookup in `handleField`, matching `emitFrontmatter`:

```js
const mapped = options.mappings?.[trimmedKey]
const predicate = mapped ? rdf.namedNode(mapped) : predicateNode(trimmedKey)
writeQuad(currentSubject(), predicate, parsedValue)
```

---

## Bug 2: `mapQuad` silently drops the named graph

**File:** `src/curie-expansion.js` — `mapQuad()`

```js
// bug (fixed)
export function mapQuad(quad, prefixes = PREFIXES) {
  return rdf.quad(
    mapTerm(quad.subject, prefixes),
    mapTerm(quad.predicate, prefixes),
    mapTerm(quad.object, prefixes),
    // quad.graph was not passed — defaulted to default graph
  )
}
```

**Effect:** Any named graph on the incoming quad was silently discarded. The quad was placed into the default graph instead. The current `osg-triplifier` pipeline assigns the named graph *after* CURIE expansion so this did not manifest there, but would corrupt output for any caller passing named-graph quads into `createCurieExpansionQuadTransform`.

**Reproduce:**

```js
import rdf from 'rdf-ext'
import { mapQuad } from 'triplifier-md/src/curie-expansion.js'

const input = rdf.quad(
  rdf.namedNode('urn:s'),
  rdf.namedNode('foaf:knows'),
  rdf.namedNode('urn:o'),
  rdf.namedNode('urn:my-graph'),
)

const output = mapQuad(input, { foaf: 'http://xmlns.com/foaf/0.1/' })

console.log(output.graph.value)
// was:      '' (default graph)
// expected: 'urn:my-graph'
```

**Fix:** Pass `quad.graph` as the fourth argument:

```js
export function mapQuad(quad, prefixes = PREFIXES) {
  return rdf.quad(
    mapTerm(quad.subject, prefixes),
    mapTerm(quad.predicate, prefixes),
    mapTerm(quad.object, prefixes),
    quad.graph,
  )
}
```
