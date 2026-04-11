---
tldr: Upgrade plain xsd:string literals to typed XSD literals based on lexical form matching.
repo-uri: osg://repo/local:b4537a2796e64312b60024322e090f4195eb0dd2
repo-group: osg
---

# dot-triples typed-literals

## Intent

Add XSD datatype annotations to literals after parsing so downstream RDF consumers receive correctly typed values. This stage is intentionally separate from parsing: the triplifier produces plain strings and this stage upgrades them without needing to know anything about the source format.

## Claims

- Only plain `xsd:string` literals without a language tag are candidates for upgrading.
- Language-tagged literals and already-typed (non-`xsd:string`) literals are returned unchanged.
- `"true"` and `"false"` strings → `xsd:boolean`.
- Strings that parse as a finite integer → `xsd:integer`.
- Strings that parse as a finite decimal (non-integer) → `xsd:decimal`.
- ISO date strings matching `YYYY-MM-DD` exactly → `xsd:date`.
- ISO datetime strings matching `YYYY-MM-DDThh:mm:ss[.frac][Z|±hh:mm]` → `xsd:dateTime`.
- Non-ISO date formats (`YYYY/MM/DD` and `MM/DD/YYYY`) that parse as valid `Date` objects → `xsd:dateTime`.
- The original lexical value is preserved unchanged; only the datatype node is replaced.
- Non-subject/predicate terms are not examined; typing is applied only to the object term.

## Map

> [[src/typed-literals.js]]
