---
repo-group: rdf
tags: [spec/rdf]
---

# canonical utilities

The `canonical-md` package provides functions that convert natural-language strings into valid RDF named nodes and back. These are the only functions that know the URN patterns used across the system. All other packages go through these functions rather than constructing URNs directly.

## Purpose

This is a text representation layer. No semantics are assigned here. Proper ontology terms, class hierarchies, and reasoner-compatible URIs are assigned later through SPARQL CONSTRUCTs and external mappings. These utilities exist so that queries and triple production can be written in natural language without knowing the URI patterns.

## Two kinds of things

**Names** identify concepts. In markdown they appear as `[[Alice Smith]]` in field values. A name is always expected to have a value; a missing name is a bug in the caller.

**Tokens** identify relations and properties. In markdown they appear as keys in frontmatter (`part of: [[Alice]]`) and inline fields (`part of :: [[Alice]]`). A token may legitimately be absent when a relation exists but has no stated type.

## Input contract

All inputs are assumed to already be trimmed by the caller. Leading or trailing whitespace is a caller error and these functions will throw. No input may contain `\n`; values are single-line only.

## URI patterns

```
urn:name:{encodeURIComponent(value)}    names
urn:token:{encodeURIComponent(value)}   tokens
urn:token:_                             untyped relation (sentinel)
```

Encoding uses `encodeURIComponent`.

## Functions

### nameToURI(s)

Converts a name string to a `NamedNode` with scheme `urn:name:`.

- Throws if input is null, undefined, empty, or has leading/trailing whitespace
- `'Alice Smith'` → `NamedNode('urn:name:Alice%20Smith')`

### nameFromURI(term)

Extracts the name string from a `NamedNode`.

- Returns null if the term is not a `NamedNode` or does not use the `urn:name:` prefix
- `NamedNode('urn:name:Alice%20Smith')` → `'Alice Smith'`

### tokenToURI(s)

Converts a token string to a `NamedNode` with scheme `urn:token:`.

- Throws if input has leading/trailing whitespace
- null, undefined, empty string, or `'_'` → returns `UNTYPED_TOKEN`
- `'part of'` → `NamedNode('urn:token:part%20of')`

### tokenFromURI(term)

Extracts the token string from a `NamedNode`.

- Returns null if the term is `UNTYPED_TOKEN`, not a `NamedNode`, or does not use the `urn:token:` prefix
- `NamedNode('urn:token:part%20of')` → `'part of'`

### tokenToLiteral(s)

Converts a token string to an RDF `Literal`.

- Throws if input has leading/trailing whitespace
- `'part of'` → `Literal("part of")`
- Will be expanded later for typed literals

### UNTYPED_TOKEN

Exported constant: `NamedNode('urn:token:_')`.

Represents a relation that exists but has no stated type. `'_'` in text is treated as equivalent to no value and maps to this constant. Querying for all untyped relations is done by matching this URI directly.

## Cross-namespace isolation

`nameFromURI` always returns null for a token URI and vice versa. The two namespaces do not overlap.

## Invariants for property-based testing

Input generators must produce already-trimmed strings with no `\n`.

Round-trip: for any trimmed string that is not empty and not `'_'`:

```
nameFromURI(nameToURI(s))   === s
tokenFromURI(tokenToURI(s)) === s
```

Untyped token:

```
tokenToURI(null)  === UNTYPED_TOKEN
tokenToURI('')    === UNTYPED_TOKEN
tokenToURI('_')   === UNTYPED_TOKEN
tokenFromURI(UNTYPED_TOKEN) === null
```

Cross-namespace:

```
nameFromURI(tokenToURI(s))  === null
tokenFromURI(nameToURI(s))  === null
```

Whitespace errors:

```
nameToURI('  Alice')   → throws
tokenToURI('part of ') → throws
```

Stress-test characters for generators: `#`, `?`, `&`, `=`, `/`, `%`, `:`, unicode, emoji, parentheses, apostrophes.

## What is not here

File path utilities (`pathToFileURL`, `fileURLToPath`) remain in the module for now. They serve provenance triples that record which file a triple came from, distinct from the concept the file represents. This will be revisited separately.
