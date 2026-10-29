# triplifier-md-lite

Reads a Markdown file as a tree of sections and writes one RDF record for each section. Use it when you want the text of a note, for example journal entries. Use `triplifier-md` when you want links between notes and headings.

| Node | IRI | Triples |
| --- | --- | --- |
| File | `urn:name:Note.md` | `a document:File`, frontmatter, `rdf:value` with the text before the first heading |
| Section | `urn:name:Note.md#s<N>` | `rdfs:label` (heading text), `dct:isPartOf` (parent section or file), `schema:position` N, fields, `rdf:value` |

- N is the position of the heading in the file, for all levels. Two sections with the same heading are two records.
- `rdf:value` is the own text of the node: the lines up to the next heading, without field lines. The text of subsections is not included.
- A field `key :: value` goes on the section that contains it. A value that is one Markdown link `[text](iri)` becomes the IRI, with `rdfs:label "text"`. Option `linkLabels: false` (CLI `--no-link-labels`) drops that label. Other values follow the `triplifier-md` rules.
- A field or frontmatter value `YYYY-MM-DD` is an `xsd:date`. A value `YYYY-MM-DD HH:MM[:SS]` (space or `T`) is an `xsd:dateTime` without a time zone. An impossible date stays a plain literal.
- No selectors, no text quotes, no prose links.

A section IRI depends on the position of its heading. When you add or remove a heading, the IRIs of the sections that follow it change.

```sh
triplify-lite journal/2026-W07.md < journal/2026-W07.md
triplify-lite --no-link-labels journal/2026-W07.md < journal/2026-W07.md
```
