---
uuid: 81274a4f-8544-4704-8d7b-dba3fd9729c4
repo-group: rdf
tags: [spec/rdf]
---

# examples

This document pressure-tests the model in [document-model](./document-model.md) with concrete markdown inputs and expected triples.

The rule is:

- triplification input = `name`, optionally `file`
- if both are present, `name` wins
- if `name` is absent and `file` is present, derive `name = getNameFromPath(file)`
- document node = `nameToURI(name + '.md')`
- top concept node = `nameToURI(name)`
- the first H1, if present, materializes that top concept and gives it an `rdfs:label` from the heading text
- every later heading materializes a local heading concept
- wiki links never materialize `about` triples for other documents

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
Alice#Skills -> heading:     urn:name:Alice%23Skills
Alice#Links  -> heading:     urn:name:Alice%23Links

Bob.md     -> document node: urn:name:Bob.md
Bob.md     -> top concept:   urn:name:Bob
Bob#Skills -> heading:       urn:name:Bob%23Skills
Bob#Links  -> heading:       urn:name:Bob%23Links
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

## Example 3: cross-document section reference does not materialize remote `about`

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

- `[[Bob#Some Section]]` creates an object reference to `<urn:name:Bob%23Some%20Section>` in the current file's triples.
- The document node for `Bob.md` is always `<urn:name:Bob.md>`.
- The top concept for `Bob.md` is always `<urn:name:Bob>`.
- `Bob.md` does not emit `urn:token:about <urn:name:Bob%23Some%20Section>` unless `Bob.md` itself has a matching local heading.
- Document-level `about` links are only for concepts introduced by local headings in that file.
