---
repo-group: rdf
tags: [spec/rdf]
---

# examples

This document pressure-tests the model in [document-model](./document-model.md) with concrete markdown inputs and expected triples.

The rule is:

- document node = `nameToURI(basename(filename))`
- top concept node = `nameToURI(basename(filename, '.md'))`
- H1, if present, materializes that top concept and gives it an `rdfs:label` from the heading text

## Example 1: two documents with headings

### Input: `Alice.md`

```md
---
kind: person
status: active
---

# Alice Smith

role :: Product Manager
knows :: [[Bob]]

## Skills
expertise :: Python
uses :: [sparql]

## Links
See [the spec](https://example.com/spec).
```

### Input: `Bob.md`

```md
---
kind: person
---

# Bob Stone

knows :: [[Alice]]

## Skills
expertise :: RDF

## Links
related :: [[Alice#Skills]]
```

### Expected concept nodes

```text
Alice.md   -> document node: urn:name:Alice.md
Alice.md   -> top concept:   urn:name:Alice
Alice#Skills -> section:     urn:name:Alice%23Skills
Alice#Links  -> section:     urn:name:Alice%23Links

Bob.md     -> document node: urn:name:Bob.md
Bob.md     -> top concept:   urn:name:Bob
Bob#Skills -> section:       urn:name:Bob%23Skills
Bob#Links  -> section:       urn:name:Bob%23Links
```

### Expected triples from `Alice.md`

```turtle
@prefix rdfs: <rdfs:> .

<urn:name:Alice.md>
  <urn:token:kind> "person" ;
  <urn:token:status> "active" ;
  <urn:token:outline> "* Alice Smith\n\t* Skills\n\t* Links" ;
  <urn:token:about> <urn:name:Alice>, <urn:name:Alice%23Skills>, <urn:name:Alice%23Links> .

<urn:name:Alice>
  rdfs:label "Alice Smith" ;
  <urn:token:role> "Product Manager" ;
  <urn:token:knows> <urn:name:Bob> .

<urn:name:Alice%23Skills>
  rdfs:label "Skills" ;
  <urn:token:expertise> "Python" ;
  <urn:token:uses> <urn:token:sparql> .

<urn:name:Alice%23Links>
  rdfs:label "Links" ;
  <urn:token:_> <https://example.com/spec> .

<https://example.com/spec>
  rdfs:label "the spec" .
```

### Expected triples from `Bob.md`

```turtle
@prefix rdfs: <rdfs:> .

<urn:name:Bob.md>
  <urn:token:kind> "person" ;
  <urn:token:outline> "* Bob Stone\n\t* Skills\n\t* Links" ;
  <urn:token:about> <urn:name:Bob>, <urn:name:Bob%23Skills>, <urn:name:Bob%23Links> .

<urn:name:Bob>
  rdfs:label "Bob Stone" ;
  <urn:token:knows> <urn:name:Alice> .

<urn:name:Bob%23Skills>
  rdfs:label "Skills" ;
  <urn:token:expertise> "RDF" .

<urn:name:Bob%23Links>
  rdfs:label "Links" ;
  <urn:token:related> <urn:name:Alice%23Skills> .
```

## Example 2: pre-H1 fields stay on the document node

### Input: `Project.md`

```md
owner :: [[Alice]]
status :: draft

# Project Atlas

maintainer :: [[Bob]]

## Notes
topic :: [rdf]
```

### Expected triples

```turtle
@prefix rdfs: <rdfs:> .

<urn:name:Project.md>
  <urn:token:owner> <urn:name:Alice> ;
  <urn:token:status> "draft" ;
  <urn:token:outline> "* Project Atlas\n\t* Notes" ;
  <urn:token:about> <urn:name:Project>, <urn:name:Project%23Notes> .

<urn:name:Project>
  rdfs:label "Project Atlas" ;
  <urn:token:maintainer> <urn:name:Bob> .

<urn:name:Project%23Notes>
  rdfs:label "Notes" ;
  <urn:token:topic> <urn:token:rdf> .
```

## Example 3: cross-document section reference materializes `about`

### Input: `Alice.md`

```md
# Alice

related :: [[Bob#Some Section]]
```

### Input: `Bob.md`

```md
# Bob
```

### Expected triples from `Alice.md`

```turtle
@prefix rdfs: <rdfs:> .

<urn:name:Alice.md>
  <urn:token:outline> "* Alice" ;
  <urn:token:about> <urn:name:Alice> .

<urn:name:Alice>
  rdfs:label "Alice" ;
  <urn:token:related> <urn:name:Bob%23Some%20Section> .

<urn:name:Bob.md>
  <urn:token:about> <urn:name:Bob%23Some%20Section> .
```

### Expected triples from `Bob.md`

```turtle
@prefix rdfs: <rdfs:> .

<urn:name:Bob.md>
  <urn:token:outline> "* Bob" ;
  <urn:token:about> <urn:name:Bob> .

<urn:name:Bob>
  rdfs:label "Bob" .
```

Notes:

- `[[Bob#Some Section]]` creates the concept node `<urn:name:Bob%23Some%20Section>` even though `Bob.md` has no matching heading.
- The document node for `Bob.md` is always `<urn:name:Bob.md>`.
- The top concept for `Bob.md` is always `<urn:name:Bob>`.
- The document node for `Bob.md` should emit `urn:token:about <urn:name:Bob%23Some%20Section>` once that section concept is referenced and therefore materialized.
- This means document-level `about` links are not only for locally headed sections; they can also be emitted for concept nodes that are materialized through cross-document references.
- This is the tradeoff that avoids materializing every possible section in advance while preserving stable merged-graph behavior.
