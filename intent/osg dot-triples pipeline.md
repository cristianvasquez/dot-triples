---
tldr: Node.js Transform stream wrappers and stdin/stdout CLI for the Markdown-to-N-Triples pipeline.
repo-uri: osg://repo/local:b4537a2796e64312b60024322e090f4195eb0dd2
repo-group: osg
---

# dot-triples pipeline

## Intent

Expose the in-process quad pipeline as composable Node.js Transform streams, and provide a single CLI entry point so the tool can be used in Unix shell pipelines. The streams enable in-process composition at quad level (faster, no serialization round-trips); the CLI handles the text boundary.

## Claims

- The CLI reads Markdown from stdin and writes N-Triples to stdout.
- An optional first CLI argument supplies the source identifier (filename); it is used to derive the document subject when no `uri` frontmatter key is present.
- Pipeline order is fixed: `triplify → CURIE expansion → typed literals → N-Triples serialization`.
- `createTriplifyQuadTransform` is text-in / quads-out; its readable side is in object mode.
- `createCurieExpansionQuadTransform` and `createTypedLiteralsQuadTransform` are quad-in / quad-out (full object mode).
- UTF-8 decoding and line-splitting across chunk boundaries are handled inside the triplify transform; callers do not need to split lines.
- Errors in any transform stage are propagated via the Node.js stream error mechanism; the CLI catches them, writes the message to stderr, and sets exit code 1.
- The three transform factories are exported from both `streams.js` and `index.js` so library consumers can build their own pipelines.

## Map

> [[src/streams.js]]
> [[src/cli.js]]
