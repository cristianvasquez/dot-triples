import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { vocab } from 'canonical-md'
import { triplify } from '../src/triplify.js'
import { mapQuad } from '../src/curie-expansion.js'
import { createTriplifyQuadTransform } from '../src/streams.js'

const content = '# Example\n## Section\n```js\nx()\n```\n> same\n\n> same\n'
const objects = (quads, predicate) => quads.filter(q => q.predicate.equals(predicate)).map(q => q.object)

test('Markdown emits identical named nodes across calls and stream chunks', async () => {
  const options = { name: 'Example' }
  const quads = triplify(content, options)
  for (const q of quads) {
    for (const term of [q.subject, q.predicate, q.object, q.graph]) {
      assert.notEqual(term.termType, 'BlankNode')
    }
  }
  assert.deepEqual(triplify(content, options), quads)
  const streamed = []
  const bytes = Buffer.from(content)
  for await (const q of Readable.from([...bytes].map(byte => Buffer.from([byte])))
    .pipe(createTriplifyQuadTransform(options))) streamed.push(q)
  assert.deepEqual(streamed, quads)
  const structural = q => [q.subject, q.object].filter(t => /^urn:(selector|reference):/.test(t.value))
  assert.deepEqual(quads.map(q => structural(mapQuad(q))), quads.map(structural))
})

test('part identity follows source and line range, while equal quotes share a selector', () => {
  const quads = triplify(content, { name: 'Example' })
  const parts = objects(quads, vocab.hasPart)
  assert.equal(parts.length, 3)
  assert.equal(new Set(parts.map(p => p.value)).size, 3)
  assert.equal(parts[0].value,
    'urn:reference:urn%3Aname%3AExample:http%3A%2F%2Ftools.ietf.org%2Frfc%2Frfc5147:line%3D2%2C5')

  const quoteSelectors = part => quads.filter(q => q.subject.equals(part) && q.predicate.equals(vocab.selector))
    .map(q => q.object).filter(t => t.value.startsWith('urn:selector:quote:'))
  assert.deepEqual(quoteSelectors(parts[1]), quoteSelectors(parts[2]))

  const other = objects(triplify(content, { name: 'Other' }), vocab.hasPart)
  assert.ok(other.every(p => !parts.some(original => p.equals(original))))
  const moved = objects(triplify('\n' + content, { name: 'Example' }), vocab.hasPart)
  assert.ok(moved.every((p, i) => !p.equals(parts[i])))
  const edited = objects(triplify(content.replace('x()', 'y()'), { name: 'Example' }), vocab.hasPart)
  assert.deepEqual(edited, parts)
})

test('heading selectors are shared between a link and its target document', () => {
  const target = triplify('# Example\n## Section', { name: 'Example' })
  const linked = triplify('[[Example#Section]]', { name: 'Other' })
  const selectors = objects(linked, vocab.selector)
  assert.equal(selectors.length, 1)
  assert.ok(objects(target, vocab.selector).some(t => t.equals(selectors[0])))
})
