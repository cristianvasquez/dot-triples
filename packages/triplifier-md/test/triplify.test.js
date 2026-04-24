import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import rdf from 'rdf-ext'
import { Readable } from 'node:stream'
import { triplify, internals } from '../src/triplify.js'
import { mapQuad } from '../src/curie-expansion.js'
import { typeQuad } from '../src/typed-literals.js'
import { createTriplifyQuadTransform, createCurieExpansionQuadTransform, createTypedLiteralsQuadTransform } from '../src/streams.js'
import { serializeNTriplesStream } from '../src/serialize.js'
import { MAPPINGS } from '../src/terms.js'

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

test('frontmatter becomes triples and uri overrides the subject', async () => {
  const nt = await serializeQuads(triplify(`---
uri: https://example.com/people/alice
title: Alice
tags: [person, staff]
---

role :: Product Manager
`))

  assert.match(nt, /^<https:\/\/example.com\/people\/alice> <rdfs:label> "Alice" \./m)
  assert.match(nt, /<https:\/\/example.com\/people\/alice> <urn:property:tags> "person" \./)
  assert.match(nt, /<https:\/\/example.com\/people\/alice> <urn:property:tags> "staff" \./)
  assert.match(nt, /<https:\/\/example.com\/people\/alice> <urn:property:role> "Product Manager" \./)
})

test('inline fields ignore fenced code blocks', async () => {
  const nt = await serializeQuads(triplify(`# Example

\`\`\`md
ignored :: value
\`\`\`

name :: Alice
  `))

  assert.match(nt, /<urn:name:stdin> <urn:property:name> "Alice" \./)
  assert.match(nt, /<urn:name:stdin> <urn:code-block:md> "ignored :: value" \./)
  assert.doesNotMatch(nt, /<urn:name:stdin> <urn:property:ignored> "value" \./)
})

test('fenced code blocks emit plain-literal triples on the current subject', async () => {
  const nt = await serializeQuads(triplify(`query :: keep parsing

\`\`\`sparql
SELECT * WHERE {
  ?s ?p ?o .
}
\`\`\`
  `))

  assert.match(nt, /<urn:name:stdin> <urn:property:query> "keep parsing" \./)
  assert.match(nt, /<urn:name:stdin> <urn:code-block:sparql> "SELECT \* WHERE \{\\n  \?s \?p \?o \.\\n\}" \./)
})

test('triplify fails on unclosed fenced code blocks', () => {
  assert.throws(
    () => triplify(`## Queries

\`\`\`sparql
SELECT * WHERE {
  ?s ?p ?o .
}
`),
    /Unclosed fenced code block in stdin/
  )
})

