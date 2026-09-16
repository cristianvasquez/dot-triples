---
uuid: 6376f05a-c670-4ccb-9f68-a08f26d7ea59
repo-uri: osg://repo/github.com/cristianvasquez/dot-triples
repo-name: dot-triples
layout: node.js
tags: [repo/rdf]
repo-group: rdf
---

# [dot-triples](osg://repo/github.com/cristianvasquez/dot-triples)

Tooling to produce and query RDF from markdown and Obsidian canvases.

This library produces triples but does not take care of domain semantics. Field predicates are `urn:token:` and names are `urn:name:`; meaning is mapped later via CONSTRUCT statements. The structure it emits, files, notes, headings as references, code blocks and quotes as parts, follows the document domain of `@osg/model`.

Other critical part of the toolkit is [[rdf-cli]].

- [[canonical-md]] declare all namespaces used in the [[document-model]].
- [[sparql-md]] knows how to rewrite to standard SPARQL queries.
- [[triplifier-canvas]] turns the edges drawn on a canvas into properties, following the [[canvas-model]].

Example: [[triplification example]]

## Workspace

```bash
pnpm install
pnpm test
```

## Publishing

Use Node.js 24, pnpm 10.32.1 and npm 11.15 or later. Authenticate with `npm login`, then configure the existing npm packages once:

```bash
pnpm trust:github
```

This authorizes `cristianvasquez/dot-triples`, workflow `npm-publish.yml`, to publish using [npm trusted publishing](https://docs.npmjs.com/cli/v11/commands/npm-trust/). npm requires package write access and account 2FA. For a new package, publish it once with `pnpm --filter <package> publish --access public` before configuring trust.

After committing your changes on `main`, release with:

```bash
pnpm release patch
```

Use `minor` or `major` instead of `patch` as needed. This runs tests, updates workspace versions and the lockfile, checks package archives, and pushes the release commit and tag. GitHub Actions tests the tagged code and publishes it. [pnpm skips versions already on npm](https://pnpm.io/10.x/cli/publish), so you can rerun a failed publish job.

To inspect package contents without publishing:

```bash
pnpm publish:packages:dry-run
```

The dry run checks all packages, including versions already on npm. It does not verify GitHub OIDC authentication.
