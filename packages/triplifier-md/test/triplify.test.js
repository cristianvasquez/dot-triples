import test from 'node:test'
import assert from 'node:assert/strict'
import rdf from 'rdf-ext'
import { Readable } from 'node:stream'
import { triplify, internals } from '../src/triplify.js'
import { mapQuad } from '../src/curie-expansion.js'
import { typeQuad } from '../src/typed-literals.js'
import { createTriplifyQuadTransform, createCurieExpansionQuadTransform, createTypedLiteralsQuadTransform } from '../src/streams.js'
import { serializeNTriplesStream } from '../src/serialize.js'

async function serializeQuadStream(stream) {
  let output = ''

  for await (const chunk of serializeNTriplesStream(stream)) {
    output += chunk.toString()
  }

  return output
}

async function serializeQuads(quads) {
  return serializeQuadStream(Readable.from(quads))
}

test('frontmatter stays on the document node and h1 materializes the top concept', async () => {
  const nt = await serializeQuads(triplify(`---
kind: person
status: active
---

# Alice Smith

role :: Product Manager
`, { sourceId: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice\.md> <urn:token:kind> "person" \./)
  assert.match(nt, /<urn:name:Alice\.md> <urn:token:status> "active" \./)
  assert.match(nt, /<urn:name:Alice\.md> <urn:token:about> <urn:name:Alice> \./)
  assert.match(nt, /<urn:name:Alice\.md> <urn:token:outline> "\* Alice Smith" \./)
  assert.match(nt, /<urn:name:Alice> <rdfs:label> "Alice Smith" \./)
  assert.match(nt, /<urn:name:Alice> <urn:token:role> "Product Manager" \./)
})

test('pre-h1 body fields stay on the document node', async () => {
  const nt = await serializeQuads(triplify(`owner :: [[Alice]]
status :: draft

# Project Atlas
maintainer :: [[Bob]]
`, { sourceId: 'Project.md' }))

  assert.match(nt, /<urn:name:Project\.md> <urn:token:owner> <urn:name:Alice> \./)
  assert.match(nt, /<urn:name:Project\.md> <urn:token:status> "draft" \./)
  assert.match(nt, /<urn:name:Project> <urn:token:maintainer> <urn:name:Bob> \./)
})

test('section headings materialize flat section concepts and attach fields there', async () => {
  const nt = await serializeQuads(triplify(`# Alice

## Skills
expertise :: Python

### Skills
uses :: [sparql]
`, { sourceId: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice\.md> <urn:token:about> <urn:name:Alice%23Skills> \./)
  assert.match(nt, /<urn:name:Alice%23Skills> <rdfs:label> "Skills" \./)
  assert.match(nt, /<urn:name:Alice%23Skills> <urn:token:expertise> "Python" \./)
  assert.match(nt, /<urn:name:Alice%23Skills> <urn:token:uses> <urn:token:sparql> \./)
})

test('wiki links materialize foreign concepts on their owning document nodes', async () => {
  const nt = await serializeQuads(triplify(`# Alice

knows :: [[Bob]]
related :: [[Bob#Some Section]]
`, { sourceId: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice> <urn:token:knows> <urn:name:Bob> \./)
  assert.match(nt, /<urn:name:Alice> <urn:token:related> <urn:name:Bob%23Some%20Section> \./)
  assert.match(nt, /<urn:name:Bob\.md> <urn:token:about> <urn:name:Bob> \./)
  assert.match(nt, /<urn:name:Bob\.md> <urn:token:about> <urn:name:Bob%23Some%20Section> \./)
})

test('markdown links in prose attach to the current subject and label the url node', async () => {
  const nt = await serializeQuads(triplify(`# Alice

## Links
See [the spec](https://example.com/spec) for details.
`, { sourceId: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice%23Links> <urn:token:_> <https:\/\/example\.com\/spec> \./)
  assert.match(nt, /<https:\/\/example\.com\/spec> <rdfs:label> "the spec" \./)
})

test('inline fields ignore fenced code blocks', async () => {
  const nt = await serializeQuads(triplify(`# Example

\`\`\`md
ignored :: value
\`\`\`

name :: Alice
`, { sourceId: 'Example.md' }))

  assert.match(nt, /<urn:name:Example> <urn:token:name> "Alice" \./)
  assert.match(nt, /<urn:name:Example> <urn:code-block:md> "ignored :: value" \./)
  assert.doesNotMatch(nt, /<urn:name:Example> <urn:token:ignored> "value" \./)
})

test('triplify fails on unclosed fenced code blocks', () => {
  assert.throws(
    () => triplify(`# Example

\`\`\`sparql
SELECT * WHERE {
  ?s ?p ?o .
}
`, { sourceId: 'Example.md' }),
    /Unclosed fenced code block in Example\.md/
  )
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

test('backticks preserve plain string values', async () => {
  const nt = await serializeQuads(triplify(`# Alice
born :: \`2024-03-15\`
count :: \`42\`
flag :: \`true\`
`, { sourceId: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice> <urn:token:born> "2024-03-15" \./)
  assert.match(nt, /<urn:name:Alice> <urn:token:count> "42" \./)
  assert.match(nt, /<urn:name:Alice> <urn:token:flag> "true" \./)
})

test('mapping expands curies in any RDF term position', () => {
  const mapped = mapQuad(rdf.quad(
    rdf.namedNode('schema:Alice'),
    rdf.namedNode('schema:knows'),
    rdf.namedNode('schema:Person')
  ))

  assert.equal(mapped.subject.value, 'https://schema.org/Alice')
  assert.equal(mapped.predicate.value, 'https://schema.org/knows')
  assert.equal(mapped.object.value, 'https://schema.org/Person')
})

test('typed-literals upgrades plain literals in a later pipe', () => {
  const typed = [
    typeQuad(rdf.quad(rdf.namedNode('urn:name:Alice'), rdf.namedNode('urn:token:born'), rdf.literal('2024-03-15'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:Alice'), rdf.namedNode('urn:token:count'), rdf.literal('42'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:Alice'), rdf.namedNode('urn:token:flag'), rdf.literal('true'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:Alice'), rdf.namedNode('urn:token:name'), rdf.literal('Alice')))
  ]

  assert.equal(typed[0].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#date')
  assert.equal(typed[1].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#integer')
  assert.equal(typed[2].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#boolean')
  assert.equal(typed[3].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
})

test('mapping upgrades triplify output before typed-literals', async () => {
  const typed = await serializeQuadStream(
    Readable
      .from(['# Alice\ntype :: schema:Person\nborn :: 2024-03-15\n'])
      .pipe(createTriplifyQuadTransform({ sourceId: 'Alice.md' }))
      .pipe(createCurieExpansionQuadTransform())
      .pipe(createTypedLiteralsQuadTransform())
  )

  assert.match(typed, /<urn:name:Alice> <urn:token:type> <https:\/\/schema\.org\/Person> \./)
  assert.match(typed, /<urn:name:Alice> <urn:token:born> "2024-03-15"\^\^<http:\/\/www\.w3\.org\/2001\/XMLSchema#date> \./)
})

test('rdf-ext serializer round-trips typed literals', async () => {
  const line = await serializeQuadStream(Readable.from([
    rdf.quad(
      rdf.namedNode('s'),
      rdf.namedNode('p'),
      rdf.literal('42', rdf.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
    )
  ]))

  assert.equal(line, '<s> <p> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .\n')
})

test('triplify transform handles chunked input incrementally', async () => {
  const quads = []

  for await (const quad of Readable
    .from(['---\nkind: per', 'son\n---\n\n# Alice\n## Team\nrole :: Lead\n'])
    .pipe(createTriplifyQuadTransform({ sourceId: 'Alice.md' }))) {
    quads.push(quad)
  }

  const output = await serializeQuads(quads)

  assert.match(output, /<urn:name:Alice\.md> <urn:token:kind> "person" \./)
  assert.match(output, /<urn:name:Alice%23Team> <urn:token:role> "Lead" \./)
})

test('typed-literals quad transform types literals incrementally', async () => {
  const quads = []

  for await (const quad of Readable
    .from([
      rdf.quad(rdf.namedNode('s'), rdf.namedNode('p'), rdf.literal('42')),
      rdf.quad(rdf.namedNode('s'), rdf.namedNode('p'), rdf.literal('Alice'))
    ])
    .pipe(createTypedLiteralsQuadTransform())) {
    quads.push(quad)
  }

  assert.equal(quads[0].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#integer')
  assert.equal(quads[1].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
})

test('curie expansion quad transform maps quads incrementally', async () => {
  const input = rdf.quad(
    rdf.namedNode('schema:Alice'),
    rdf.namedNode('schema:knows'),
    rdf.namedNode('schema:Person')
  )

  const quads = []

  for await (const quad of Readable
    .from([input])
    .pipe(createCurieExpansionQuadTransform())) {
    quads.push(quad)
  }

  assert.equal(quads[0].subject.value, 'https://schema.org/Alice')
  assert.equal(quads[0].predicate.value, 'https://schema.org/knows')
  assert.equal(quads[0].object.value, 'https://schema.org/Person')
})
