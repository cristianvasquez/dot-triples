---
uuid: 6376f05a-c670-4ccb-9f68-a08f26d7ea59
repo-uri: osg://repo/github.com/cristianvasquez/dot-triples
repo-name: dot-triples
layout: node.js
tags: [repo/rdf]
repo-group: rdf
---

# dot-triples

See [spec/manifest.hs](spec/manifest.hs) for interfaces, behavior, usage, and known defects.

Run `pnpm test` for JavaScript behavior and `pnpm test:spec` for Haskell type checks (requires GHC). The latter checks valid compositions and rejects invalid ones, including literal predicates and names used as tokens. It does not check JavaScript against the Haskell signatures.

`canonical-md` exports `parseName` and `parseToken`. Both return the input string after checking that it is non-empty, pre-trimmed, and well-formed Unicode. Naming helpers apply the same checks; they reject non-string values instead of coercing them. `tokenToLiteral` also rejects empty tokens. Reverse URI helpers return `null` for malformed encoding or invalid decoded identifiers. Predicate mappings reject RDF terms other than `NamedNode`.

Markdown and Canvas readers mint no blank nodes. Selectors use `urn:selector:fragment:<syntax>:<value>` or `urn:selector:quote:<text>`. Markdown code blocks and blockquotes use `urn:reference:<source>:<syntax>:<value>`, with the note URI as source and an RFC 5147 line range as value. Each component is separately percent-encoded. Equal selectors share a URI; equal line ranges in different notes identify different parts. Moving a part changes its URI. Quote selector URIs contain the full encoded text, so their length grows with the text.
