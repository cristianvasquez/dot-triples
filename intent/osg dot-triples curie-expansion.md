---
tldr: Expand CURIEs in quad term positions using a configurable prefix map.
repo-uri: osg://repo/local:b4537a2796e64312b60024322e090f4195eb0dd2
repo-group: osg
---

# dot-triples curie-expansion

## Intent

Separate CURIE resolution from parsing so that the triplifier stays format-agnostic and CURIE expansion can be composed or replaced independently. The stage is a pure quad-to-quad transform.

## Claims

- Only NamedNodes are examined; Literals and BlankNodes pass through unchanged.
- A value is treated as a CURIE when it matches `prefix:localname` and the prefix exists in the active prefix table.
- Unknown CURIEs (prefix not in the table) pass through as-is; they are not an error.
- Expansion is applied to all three term positions: subject, predicate, and object.
- Default prefixes: `rdf`, `rdfs`, `schema`, `skos`, `owl`, `prov`.
- Additional caller-supplied prefixes are merged on top of defaults at construction time; caller-supplied values win on collision.
- The graph/dataset term is not touched (quads are emitted with the default graph).

## Map

> [[src/curie-expansion.js]]
> [[src/prefixes.js]]
