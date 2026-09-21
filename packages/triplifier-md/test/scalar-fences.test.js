import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { triplifyToQuads, createTriplifyQuadTransform, createMappingQuadTransform } from '../src/index.js'

const values = ['9007199254740993', '00123', '1.0', '1e3', '0x10', 'true', 'false', 'null', '2026-02-30', '2026/01/02']
const content = ['---', ...values.map((v, i) => `v${i}: ${v}`), 'tags: ["2026"]', '---', '# Note', ...values.map((v, i) => `v${i} :: ${v}`)].join('\n')
function checkScalars(quads) {
  for (const subject of ['urn:name:Note.md', 'urn:name:Note']) {
    values.forEach((value, i) => {
      const q = quads.find(q => q.subject.value === subject && q.predicate.value === `urn:token:v${i}`)
      assert.equal(q?.object.value, value)
      assert.equal(q.object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
    })
  }
  const tag = quads.find(q => q.predicate.value === 'https://schema.org/keywords')
  assert.equal(tag.object.value, '2026')
  assert.equal(tag.object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
}

test('API and chunked pipeline preserve scalar spellings in frontmatter and body', async () => {
  checkScalars(triplifyToQuads(content, { name: 'Note' }))
  const quads = []
  for await (const q of Readable.from([...Buffer.from(content)].map(b => Buffer.from([b])))
    .pipe(createTriplifyQuadTransform({ name: 'Note' })).pipe(createMappingQuadTransform())) quads.push(q)
  checkScalars(quads)
})

test('CLI preserves large IDs and scalar strings', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), 'Note.md'], { input: content, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  values.forEach((value, i) => assert.ok(result.stdout.includes(`<urn:token:v${i}> "${value}" .`)))
})

for (const [name, lines] of [
  ['tilde', ['~~~js', 'hidden :: yes', '[[Hidden]]', '~~~']],
  ['long backtick', ['````js', '```', 'hidden :: yes', '[[Hidden]]', '````']],
  ['invalid closer', ['```js', '```not-a-close', 'hidden :: yes', '[[Hidden]]', '```']],
  ['mixed markers', ['~~~', '```', 'hidden :: yes', '[[Hidden]]', '~~~']],
  ['indented CRLF', ['   ~~~js\r', 'hidden :: yes\r', '[[Hidden]]\r', '   ~~~~\r']],
]) {
  test(`${name} fence keeps content out of facts and resumes after closing`, () => {
    const quads = triplifyToQuads(['# Note', ...lines, 'visible :: yes'].join('\n'), { name: 'Note' })
    assert.ok(!quads.some(q => q.predicate.value === 'urn:token:hidden' || q.object.value === 'urn:name:Hidden'))
    assert.ok(quads.some(q => q.predicate.value === 'urn:token:visible'))
    assert.equal(quads.filter(q => q.object.value === 'https://schema.org/SoftwareSourceCode').length, 1)
    assert.ok(quads.some(q => q.object.value === `line=1,${lines.length + 1}`))
  })
}
