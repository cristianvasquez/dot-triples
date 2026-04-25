# Done

- Patched label typing in `dot-triples`: `rdfs:label` values now stay plain string literals and are never auto-typed from lexical form. Confirmed the fix with coverage for the OSG case where `"0xd34df00d"` must not become `xsd:integer`, plus label regressions for `"2025-07-18"` and `"1956"`.
