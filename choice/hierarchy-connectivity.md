# Deferred Hierarchy Connectivity

The triplifier currently creates section subjects from headings, but it does not emit explicit parent-child links between those subjects.

Today the behavior is:

- the document is one subject
- `## Heading` creates a section subject
- `### Heading` also creates a section subject
- fields inside a section attach to that section subject

This is enough for the current Obsidian-friendly partitioning behavior, but it is not a fully connected tree in RDF.

## Deferred Option

If explicit connectivity becomes necessary, the likely design is:

- emit `rdf:_1`, `rdf:_2`, `rdf:_3`, and so on from a parent to its ordered child sections
- optionally add a later mapping step that rewrites or supplements those container membership predicates with a generic child predicate for easier querying

This keeps ordered hierarchy available without deciding yet on a permanent convenience predicate.

## Why It Is Deferred

This repo does not currently have a consumer that needs explicit parent-child connectivity.
