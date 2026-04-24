---
repo-group: rdf
tags: [spec/rdf]
---

# Why Streaming Quads

The original shape of this repo was:

```bash
cat note.md | triplify | mapping | typed-literals | serialize
```

Internally that still means:

1. triplify markdown into quads
2. map CURIEs over quads
3. type literals over quads
4. serialize once at the end

## The Problem

Once `triplify` has emitted N-Triples, the downstream stages are no longer parsing Markdown.

They are parsing RDF again.

That means the text pipeline paid for the same conversion work repeatedly:

1. `triplify` built RDF output as N-Triples text
2. `mapping` parsed each line back into RDF terms
3. `mapping` serialized RDF terms back into N-Triples text
4. `typed-literals` parsed the lines again
5. `typed-literals` serialized them again

For correctness that was acceptable, but it made the post-processing stages much more expensive than the Markdown parser itself.

## The Change

The faster design is to keep RDF as RDF for as long as possible:

1. parse Markdown once
2. create RDFJS quads once
3. transform quads in-memory
4. serialize once at the output boundary

This repo now uses `rdf-ext` factories and object-mode quad transforms internally for that path.

## Why It Is Faster

On the filtered Obsidian workspace benchmark:

- `triplify` alone took about `89 ms`
- in-process `mapping + typed-literals` over quads took about `71 ms`

The earlier text-based downstream pipeline was roughly an order of magnitude slower because it reparsed N-Triples at every stage.

## The Price

Pure quad streams are not shell-composable in the Unix sense.

Shell pipes move bytes between processes.

RDFJS quad streams move JavaScript objects inside a Node process.

So this works:

```js
markdownStream
  .pipe(triplifyQuadTransform())
  .pipe(mappingQuadTransform())
  .pipe(typedLiteralsQuadTransform())
```

But that quad pipeline stays inside one Node process rather than shelling out to separate CLIs.

## Current Compromise

The repo keeps one text CLI because it is convenient:

- `triplify`

But the high-performance path is now the in-process quad pipeline.

So the design is:

- text at the CLI boundary
- quads in the middle
- one serialization step at the end

That keeps the tool usable from the shell while still allowing a much faster internal execution path.
