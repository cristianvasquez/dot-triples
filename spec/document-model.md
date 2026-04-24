---
repo-group: rdf
tags: [spec/rdf]
---

# document-model

## Two kinds of nodes

A markdown file produces two kinds of nodes in the graph:

Document node: the file itself. It holds frontmatter metadata and exists for provenance. It links to each materialized concept via `urn:token:about`.

Concept nodes: the things described inside the file. They connect to concept nodes in other documents. They do not carry frontmatter. One concept node is the top concept of the document; the rest are section concepts materialized from headings. If parent-child relations matter, they must be written explicitly in markdown as normal fields.

These are distinct nodes in the graph with distinct IRIs.

## Document node

The document node represents the file as a document. Its IRI is always derived from the filename:

```text
nameToURI(basename(filename))
```

`Alice.md` → `urn:name:Alice.md`

### What goes on the document node

- All frontmatter key-value pairs, with keys resolved via `tokenToURI`
- The outline literal (see below)
- A link to each materialized concept node

### Links to materialized concepts

```
<documentNode>  urn:token:about  urn:name:Alice
<documentNode>  urn:token:about  urn:name:Alice%23Skills
```

### Outline

A single literal capturing the header structure as an indented bullet list:

```
<documentNode>  urn:token:outline  "* Alice Smith\n\t* Skills\n\t* Friends"
```

Each heading becomes a `*` bullet. Indentation uses tabs: H1 gets no indent, H2 gets one tab, H3 gets two tabs, and so on. Purpose: rendering a table of contents. Not for RDF querying.

## Top concept node

One per document. Its IRI is always derived from the filename:

```
nameToURI(basename(filename, '.md'))
```

`Alice.md` → `urn:name:Alice`

Case is preserved exactly. `[[Alice]]` in any other file must use the same casing to resolve to the same IRI.

### H1 materializes the top concept

The first `#` heading does not create a new concept node. It materializes the top concept already implied by the filename and sets `rdfs:label` from the heading text:

```markdown
# Alice Smith
```

```
urn:name:Alice  rdfs:label  "Alice Smith"
```

The top concept is just another concept node. The document node links to it with `urn:token:about`.

### Body-level fields

Inline fields that appear in the document body before the first section heading attach to the current document-level subject. If an H1 has materialized the top concept, they attach to the top concept:

```markdown
# Alice Smith

role :: Product Manager
```

```
urn:name:Alice  urn:token:role  "Product Manager"
```

## Section concept nodes

All headings at depth H2 through H6 create section concept nodes. The IRI is flat regardless of heading depth:

```
nameToURI(basename(filename, '.md') + '#' + headingText)
```

`## Skills` in `Alice.md`:

```
nameToURI('Alice#Skills')  →  urn:name:Alice%23Skills
```

`### Advanced` in `Alice.md`:

```
nameToURI('Alice#Advanced')  →  urn:name:Alice%23Advanced
```

Depth is not encoded. `### Advanced` and `## Advanced` in the same file produce the same IRI. Repeated headings with the same text in the same file also produce the same IRI. This merge is intentional. If structure matters, look at the document. This mirrors Obsidian's `[[Alice#Skills]]` link syntax, where `#` is part of the name string and `encodeURIComponent` encodes it as `%23`.

### Fields under a section

Inline fields attach to the current section concept:

```markdown
## Skills
expertise :: Python
```

```
urn:name:Alice%23Skills  urn:token:expertise  "Python"
```

## Cross-document identity

Concept nodes connect across documents because `[[Name]]` and `[[Name#Section]]` resolve via `nameToURI` to the same IRIs that filenames produce:

```
[[Alice]]          →  nameToURI('Alice')          →  urn:name:Alice
[[Alice#Skills]]   →  nameToURI('Alice#Skills')   →  urn:name:Alice%23Skills
```

Files can be triplified independently in any order. The merged graph is identical regardless of order. No coordination between files is required.

A concept is materialized when it is introduced by a local heading or referenced by a wiki link. When a concept is materialized, its owning document node emits `urn:token:about` for it, even if that concept was not introduced by a local heading in that document. This is the tradeoff that allows the model to avoid materializing every possible header while still preserving stable merged-graph behavior for cross-document references.

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

- H1 heading → top concept label
- H2–H6 headings → section concept label
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

## URL extraction from prose

Only `[label](uri)` markdown link syntax is extracted. Bare URLs in prose are ignored.

```markdown
See [the spec](https://example.com/spec) for details.
```

```
urn:name:Alice%23Skills  urn:token:_  <https://example.com/spec>
<https://example.com/spec>  rdfs:label  "the spec"
```

Predicate on the section concept is `urn:token:_` (UNTYPED_TOKEN). The label triple is emitted only when a label is present in the `[label](uri)` syntax.

## What is gone

- `urn:property:` namespace: dead. All predicates go through `tokenToURI`.
- MAPPINGS table in `terms.js`: removed.
- `rdf:type` in the triplifier: removed entirely.
- `terms.js` as currently written: obsolete. Replaced by `nameToURI` and `tokenToURI` from `canonical-md`.

## What is explicitly deferred

- SPARQL CONSTRUCTs for `rdf:type`, `uri:` mapping, CURIE expansion.
