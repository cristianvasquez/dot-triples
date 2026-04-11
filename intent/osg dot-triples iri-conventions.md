---
tldr: Defines the reversible URI scheme used for subjects, predicates, and object values.
repo-uri: osg://repo/local:b4537a2796e64312b60024322e090f4195eb0dd2
repo-group: osg
---

# dot-triples iri-conventions

## Intent

Encode naming conventions so that generated IRIs are reversible, consistent, and predictable for downstream consumers. The conventions are inherited from `vault-triplifier` and must be preserved for interoperability.

## Claims

- Subject and wiki-link object IRIs use the scheme `urn:name:<percent-encoded-name>`.
- Predicate IRIs use the scheme `urn:property:<percent-encoded-field-name>`.
- Both schemes are reversible: `nameFromUri` and `propertyFromUri` decode them back to plain strings.
- `[[Wiki Link]]` object values resolve to `urn:name:<name>` NamedNodes (treated as resources, not literals).
- Values that match an absolute IRI pattern or a CURIE pattern (`prefix:localname`) are stored as NamedNodes with their raw string as value; they are not URI-encoded with the `urn:` prefix.
- CURIEs in object or predicate position are stored as-is (unresolved NamedNodes) and expanded by the CURIE expansion stage downstream.
- Predicate aliases are a configurable mapping applied before IRI generation; the default map covers: `is a`, `a`, `type` → `rdf:type`; `label`, `title` → `rdfs:label`.
- Custom mappings provided at construction time are merged on top of the defaults (caller-supplied keys win).
- An empty or whitespace-only value causes an error rather than producing a blank IRI.

## Map

> [[src/terms.js]]
