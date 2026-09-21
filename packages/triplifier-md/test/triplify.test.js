import test from 'node:test'
import assert from 'node:assert/strict'
import rdf from 'rdf-ext'
import { Readable } from 'node:stream'
import { triplify, internals } from '../src/triplify.js'
import { mapQuad } from '../src/curie-expansion.js'
import { typeQuad } from '../src/typed-literals.js'
import { createTriplifyQuadTransform, createMappingQuadTransform, createTypedLiteralsQuadTransform } from '../src/streams.js'
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

// Read the N-Triples back as (s, p, o) triples of raw term strings.
function triplesOf(nt) {
  return nt.trim().split('\n').filter(Boolean).map((line) => {
    const m = line.match(/^(<[^>]*>|_:\S+) (<[^>]*>) (.*) \.$/)
    const term = (t) => t.startsWith('<') ? t.slice(1, -1) : t
    const object = m[3].startsWith('"') ? JSON.parse(m[3].replace(/\^\^<[^>]*>$/, '')) : term(m[3])
    return [term(m[1]), term(m[2]), object]
  })
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDF_VALUE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value'

// The selectors of a reference, in emission order: fragments as
// [value, syntax] pairs, quotes as strings.
function selectorsOf(nt, subject) {
  const triples = triplesOf(nt)
  const get = (s, p) => triples.filter(([ts, tp]) => ts === s && tp === p).map(([, , o]) => o)
  const fragments = []
  const quotes = []
  for (const sel of get(subject, 'osg://vocab/resource#selector')) {
    const [type] = get(sel, RDF_TYPE)
    if (type === 'http://www.w3.org/ns/oa#FragmentSelector') fragments.push([get(sel, RDF_VALUE)[0], get(sel, 'http://purl.org/dc/terms/conformsTo')[0]])
    if (type === 'http://www.w3.org/ns/oa#TextQuoteSelector') quotes.push(get(sel, 'http://www.w3.org/ns/oa#exact')[0])
  }
  return { fragments, quotes }
}

// The parts (code blocks, blockquotes) of a subject, in emission order.
function partsOf(nt, subject) {
  const triples = triplesOf(nt)
  const get = (s, p) => triples.filter(([ts, tp]) => ts === s && tp === p).map(([, , o]) => o)
  return get(subject, 'https://schema.org/hasPart').map((part) => ({
    types: get(part, RDF_TYPE),
    source: get(part, 'osg://vocab/resource#source')[0],
    ...selectorsOf(nt, part),
    language: get(part, 'https://schema.org/programmingLanguage')[0] ?? null,
  }))
}

test('frontmatter stays on the document node and h1 materializes the top concept', async () => {
  const nt = await serializeQuads(triplify(`---
kind: person
status: active
---

# Alice Smith

role :: Product Manager
`, { name: 'Alice', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice\.md> <http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type> <osg:\/\/vocab\/document#File> \./)
  assert.match(nt, /<urn:name:Alice\.md> <urn:token:kind> "person" \./)
  assert.match(nt, /<urn:name:Alice\.md> <urn:token:status> "active" \./)
  assert.match(nt, /<urn:name:Alice\.md> <https:\/\/schema\.org\/about> <urn:name:Alice> \./)
  assert.match(nt, /<urn:name:Alice> <http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type> <osg:\/\/vocab\/resource#Resource> \./)
  assert.match(nt, /<urn:name:Alice> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Alice Smith" \./)
  assert.match(nt, /<urn:name:Alice> <urn:token:role> "Product Manager" \./)
  // The note is a whole resource: no source, no selector, no line.
  assert.doesNotMatch(nt, /<urn:name:Alice> <osg:\/\/vocab\/resource#(source|selector)>/)
  assert.doesNotMatch(nt, /urn:meta:/)
})

test('pre-h1 body fields stay on the document node', async () => {
  const nt = await serializeQuads(triplify(`owner :: [[Alice]]
status :: draft

# Project Atlas
maintainer :: [[Bob]]
`, { name: 'Project', file: 'Project.md' }))

  assert.match(nt, /<urn:name:Project\.md> <urn:token:owner> <urn:name:Alice> \./)
  assert.match(nt, /<urn:name:Project\.md> <urn:token:status> "draft" \./)
  assert.match(nt, /<urn:name:Project> <urn:token:maintainer> <urn:name:Bob> \./)
})

test('the reader writes every key as a token; mapQuad maps body and frontmatter keys alike', async () => {
  const content = `---
title: Front
---
knows :: [[Bob]]
title :: Example
`
  const read = triplify(content, { file: 'test.md' }).map((q) => q.predicate.value)
  assert.ok(read.includes('urn:token:knows'))
  assert.equal(read.filter((p) => p === 'urn:token:title').length, 2)

  const mappings = { knows: 'foaf:knows', title: 'dcterms:title' }
  const predicates = triplify(content, { file: 'test.md' })
    .map((q) => mapQuad(q, { mappings }).predicate.value)
  assert.ok(predicates.includes('http://xmlns.com/foaf/0.1/knows'))
  assert.equal(predicates.filter((p) => p === 'http://purl.org/dc/terms/title').length, 2)
  assert.ok(!predicates.some((p) => p.startsWith('urn:token:')))
})

test('without mappings, mapQuad maps the frontmatter terms of the document model', () => {
  const predicates = triplify('---\ntitle: T\ntags: [a]\n---\n', { file: 'test.md' })
    .map((q) => mapQuad(q).predicate.value)
  assert.ok(predicates.includes('http://www.w3.org/2000/01/rdf-schema#label'))
  assert.ok(predicates.includes('https://schema.org/keywords'))
})

test('a field key containing a colon is still parsed as a field, not a prose reference', async () => {
  const nt = await serializeQuads(triplify(`# Alice
rdfs:comment :: Alice is the primary contact.
`, { file: 'Alice.md' }).map((q) => mapQuad(q)))

  assert.match(nt, /<urn:name:Alice> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#comment> "Alice is the primary contact\." \./)
  assert.doesNotMatch(nt, /dct\/terms\/references/)
})

test('a field key with an unknown CURIE-like prefix falls back to a urn:token: predicate', async () => {
  const nt = await serializeQuads(triplify(`# Alice
acme:custom :: some value
`, { file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice> <urn:token:acme%3Acustom> "some value" \./)
})

test('options.prefixes replaces the standard prefix table', () => {
  const content = `# Alice
acme:custom :: a
rdfs:comment :: b
`
  const predicates = (options) => triplify(content, { file: 'Alice.md' })
    .map((q) => mapQuad(q, options))
    .filter((q) => q.subject.value === 'urn:name:Alice')
    .map((q) => q.predicate.value)

  const standard = predicates({})
  assert.ok(standard.includes('http://www.w3.org/2000/01/rdf-schema#comment'))
  assert.ok(standard.includes('urn:token:acme%3Acustom'))

  const replaced = predicates({ prefixes: { acme: 'http://acme.example/' } })
  assert.ok(replaced.includes('http://acme.example/custom'))
  assert.ok(replaced.includes('urn:token:rdfs%3Acomment'))
})

test('explicit name takes precedence over file-derived identity', async () => {
  const nt = await serializeQuads(triplify(`# Alice Smith
role :: Product Manager
`, { name: 'Person', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Person\.md> <https:\/\/schema\.org\/about> <urn:name:Person> \./)
  assert.match(nt, /<urn:name:Person> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Alice Smith" \./)
  assert.match(nt, /<urn:name:Person> <urn:token:role> "Product Manager" \./)
  assert.doesNotMatch(nt, /<urn:name:Alice\.md>/)
  assert.doesNotMatch(nt, /<urn:name:Alice> </)
})

test('all later headings materialize flat heading references and attach fields there', async () => {
  const nt = await serializeQuads(triplify(`# Alice

## Skills
expertise :: Python

### Skills
uses :: [sparql]

# Links
related :: [[Bob]]
`, { name: 'Alice', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice\.md> <https:\/\/schema\.org\/about> <urn:name:Alice%23Skills> \./)
  assert.match(nt, /<urn:name:Alice\.md> <https:\/\/schema\.org\/about> <urn:name:Alice%23Links> \./)
  assert.match(nt, /<urn:name:Alice%23Skills> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Skills" \./)
  assert.match(nt, /<urn:name:Alice%23Skills> <urn:token:expertise> "Python" \./)
  assert.match(nt, /<urn:name:Alice%23Skills> <urn:token:uses> <urn:token:sparql> \./)
  assert.match(nt, /<urn:name:Alice%23Links> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Links" \./)
  assert.match(nt, /<urn:name:Alice%23Links> <urn:token:related> <urn:name:Bob> \./)

  // A heading is a reference into the note: source, an Obsidian fragment
  // (identity), and per occurrence a line range and a quote of the line.
  const skills = selectorsOf(nt, 'urn:name:Alice%23Skills')
  assert.match(nt, /<urn:name:Alice%23Skills> <http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type> <osg:\/\/vocab\/resource#ResourceReference> \./)
  assert.match(nt, /<urn:name:Alice%23Skills> <osg:\/\/vocab\/resource#source> <urn:name:Alice> \./)
  assert.deepEqual(skills.fragments, [['Skills', 'https://obsidian.md/help/links'], ['line=2,3', 'http://tools.ietf.org/rfc/rfc5147'], ['line=5,6', 'http://tools.ietf.org/rfc/rfc5147']])
  assert.deepEqual(skills.quotes, ['## Skills', '### Skills'])
  const links = selectorsOf(nt, 'urn:name:Alice%23Links')
  assert.deepEqual(links.fragments, [['Links', 'https://obsidian.md/help/links'], ['line=8,9', 'http://tools.ietf.org/rfc/rfc5147']])
  assert.deepEqual(links.quotes, ['# Links'])
})

test('headings materialize even when they have no body fields', async () => {
  const nt = await serializeQuads(triplify(`# Alice

## Empty

## Filled
role :: Lead
`, { name: 'Alice', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice\.md> <https:\/\/schema\.org\/about> <urn:name:Alice%23Empty> \./)
  assert.match(nt, /<urn:name:Alice%23Empty> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Empty" \./)
  assert.deepEqual(selectorsOf(nt, 'urn:name:Alice%23Empty').fragments[1], ['line=2,3', 'http://tools.ietf.org/rfc/rfc5147'])
  assert.match(nt, /<urn:name:Alice\.md> <https:\/\/schema\.org\/about> <urn:name:Alice%23Filled> \./)
  assert.match(nt, /<urn:name:Alice%23Filled> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Filled" \./)
  assert.deepEqual(selectorsOf(nt, 'urn:name:Alice%23Filled').fragments[1], ['line=4,5', 'http://tools.ietf.org/rfc/rfc5147'])
  assert.match(nt, /<urn:name:Alice%23Filled> <urn:token:role> "Lead" \./)
})

test('wiki links describe a foreign heading but do not materialize it on the remote document', async () => {
  const nt = await serializeQuads(triplify(`# Alice

knows :: [[Bob]]
related :: [[Bob#Some Section]]
`, { name: 'Alice', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice> <urn:token:knows> <urn:name:Bob> \./)
  assert.match(nt, /<urn:name:Alice> <urn:token:related> <urn:name:Bob%23Some%20Section> \./)
  assert.doesNotMatch(nt, /<urn:name:Bob\.md>/)
  // Name plus fragment is all a heading's identity takes, so it is emitted here.
  assert.match(nt, /<urn:name:Bob%23Some%20Section> <osg:\/\/vocab\/resource#source> <urn:name:Bob> \./)
  assert.deepEqual(selectorsOf(nt, 'urn:name:Bob%23Some%20Section').fragments, [['Some Section', 'https://obsidian.md/help/links']])
  // Bob is not typed from here: only the owning file types its note.
  assert.doesNotMatch(nt, /<urn:name:Bob> </)
})

test('hash-only wikilinks resolve to the linked heading name', async () => {
  const nt = await serializeQuads(triplify(`# My Device

- is a :: [[Things I own]]

## Wifi

- is a :: [[#My Device]]
`, { name: 'My Device', file: 'My Device.md' }))

  assert.match(nt, /<urn:name:My%20Device%23Wifi> <urn:token:is%20a> <urn:name:My%20Device> \./)
  assert.doesNotMatch(nt, /<urn:name:My%20Device%23Wifi> <urn:token:is%20a> <urn:name:%23My%20Device> \./)
})

test('hash-only wikilinks to another heading resolve within the current note', async () => {
  const nt = await serializeQuads(triplify(`# Alice

See [[#Skills]] and [[#Alice]].

## Skills
`, { name: 'Alice', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice> <http:\/\/purl\.org\/dc\/terms\/references> <urn:name:Alice%23Skills> \./)
  assert.match(nt, /<urn:name:Alice> <http:\/\/purl\.org\/dc\/terms\/references> <urn:name:Alice> \./)
  assert.doesNotMatch(nt, /urn:name:%23/)
  // Described once, even though the link came before the heading.
  assert.deepEqual(selectorsOf(nt, 'urn:name:Alice%23Skills').fragments, [['Skills', 'https://obsidian.md/help/links'], ['line=4,5', 'http://tools.ietf.org/rfc/rfc5147']])
})

test('wikilink alias and image-size suffix do not leak into the concept identifier', async () => {
  const nt = await serializeQuads(triplify(`# Alice

sees :: [[Bob|Bobby]]
shows :: [[Pasted image 20260610103220.png|411]]
scoped :: [[Bob#Some Section|Display]]
`, { name: 'Alice', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice> <urn:token:sees> <urn:name:Bob> \./)
  assert.match(nt, /<urn:name:Alice> <urn:token:shows> <urn:name:Pasted%20image%2020260610103220\.png> \./)
  assert.match(nt, /<urn:name:Alice> <urn:token:scoped> <urn:name:Bob%23Some%20Section> \./)
  assert.doesNotMatch(nt, /%7C/)
})

test('markdown links in prose attach to the current subject and label the url node', async () => {
  const nt = await serializeQuads(triplify(`# Alice

## Links
See [the spec](https://example.com/spec) for details.
`, { name: 'Alice', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice%23Links> <http:\/\/purl\.org\/dc\/terms\/references> <https:\/\/example\.com\/spec> \./)
  assert.match(nt, /<https:\/\/example\.com\/spec> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "the spec" \./)
})

test('other named references in prose attach to the current subject as dct:references', async () => {
  const nt = await serializeQuads(triplify(`# Alice

## References
See [[Bob]], [sparql], schema:Person, and https://example.com/spec for details.
`, { name: 'Alice', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice%23References> <http:\/\/purl\.org\/dc\/terms\/references> <urn:name:Bob> \./)
  assert.match(nt, /<urn:name:Alice%23References> <http:\/\/purl\.org\/dc\/terms\/references> <urn:token:sparql> \./)
  // Deferred until mapQuad: a CURIE-like value is a name, not an IRI.
  assert.match(nt, /<urn:name:Alice%23References> <http:\/\/purl\.org\/dc\/terms\/references> <urn:name:schema%3APerson> \./)
  assert.match(nt, /<urn:name:Alice%23References> <http:\/\/purl\.org\/dc\/terms\/references> <https:\/\/example\.com\/spec> \./)
  assert.doesNotMatch(nt, /urn:token:_/)
})

test('named references in heading text attach to the heading reference as dct:references', async () => {
  const nt = await serializeQuads(triplify(`# Alice

## Links with [[Bob]] and [sparql]
`, { name: 'Alice', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice\.md> <https:\/\/schema\.org\/about> <urn:name:Alice%23Links%20with%20%5B%5BBob%5D%5D%20and%20%5Bsparql%5D> \./)
  assert.match(nt, /<urn:name:Alice%23Links%20with%20%5B%5BBob%5D%5D%20and%20%5Bsparql%5D> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Links with Bob and sparql" \./)
  assert.match(nt, /<urn:name:Alice%23Links%20with%20%5B%5BBob%5D%5D%20and%20%5Bsparql%5D> <http:\/\/purl\.org\/dc\/terms\/references> <urn:name:Bob> \./)
  assert.match(nt, /<urn:name:Alice%23Links%20with%20%5B%5BBob%5D%5D%20and%20%5Bsparql%5D> <http:\/\/purl\.org\/dc\/terms\/references> <urn:token:sparql> \./)
})

test('inline fields ignore fenced code blocks', async () => {
  const nt = await serializeQuads(triplify(`# Example

\`\`\`md
ignored :: value
\`\`\`

name :: Alice
`, { name: 'Example', file: 'Example.md' }))

  assert.match(nt, /<urn:name:Example> <urn:token:name> "Alice" \./)
  assert.doesNotMatch(nt, /<urn:name:Example> <urn:token:ignored> "value" \./)
  // The block is a part of the note: a reference typed as source code, with
  // the fence lines as location and the content as quote.
  const [part] = partsOf(nt, 'urn:name:Example')
  assert.deepEqual(part, {
    types: ['osg://vocab/resource#ResourceReference', 'https://schema.org/SoftwareSourceCode'],
    source: 'urn:name:Example',
    fragments: [['line=2,5', 'http://tools.ietf.org/rfc/rfc5147']],
    quotes: ['ignored :: value'],
    language: 'md',
  })
})

test('triplify auto-closes unclosed fenced code blocks at end of document', async () => {
  const nt = await serializeQuads(triplify(`# Example

\`\`\`sparql
SELECT * WHERE {
  ?s ?p ?o .
}
`, { name: 'Example', file: 'Example.md' }))

  const [part] = partsOf(nt, 'urn:name:Example')
  assert.equal(part.language, 'sparql')
  assert.match(part.quotes[0], /^SELECT \* WHERE \{/)
  assert.deepEqual(part.fragments, [['line=2,6', 'http://tools.ietf.org/rfc/rfc5147']])
})

test('a blockquote is a quotation part of the current subject', async () => {
  const nt = await serializeQuads(triplify(`# Example

> The topic
`, { name: 'Example', file: 'Example.md' }))

  const [part] = partsOf(nt, 'urn:name:Example')
  assert.deepEqual(part, {
    types: ['osg://vocab/resource#ResourceReference', 'https://schema.org/Quotation'],
    source: 'urn:name:Example',
    fragments: [['line=2,3', 'http://tools.ietf.org/rfc/rfc5147']],
    quotes: ['The topic'],
    language: null,
  })
})

test('contiguous blockquote lines become one quotation and do not parse fields', async () => {
  const nt = await serializeQuads(triplify(`# Example

> first line
> role :: Lead
> [[Bob]]

name :: Alice
`, { name: 'Example', file: 'Example.md' }))

  const [part] = partsOf(nt, 'urn:name:Example')
  assert.deepEqual(part.quotes, ['first line\nrole :: Lead\n[[Bob]]'])
  assert.deepEqual(part.fragments, [['line=2,5', 'http://tools.ietf.org/rfc/rfc5147']])
  assert.doesNotMatch(nt, /<urn:name:Example> <urn:token:role> "Lead" \./)
  assert.doesNotMatch(nt, /<urn:name:Example> <http:\/\/purl\.org\/dc\/terms\/references> <urn:name:Bob> \./)
  assert.match(nt, /<urn:name:Example> <urn:token:name> "Alice" \./)
})

test('triplify skips empty wikilinks and tokens without throwing', async () => {
  const nt = await serializeQuads(triplify(`# Example

See [[ ]] and [ ] here.

ref :: [[ ]]
`, { name: 'Example', file: 'Example.md' }))

  assert.doesNotMatch(nt, /urn:name:%20*>/)
  assert.match(nt, /<urn:name:Example> <urn:token:ref> "\[\[ \]\]" \./)
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
`, { name: 'Alice', file: 'Alice.md' }))

  assert.match(nt, /<urn:name:Alice> <urn:token:born> "2024-03-15" \./)
  assert.match(nt, /<urn:name:Alice> <urn:token:count> "42" \./)
  assert.match(nt, /<urn:name:Alice> <urn:token:flag> "true" \./)
})

test('mapping expands the deferred forms in any RDF term position', () => {
  const mapped = mapQuad(rdf.quad(
    rdf.namedNode('urn:name:schema%3AAlice'),
    rdf.namedNode('urn:token:schema%3Aknows'),
    rdf.namedNode('urn:name:schema%3APerson')
  ))

  assert.equal(mapped.subject.value, 'https://schema.org/Alice')
  assert.equal(mapped.predicate.value, 'https://schema.org/knows')
  assert.equal(mapped.object.value, 'https://schema.org/Person')
})

test('mapping preserves the input named graph', () => {
  const mapped = mapQuad(rdf.quad(
    rdf.namedNode('schema:Alice'),
    rdf.namedNode('schema:knows'),
    rdf.namedNode('schema:Person'),
    rdf.namedNode('urn:my-graph')
  ))

  assert.equal(mapped.graph.value, 'urn:my-graph')
})

test('legacy typeQuad preserves scalar strings', () => {
  const typed = [
    typeQuad(rdf.quad(rdf.namedNode('urn:name:Alice'), rdf.namedNode('urn:token:born'), rdf.literal('2024-03-15'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:Alice'), rdf.namedNode('urn:token:count'), rdf.literal('42'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:Alice'), rdf.namedNode('urn:token:flag'), rdf.literal('true'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:Alice'), rdf.namedNode('urn:token:name'), rdf.literal('Alice')))
  ]

  assert.equal(typed[0].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
  assert.equal(typed[1].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
  assert.equal(typed[2].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
  assert.equal(typed[3].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
})

test('typed-literals leaves rdfs:label values as plain strings', () => {
  const typed = [
    typeQuad(rdf.quad(rdf.namedNode('urn:name:hex'), rdf.namedNode('http://www.w3.org/2000/01/rdf-schema#label'), rdf.literal('0xd34df00d'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:year'), rdf.namedNode('http://www.w3.org/2000/01/rdf-schema#label'), rdf.literal('1956'))),
    typeQuad(rdf.quad(rdf.namedNode('urn:name:date'), rdf.namedNode('http://www.w3.org/2000/01/rdf-schema#label'), rdf.literal('2025-07-18')))
  ]

  assert.equal(typed[0].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
  assert.equal(typed[1].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
  assert.equal(typed[2].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
})

test('mapping preserves scalar text through the compatibility transform', async () => {
  const typed = await serializeQuadStream(
    Readable
      .from(['# Alice\ntype :: schema:Person\nborn :: 2024-03-15\n'])
      .pipe(createTriplifyQuadTransform({ name: 'Alice', file: 'Alice.md' }))
      .pipe(createMappingQuadTransform())
      .pipe(createTypedLiteralsQuadTransform())
  )

  assert.match(typed, /<urn:name:Alice> <urn:token:type> <https:\/\/schema\.org\/Person> \./)
  assert.match(typed, /<urn:name:Alice> <urn:token:born> "2024-03-15" \./)
})

test('label quads stay plain after curie expansion and typed-literals', async () => {
  const typed = await serializeQuadStream(
    Readable
      .from(['# 2025-07-18\n## 1956\nSee [0xd34df00d](https://example.com/osg).\n'])
      .pipe(createTriplifyQuadTransform({ name: 'Alice', file: 'Alice.md' }))
      .pipe(createMappingQuadTransform())
      .pipe(createTypedLiteralsQuadTransform())
  )

  assert.match(typed, /<urn:name:Alice> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "2025-07-18" \./)
  assert.match(typed, /<urn:name:Alice%231956> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "1956" \./)
  assert.match(typed, /<https:\/\/example\.com\/osg> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "0xd34df00d" \./)
  assert.doesNotMatch(typed, /rdf-schema#label> "2025-07-18"\^\^/)
  assert.doesNotMatch(typed, /rdf-schema#label> "1956"\^\^/)
  assert.doesNotMatch(typed, /rdf-schema#label> "0xd34df00d"\^\^/)
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
    .pipe(createTriplifyQuadTransform({ name: 'Alice', file: 'Alice.md' }))) {
    quads.push(quad)
  }

  const output = await serializeQuads(quads)

  assert.match(output, /<urn:name:Alice\.md> <urn:token:kind> "person" \./)
  assert.match(output, /<urn:name:Alice%23Team> <urn:token:role> "Lead" \./)
  assert.deepEqual(selectorsOf(output, 'urn:name:Alice%23Team').fragments[1], ['line=5,6', 'http://tools.ietf.org/rfc/rfc5147'])
})

test('legacy typed-literals transform preserves strings incrementally', async () => {
  const quads = []

  for await (const quad of Readable
    .from([
      rdf.quad(rdf.namedNode('s'), rdf.namedNode('p'), rdf.literal('42')),
      rdf.quad(rdf.namedNode('s'), rdf.namedNode('p'), rdf.literal('Alice'))
    ])
    .pipe(createTypedLiteralsQuadTransform())) {
    quads.push(quad)
  }

  assert.equal(quads[0].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
  assert.equal(quads[1].object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
})

test('mapping quad transform maps quads incrementally', async () => {
  const input = rdf.quad(
    rdf.namedNode('urn:name:schema%3AAlice'),
    rdf.namedNode('urn:token:schema%3Aknows'),
    rdf.namedNode('urn:name:schema%3APerson')
  )

  const quads = []

  for await (const quad of Readable
    .from([input])
    .pipe(createMappingQuadTransform())) {
    quads.push(quad)
  }

  assert.equal(quads[0].subject.value, 'https://schema.org/Alice')
  assert.equal(quads[0].predicate.value, 'https://schema.org/knows')
  assert.equal(quads[0].object.value, 'https://schema.org/Person')
})

// What one body line means, in full. Each case lists every statement the line
// adds to the note beyond the boilerplate a bare `# N` already emits, so a
// case that states nothing is as binding as one that states something. The
// parser stays a line scanner; this table is where the syntax is agreed.
const REFERENCES = 'http://purl.org/dc/terms/references'
const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'

const LINE_SEMANTICS = [
  // `key :: value` splits on the first `::`. The left side is the token, the
  // right side takes its term from its own shape.
  ['uses :: [sparql]', [['urn:token:uses', '<urn:token:sparql>']]],
  ['uses :: [[Bob]]', [['urn:token:uses', '<urn:name:Bob>']]],
  ['uses :: schema:Person', [['urn:token:uses', '<urn:name:schema%3APerson>']]],
  ['uses :: 2026-09-18', [['urn:token:uses', '"2026-09-18"']]],
  ['- uses :: [sparql]', [['urn:token:uses', '<urn:token:sparql>']]],

  // The whitespace around `::` is noise. The three spacings are one field.
  ['uses::sparql', [['urn:token:uses', '"sparql"']]],
  ['uses ::sparql', [['urn:token:uses', '"sparql"']]],
  ['uses:: sparql', [['urn:token:uses', '"sparql"']]],
  ['lives in::Madrid', [['urn:token:lives%20in', '"Madrid"']]],
  ['rdfs:comment::Alice is the contact.', [['urn:token:rdfs%3Acomment', '"Alice is the contact."']]],

  // `::` inside a URL is not a separator. The candidate key carries link or
  // URL punctuation, so the line keeps its own reading and the link survives.
  ['[ipv6](http://[::1]/docs)', [[REFERENCES, '<http://[::1]/docs>'], [LABEL, '"ipv6"']]],
  ['See http://[::1]/docs for the host.', [[REFERENCES, '<http://[::1]/docs>']]],
  ['[[Note]] covers http://[::1]/docs', [[REFERENCES, '<urn:name:Note>'], [REFERENCES, '<http://[::1]/docs>']]],

  // Prose references, each one dct:references.
  ['plain prose, nothing to state', []],
  ['See [sparql] and [[Bob]].', [[REFERENCES, '<urn:name:Bob>'], [REFERENCES, '<urn:token:sparql>']]],
  ['See [the spec](https://example.com/spec).', [[REFERENCES, '<https://example.com/spec>'], [LABEL, '"the spec"']]],
  ['prefix [a] single char token in prose', [[REFERENCES, '<urn:token:a>']]],
  ['[x] not a list item', [[REFERENCES, '<urn:token:x>']]],

  // The checkbox of a task list item is list syntax. It states nothing, in any
  // state character, under a bullet or a number. The rest of the line is read
  // as usual. Tasks themselves are not modelled yet.
  ['- [x] Is Jabber open?', []],
  ['1. [>] Deferred', []],
  ['- [a] single char token at list head', []],
  ['- [ ] Ask [[Bob]]', [[REFERENCES, '<urn:name:Bob>']]],
  ['- [/] Read [sparql] docs', [[REFERENCES, '<urn:token:sparql>']]],
  ['- [x] Ask [[Bob]] about [sparql]', [[REFERENCES, '<urn:name:Bob>'], [REFERENCES, '<urn:token:sparql>']]],

  // A field on a task line. The checkbox is list syntax, not part of the key.
  ['- [x] due :: 2026-09-18', [['urn:token:due', '"2026-09-18"']]],
  ['- [ ] due::2026-09-18', [['urn:token:due', '"2026-09-18"']]],
  ['1. [>] due :: 2026-09-18', [['urn:token:due', '"2026-09-18"']]],
]

test('a body line states exactly what the syntax says it states', () => {
  const options = { name: 'N', file: 'N.md' }
  const boilerplate = new Set(triplify('# N\n', options).map(String))
  const show = (term) => term.termType === 'Literal' ? JSON.stringify(term.value) : `<${term.value}>`

  for (const [line, expected] of LINE_SEMANTICS) {
    const stated = triplify(`# N\n\n${line}\n`, options)
      .filter((quad) => !boilerplate.has(String(quad)))
      .map((quad) => [quad.predicate.value, show(quad.object)])

    assert.deepEqual(stated.sort(), expected.slice().sort(), `line: ${line}`)
  }
})

test('mapQuad leaves an IRI with an authority alone, even when its scheme is a known prefix', () => {
  const iri = 'osg://repo/github.com/owner/repo'
  const mapped = mapQuad(
    rdf.quad(rdf.namedNode('urn:name:A'), rdf.namedNode('urn:token:in'), rdf.namedNode(iri)),
    { prefixes: { osg: 'urn:osg:' } },
  )
  assert.equal(mapped.object.value, iri)
})

test('mapQuad percent-encodes what N-Quads rejects in an absolute IRI', () => {
  const mapped = mapQuad(rdf.quad(
    rdf.namedNode('urn:name:A'),
    rdf.namedNode('urn:token:see'),
    rdf.namedNode('https://example.org/?q=[1]'),
  ))
  assert.equal(mapped.object.value, 'https://example.org/?q=%5B1%5D')
})

test('an unknown CURIE stays a name as an object and a token as a key', () => {
  const quads = triplify('# A\nacme:k :: acme:v\n', { file: 'A.md' }).map((q) => mapQuad(q))
  const field = quads.find((q) => q.subject.value === 'urn:name:A' && q.predicate.value.startsWith('urn:token:'))
  assert.equal(field.predicate.value, 'urn:token:acme%3Ak')
  assert.equal(field.object.value, 'urn:name:acme%3Av')
})

test('a Markdown link target follows the field-value rule: an unknown scheme is a name', () => {
  const objects = triplify('# N\nsee [a](dprod:DataProduct) and [b](https://example.org/x)\n', { file: 'N.md' })
    .filter((q) => q.predicate.value === 'http://purl.org/dc/terms/references')
    .map((q) => q.object.value)
  assert.deepEqual(objects.sort(), ['https://example.org/x', 'urn:name:dprod%3ADataProduct'])

  const mapped = triplify('# N\nsee [a](dprod:DataProduct)\n', { file: 'N.md' })
    .map((q) => mapQuad(q, { prefixes: { dprod: 'https://www.omg.org/spec/DPROD/dprod/' } }))
  assert.ok(mapped.some((q) => q.object.value === 'https://www.omg.org/spec/DPROD/dprod/DataProduct'))
})

test('typed-literals keeps the graph of the quad', () => {
  const typed = typeQuad(rdf.quad(
    rdf.namedNode('urn:name:a'), rdf.namedNode('urn:token:n'), rdf.literal('5'), rdf.namedNode('urn:g'),
  ))
  assert.equal(typed.object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
  assert.equal(typed.graph.value, 'urn:g')
})
