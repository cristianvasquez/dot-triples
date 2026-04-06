import test from 'node:test'
import assert from 'node:assert/strict'
import { triplify, internals } from '../src/triplify.js'
import { typedLiterals } from '../src/typed-literals.js'

test('frontmatter becomes triples and uri overrides the subject', () => {
  const nt = triplify(`---
uri: https://example.com/people/alice
title: Alice
tags: [person, staff]
---

role :: Product Manager
`)

  assert.match(nt, /^<https:\/\/example.com\/people\/alice> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Alice" \./m)
  assert.match(nt, /<https:\/\/example.com\/people\/alice> <urn:property:tags> "person" \./)
  assert.match(nt, /<https:\/\/example.com\/people\/alice> <urn:property:tags> "staff" \./)
  assert.match(nt, /<https:\/\/example.com\/people\/alice> <urn:property:role> "Product Manager" \./)
})

test('inline fields ignore fenced code blocks', () => {
  const nt = triplify(`# Example

\`\`\`md
ignored :: value
\`\`\`

name :: Alice
`)

  assert.match(nt, /<urn:name:stdin> <urn:property:name> "Alice" \./)
  assert.doesNotMatch(nt, /ignored/)
})

test('bullet list markers are ignored before parsing inline fields', () => {
  const nt = triplify(`- is a :: [[Researcher]]
* knows :: [[Alice]]
+ role :: Engineer
`)

  assert.match(nt, /<urn:name:stdin> <http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type> <urn:name:Researcher> \./)
  assert.match(nt, /<urn:name:stdin> <urn:property:knows> <urn:name:Alice> \./)
  assert.match(nt, /<urn:name:stdin> <urn:property:role> "Engineer" \./)
  assert.doesNotMatch(nt, /urn:property:-%20is%20a/)
})

test('default heading partitioning uses big-tool heading subjects', () => {
  const nt = triplify(`# Team
owner :: Cristian

## Alice
role :: Product Manager

### Skills
expertise :: Research

## Bob
role :: Developer
`)

  assert.match(nt, /<urn:name:stdin> <urn:property:owner> "Cristian" \./)
  assert.match(nt, /<urn:name:stdin#Alice> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Alice" \./)
  assert.match(nt, /<urn:name:stdin#Alice> <urn:property:role> "Product Manager" \./)
  assert.match(nt, /<urn:name:stdin#Skills> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Skills" \./)
  assert.match(nt, /<urn:name:stdin#Skills> <urn:property:expertise> "Research" \./)
  assert.match(nt, /<urn:name:stdin#Bob> <urn:property:role> "Developer" \./)
})

test('h1 does not create a separate entity in the default heading mode', () => {
  const nt = triplify(`# Team
role :: Document Role
`)

  assert.match(nt, /<urn:name:stdin> <urn:property:role> "Document Role" \./)
  assert.doesNotMatch(nt, /<urn:name:stdin#Team>/)
})

test('heading labels stay plain literals even when the heading looks like a resource', () => {
  const nt = triplify(`## [[Next steps]]
`)

  assert.match(nt, /<urn:name:stdin#%5B%5BNext%20steps%5D%5D> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "\[\[Next steps\]\]" \./)
  assert.doesNotMatch(nt, /<urn:name:Next%20steps>/)
})

test('links, dates, and schema curies are emitted as RDF terms', () => {
  const nt = triplify(`born :: 2024-03-15
knows :: [[Bob Smith]]
type :: schema:Person
`)

  assert.match(nt, /<urn:property:born> "2024-03-15" \./)
  assert.match(nt, /<urn:property:knows> <urn:name:Bob%20Smith> \./)
  assert.match(nt, /<http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type> <https:\/\/schema\.org\/Person> \./)
})

test('simple yaml parser supports dash lists', () => {
  const frontmatter = internals.parseSimpleYaml(`title: Alice
tags:
  - one
  - two
`)

  assert.deepEqual(frontmatter, {
    title: 'Alice',
    tags: ['one', 'two']
  })
})

test('backticks preserve plain string values', () => {
  const nt = triplify(`born :: \`2024-03-15\`
count :: \`42\`
flag :: \`true\`
`)

  assert.match(nt, /<urn:property:born> "2024-03-15" \./)
  assert.match(nt, /<urn:property:count> "42" \./)
  assert.match(nt, /<urn:property:flag> "true" \./)
})

test('typed-literals upgrades plain literals in a later pipe', () => {
  const untyped = triplify(`born :: 2024-03-15
count :: 42
flag :: true
name :: Alice
`)

  const typed = typedLiterals(untyped)

  assert.match(typed, /<urn:property:born> "2024-03-15"\^\^<http:\/\/www\.w3\.org\/2001\/XMLSchema#date> \./)
  assert.match(typed, /<urn:property:count> "42"\^\^<http:\/\/www\.w3\.org\/2001\/XMLSchema#integer> \./)
  assert.match(typed, /<urn:property:flag> "true"\^\^<http:\/\/www\.w3\.org\/2001\/XMLSchema#boolean> \./)
  assert.match(typed, /<urn:property:name> "Alice" \./)
})
