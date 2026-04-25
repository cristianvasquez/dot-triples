---
repo-group: rdf
tags: [spec/rdf]
---

# document-model

## Two kinds of nodes

A markdown file produces two kinds of nodes in the graph:

Document node: the file itself. It holds frontmatter metadata and exists for provenance. It links to each materialized concept via `urn:token:about`.

Concept nodes: the things described inside the file. They connect to concept nodes in other documents. They do not carry frontmatter. One concept node is the top concept of the document; the rest are heading concepts materialized from headings. If parent-child relations matter, they must be written explicitly in markdown as normal fields.

These are distinct nodes in the graph with distinct IRIs.

## Document node

Triplification takes:

- `name`: the canonical note identity
- `file`: optional source filename or path

If both are given, `name` wins. If `name` is absent and `file` is given, `name` is derived with `getNameFromPath(file)`.

The document node represents the file as a document. Its IRI is always derived from `name`:

```text
nameToURI(name + '.md')
```

`name = 'Alice'` → `urn:name:Alice.md`

### What goes on the document node

- All frontmatter key-value pairs, with keys resolved via `tokenToURI`
- A link to each materialized concept node

### Links to materialized concepts

```
<documentNode>  urn:token:about  urn:name:Alice
<documentNode>  urn:token:about  urn:name:Alice%23Skills
```

## Top concept node

One per document. Its IRI is always derived from `name`:

```
nameToURI(name)
```

`name = 'Alice'` → `urn:name:Alice`

Case is preserved exactly. `[[Alice]]` in any other file must use the same casing to resolve to the same IRI.

### First H1 materializes the top concept

The first `#` heading materializes the top concept already implied by `name` and sets `rdfs:label` from the heading text:

```markdown
# Alice Smith
```

```
urn:name:Alice  rdfs:label  "Alice Smith"
```

The top concept is just another concept node. The document node links to it with `urn:token:about`.

Any later `#` heading in the same file is treated like any other heading and materializes a heading concept with `#` in the concept name. Only the first H1 is special.

### Body-level fields

Inline fields that appear in the document body before the first later heading attach to the current document-level subject. If an H1 has materialized the top concept, they attach to the top concept:

```markdown
# Alice Smith

role :: Product Manager
```

```
urn:name:Alice  urn:token:role  "Product Manager"
```

## Heading concept nodes

All headings after the first H1 create heading concept nodes. This includes later H1 headings and all headings at depth H2 through H6. The IRI is flat regardless of heading depth:

```
nameToURI(name + '#' + headingText)
```

`## Skills` in `Alice.md`:

```
nameToURI('Alice#Skills')  →  urn:name:Alice%23Skills
```

`# Advanced` after the first H1 in `Alice.md`:

```
nameToURI('Alice#Advanced')  →  urn:name:Alice%23Advanced
```

`### Advanced` in `Alice.md`:

```
nameToURI('Alice#Advanced')  →  urn:name:Alice%23Advanced
```

Depth is not encoded. `# Advanced` after the first H1, `## Advanced`, and `### Advanced` in the same file all produce the same IRI. Repeated headings with the same text in the same file also produce the same IRI. This merge is intentional. If structure matters, look at the document. This mirrors Obsidian's `[[Alice#Skills]]` link syntax, where `#` is part of the name string and `encodeURIComponent` encodes it as `%23`.

### Fields under a heading

Inline fields attach to the current heading concept:

```markdown
## Skills
expertise :: Python
```

```
urn:name:Alice%23Skills  urn:token:expertise  "Python"
```

### Heading source metadata

Each materialized heading concept also carries the exact markdown heading line that created it, using the metadata namespace:

```markdown
## Skills
```

```
urn:name:Alice%23Skills  urn:meta:raw    "## Skills"
urn:name:Alice%23Skills  urn:meta:depth  "2"
urn:name:Alice%23Skills  urn:meta:line   "3"
```

This is provenance metadata for reconstruction and diagnostics. It is not part of the domain model.

## Cross-document identity

Concept nodes connect across documents because `[[Name]]` and `[[Name#Section]]` resolve via `nameToURI` to the same IRIs that filenames produce:

```
[[Alice]]          →  nameToURI('Alice')          →  urn:name:Alice
[[Alice#Skills]]   →  nameToURI('Alice#Skills')   →  urn:name:Alice%23Skills
```

Files can be triplified independently in any order. The merged graph is identical regardless of order. No coordination between files is required.

The triplifier only emits `urn:token:about` for concepts introduced by local headings in the current file. A wiki link such as `[[Bob]]` or `[[Bob#Skills]]` contributes an object IRI to the current triple, but it does not materialize `Bob.md` or add `urn:token:about` triples to any other document. Other files are responsible for emitting their own headings when they are triplified.

## Field predicates

All inline field keys go through `tokenToURI`. No MAPPINGS table. No `rdf:type` auto-mapping.

```markdown
knows :: [[Bob]]
born :: 1990
transport :: [walk]
```

```
urn:name:Alice  urn:token:knows  urn:name:Bob
urn:name:Alice  urn:token:born   "1990"
urn:name:Alice  urn:token:transport  urn:token:walk
```

The triplifier does not know about `rdf:type`. Type assignments happen in downstream SPARQL CONSTRUCTs.

`rdfs:label` is the only predicate emitted without `tokenToURI`. It appears in three places only:

- first H1 heading → top concept label
- later headings → heading concept label
- URL nodes from `[label](uri)` syntax

## Field objects

| Syntax                     | Result                                                  |
| -------------------------- | ------------------------------------------------------- |
| `[[Name]]`                 | `nameToURI('Name')` → `urn:name:Name`                   |
| `[[Name#Section]]`         | `nameToURI('Name#Section')` → `urn:name:Name%23Section` |
| [value]                    | tokenToURI('value') -> urn:token:value                  |
| CURIE `schema:Person`      | `rdf.namedNode('schema:Person')` — expanded later       |
| Absolute IRI `https://...` | `rdf.namedNode('https://...')`                          |
| plain text                 | `rdf.literal('value')`                                  |

## Named reference extraction from prose

Named references in prose emit `urn:token:_` on the current subject.
The same extraction also runs on heading text after the heading concept is materialized, so references in `#` or `##` titles hang from that heading concept.

Supported forms:

- `[label](uri)` markdown links
- `[[Name]]` and `[[Name#Section]]` wiki links
- `[value]` token references
- bare CURIE or absolute IRI values such as `schema:Person` or `https://example.com/spec`

```markdown
See [the spec](https://example.com/spec), [[Bob]], [sparql], and schema:Person.
```

```
urn:name:Alice%23Skills  urn:token:_  <https://example.com/spec>
urn:name:Alice%23Skills  urn:token:_  urn:name:Bob
urn:name:Alice%23Skills  urn:token:_  urn:token:sparql
urn:name:Alice%23Skills  urn:token:_  schema:Person
<https://example.com/spec>  rdfs:label  "the spec"
```

Predicate on the current heading concept is `urn:token:_` (UNTYPED_TOKEN). The label triple is emitted only when a label is present in the `[label](uri)` syntax.

## What is gone

- `urn:property:` namespace: dead. All predicates go through `tokenToURI`.
- MAPPINGS table in `terms.js`: removed.
- `rdf:type` in the triplifier: removed entirely.
- `terms.js` as currently written: obsolete. Replaced by `nameToURI` and `tokenToURI` from `canonical-md`.

## What is explicitly deferred

- SPARQL CONSTRUCTs for `rdf:type`, `uri:` mapping, CURIE expansion.
