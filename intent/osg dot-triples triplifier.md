---
tldr: Parse Markdown with YAML frontmatter and predicate :: value fields into a stream of RDFJS quads.
repo-uri: osg://repo/local:b4537a2796e64312b60024322e090f4195eb0dd2
repo-group: osg
---

# dot-triples triplifier

## Intent

Translate the textual Markdown format — YAML frontmatter, heading-scoped sections, and inline `key :: value` fields — into RDFJS quads. This stage produces raw quads with unresolved CURIEs and untyped plain literals; those concerns belong to downstream stages.

## Claims

- The subject IRI is taken from `frontmatter.uri` if present and non-empty; otherwise it defaults to `urn:name:<basename-without-.md>`.
- The `uri` frontmatter key is consumed for subject derivation and is never emitted as a predicate/object pair.
- Every other frontmatter key becomes a predicate/object pair on the document subject.
- `## Heading` lines create an H2 section subject; `### Heading` lines create an H3 section subject nested under the current H2.
- Section subjects use fragment IRIs: `<primary-subject-iri>#<percent-encoded-heading>`.
- Each H2/H3 section subject receives exactly one `rdfs:label` triple with the heading text as a plain string literal (emitted once per subject).
- Fields in the document body before the first `##` attach to the document subject.
- Fields inside an `##` or `###` section attach to that section's subject.
- `label` and `title` predicates always produce plain string literals, regardless of whether the value looks like an IRI or CURIE.
- Comma-separated values in a field expand to multiple triples, one per value; comma splitting respects single and double quotes.
- Backtick-wrapped values are treated as literal strings (commas and other syntax inside are not interpreted).
- List-item markers (`-`, `*`, `+`) at the start of a field line are stripped before field parsing.
- Lines inside fenced code blocks (` ``` `) are ignored for field and heading extraction.
- The YAML parser is a custom subset implementation, not a full YAML library; it handles scalars, booleans, numbers, inline lists, and block lists.
- `[[Wiki Link]]` values in frontmatter are preserved as-is strings (not resolved at this stage); resolution happens in `objectTerm` via `terms.js`.

## Map

> [[src/triplify.js]]
> [[src/frontmatter.js]]