test('fenced code blocks attach to the active section subject', async () => {
  const nt = await serializeQuads(triplify(`## Queries

\`\`\`sparql
ASK {}
\`\`\`
`))

  assert.match(nt, /<urn:name:stdin#Queries> <rdfs:label> "Queries" \./)
  assert.match(nt, /<urn:name:stdin#Queries> <urn:code-block:sparql> "ASK \{\}" \./)
})

test('bullet list markers are ignored before parsing inline fields', async () => {
  const nt = await serializeQuads(triplify(`- is a :: [[Researcher]]
* knows :: [[Alice]]
+ role :: Engineer
`))

  assert.match(nt, /<urn:name:stdin> <rdf:type> <urn:name:Researcher> \./)
  assert.match(nt, /<urn:name:stdin> <urn:property:knows> <urn:name:Alice> \./)
  assert.match(nt, /<urn:name:stdin> <urn:property:role> "Engineer" \./)
  assert.doesNotMatch(nt, /urn:property:-%20is%20a/)
})

test('default heading partitioning uses big-tool heading subjects', async () => {
  const nt = await serializeQuads(triplify(`# Team
owner :: Cristian

## Alice
role :: Product Manager

### Skills
expertise :: Research

## Bob
role :: Developer
`))

  assert.match(nt, /<urn:name:stdin> <urn:property:owner> "Cristian" \./)
  assert.match(nt, /<urn:name:stdin#Alice> <rdfs:label> "Alice" \./)
  assert.match(nt, /<urn:name:stdin#Alice> <urn:property:role> "Product Manager" \./)
  assert.match(nt, /<urn:name:stdin#Skills> <rdfs:label> "Skills" \./)
  assert.match(nt, /<urn:name:stdin#Skills> <urn:property:expertise> "Research" \./)
  assert.match(nt, /<urn:name:stdin#Bob> <urn:property:role> "Developer" \./)
})

test('h1 does not create a separate entity in the default heading mode', async () => {
  const nt = await serializeQuads(triplify(`# Team
role :: Document Role
`))

  assert.match(nt, /<urn:name:stdin> <urn:property:role> "Document Role" \./)
  assert.doesNotMatch(nt, /<urn:name:stdin#Team>/)
})

test('heading labels stay plain literals even when the heading looks like a resource', async () => {
  const nt = await serializeQuads(triplify(`## [[Next steps]]
`))

  assert.match(nt, /<urn:name:stdin#%5B%5BNext%20steps%5D%5D> <rdfs:label> "\[\[Next steps\]\]" \./)
  assert.doesNotMatch(nt, /<urn:name:Next%20steps>/)
})

test('hash in heading text is percent-encoded so the section IRI stays valid', async () => {
  const nt = await serializeQuads(triplify(`## Subsection #person
property :: value

## [[Flow based programming#Rete.js]]
other :: thing
`))

  assert.match(nt, /<urn:name:stdin#Subsection%20%23person> <rdfs:label> "Subsection #person" \./)
  assert.match(nt, /<urn:name:stdin#Subsection%20%23person> <urn:property:property> "value" \./)
  assert.match(nt, /<urn:name:stdin#%5B%5BFlow%20based%20programming%23Rete.js%5D%5D> <rdfs:label> "\[\[Flow based programming#Rete\.js\]\]" \./)
  assert.doesNotMatch(nt, /urn:name:stdin#[^>]*#/)
})

test('triplify leaves curies untouched until the mapping step', async () => {
  const nt = await serializeQuads(triplify(`born :: 2024-03-15
knows :: [[Bob Smith]]
type :: schema:Person
`))

  assert.match(nt, /<urn:property:born> "2024-03-15" \./)
  assert.match(nt, /<urn:property:knows> <urn:name:Bob%20Smith> \./)
  assert.match(nt, /<rdf:type> <schema:Person> \./)
})

test('triplify preserves unknown curie-shaped values as named nodes', async () => {
  const nt = await serializeQuads(triplify('related :: ex:Thing\n'))

  assert.match(nt, /<urn:property:related> <ex:Thing> \./)
  assert.doesNotMatch(nt, /<urn:name:ex:Thing>/)
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

test('predicate aliases are read from mappings.json', () => {
  assert.equal(MAPPINGS['is a'], 'rdf:type')
  assert.equal(MAPPINGS.a, 'rdf:type')
  assert.equal(MAPPINGS.type, 'rdf:type')
})


test('mapping rewrites parsed quad terms instead of raw text fragments', () => {
  const quad = rdf.quad(
    rdf.namedNode('schema:Alice'),
    rdf.namedNode('schema:knows'),
    rdf.namedNode('schema:Person')
  )

  const mapped = mapQuad(quad)

  assert.equal(mapped.subject.value, 'https://schema.org/Alice')
  assert.equal(mapped.predicate.value, 'https://schema.org/knows')
  assert.equal(mapped.object.value, 'https://schema.org/Person')
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
  const nt = await serializeQuads(triplify(`born :: \`2024-03-15\`
count :: \`42\`
flag :: \`true\`
`))

  assert.match(nt, /<urn:property:born> "2024-03-15" \./)
  assert.match(nt, /<urn:property:count> "42" \./)
  assert.match(nt, /<urn:property:flag> "true" \./)
})

test('typed-literals upgrades plain literals in a later pipe', () => {
  const typed = [
    typeQuad(rdf.quad(rdf.namedNode('urn:name:stdin'), rdf.namedNode('urn:property:born'), rdf.literal('2024-03-15'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:stdin'), rdf.namedNode('urn:property:count'), rdf.literal('42'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:stdin'), rdf.namedNode('urn:property:flag'), rdf.literal('true'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:stdin'), rdf.namedNode('urn:property:name'), rdf.literal('Alice')))
  ]

  assert.equal(typed[0].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#date')
  assert.equal(typed[1].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#integer')
  assert.equal(typed[2].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#boolean')
  assert.equal(typed[3].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
})

test('mapping upgrades triplify output before typed-literals', async () => {
  const typed = await serializeQuadStream(
    Readable
      .from(['type :: schema:Person\nborn :: 2024-03-15\n'])
      .pipe(createTriplifyQuadTransform())
      .pipe(createCurieExpansionQuadTransform())
      .pipe(createTypedLiteralsQuadTransform())
  )

  assert.match(typed, /<http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type> <https:\/\/schema\.org\/Person> \./)
  assert.match(typed, /<urn:property:born> "2024-03-15"\^\^<http:\/\/www\.w3\.org\/2001\/XMLSchema#date> \./)
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
    .from(['---\ntitle: A', 'lice\n---\n\n## Team\nrole :: Lead\n'])
    .pipe(createTriplifyQuadTransform({ sourceId: 'alice.md' }))) {
    quads.push(quad)
  }

  const output = await serializeQuads(quads)

  assert.match(output, /^<urn:name:alice> <rdfs:label> "Alice" \./m)
  assert.match(output, /<urn:name:alice#Team> <urn:property:role> "Lead" \./)
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

test('typed-literals export types a quad directly', () => {
  const typed = typeQuad(
    rdf.quad(rdf.namedNode('s'), rdf.namedNode('p'), rdf.literal('42'))
  )

  assert.equal(typed.object.datatype.value, 'http://www.w3.org/2001/XMLSchema#integer')
})

test('cli runs the full pipeline before serialization', () => {
  const stdout = execFileSync(
    process.execPath,
    ['src/cli.js'],
    {
      cwd: process.cwd(),
      input: 'type :: schema:Person\nborn :: 2024-03-15\n',
      encoding: 'utf8'
    }
  )

  assert.match(stdout, /<http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type> <https:\/\/schema\.org\/Person> \./)
  assert.match(stdout, /<urn:property:born> "2024-03-15"\^\^<http:\/\/www\.w3\.org\/2001\/XMLSchema#date> \./)
})

test('cli fails with a clear error on unclosed fenced code blocks', () => {
  assert.throws(
    () => execFileSync(
      process.execPath,
      ['src/cli.js', 'broken.md'],
      {
        cwd: process.cwd(),
        input: '```bash\necho hi\n',
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }
    ),
    error => {
      assert.equal(error.status, 1)
      assert.match(error.stderr, /Unclosed fenced code block in broken\.md/)
      return true
    }
  )
})
