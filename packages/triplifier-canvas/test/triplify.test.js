import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import {
  canProcess,
  createCanvasQuadTransform,
  triplifyCanvas,
  triplifyToQuads,
} from '../src/index.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixture = name => readFileSync(join(fixtures, name), 'utf8')

const NAME = 'urn:name:'
const OA = 'http://www.w3.org/ns/oa#'
const RESOURCE = 'osg://vocab/resource#'
const DCT = 'http://purl.org/dc/terms/'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDF_VALUE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'

// Blank node labels come from a process-global counter, so they are renamed in
// order of appearance before comparison.
function lines (quads) {
  const seen = new Map()
  const term = t => {
    if (t.termType === 'BlankNode') {
      if (!seen.has(t.value)) seen.set(t.value, `_:b${seen.size}`)
      return seen.get(t.value)
    }
    if (t.termType === 'Literal') {
      const datatype = t.datatype?.value
      const plain = !datatype || datatype === 'http://www.w3.org/2001/XMLSchema#string'
      return `"${t.value}"${plain ? '' : `^^${datatype}`}`
    }
    return `<${t.value}>`
  }
  return quads.map(q => `${term(q.subject)} ${term(q.predicate)} ${term(q.object)}`)
}

const has = (quads, line) => lines(quads).includes(line)

function objects (quads, subject, predicate) {
  return quads
    .filter(q => q.subject.value === subject && q.predicate.value === predicate)
    .map(q => q.object)
}

// The selector values a subject carries, keyed by the syntax they conform to.
function selectorValues (quads, subject) {
  const byNode = new Map()
  for (const quad of quads) {
    const node = byNode.get(quad.subject.value) ?? {}
    if (quad.predicate.value === RDF_VALUE) node.value = quad.object.value
    if (quad.predicate.value === `${DCT}conformsTo`) node.conformsTo = quad.object.value
    if (quad.predicate.value === `${OA}exact`) node.exact = quad.object.value
    byNode.set(quad.subject.value, node)
  }
  return objects(quads, subject, `${RESOURCE}selector`).map(term => byNode.get(term.value) ?? {})
}

const canvas = (nodes, edges = []) => ({ nodes, edges })
const run = (json, options = {}) => triplifyCanvas(json, { name: 'board.canvas', ...options })

const textNode = (id, text, box = {}) => ({
  type: 'text', id, text, x: 0, y: 0, width: 100, height: 100, ...box,
})
const fileNode = (id, file, extra = {}) => ({
  type: 'file', id, file, x: 0, y: 0, width: 100, height: 100, ...extra,
})

test('canProcess accepts .canvas only', () => {
  assert.equal(canProcess('/vault/Board.canvas'), true)
  assert.equal(canProcess('/vault/Board.md'), false)
})

test('the canvas is a File keeping its extension in its name', () => {
  const quads = run(canvas([]))
  assert.ok(has(quads, `<${NAME}board.canvas> <${RDF_TYPE}> <osg://vocab/document#File>`))
  assert.ok(has(quads, `<${NAME}board.canvas> <${RDFS_LABEL}> "board"`))
})

test('the name is derived from the file path when no name is given', () => {
  const quads = triplifyCanvas(canvas([]), { file: '/vault/boards/My Board.canvas' })
  assert.ok(has(quads, `<${NAME}My%20Board.canvas> <${RDF_TYPE}> <osg://vocab/document#File>`))
  assert.ok(has(quads, `<${NAME}My%20Board.canvas> <${RDFS_LABEL}> "My Board"`))
})

test('triplifyCanvas requires a name or a file', () => {
  assert.throws(() => triplifyCanvas(canvas([]), {}), /requires a name or file/)
})

test('a node is an anchor with an id selector and a rectangle', () => {
  const quads = run(canvas([textNode('n1', 'hello', { x: -10, y: 20, width: 250, height: 56 })]))
  const anchor = `${NAME}board.canvas%23n1`

  assert.ok(has(quads, `<${anchor}> <${RDF_TYPE}> <${RESOURCE}ResourceReference>`))
  assert.ok(has(quads, `<${anchor}> <${RESOURCE}source> <${NAME}board.canvas>`))
  assert.ok(has(quads, `<${NAME}board.canvas> <https://schema.org/about> <${anchor}>`))

  assert.deepEqual(selectorValues(quads, anchor), [
    { value: 'n1', conformsTo: 'https://jsoncanvas.org/spec/1.0/' },
    { value: 'xywh=-10,20,250,56', conformsTo: 'http://www.w3.org/TR/media-frags/' },
    { exact: 'hello' },
  ])
})

test('a node without geometry gets no rectangle', () => {
  const quads = run(canvas([{ type: 'text', id: 'n1', text: 'hello' }]))
  const syntaxes = selectorValues(quads, `${NAME}board.canvas%23n1`).map(s => s.conformsTo)
  assert.deepEqual(syntaxes, ['https://jsoncanvas.org/spec/1.0/', undefined])
})

test('a node with no id, and a repeated id, are dropped', () => {
  const quads = run(canvas([
    textNode('', 'no id'),
    textNode('n1', 'first'),
    textNode('n1', 'second'),
  ]))
  const anchors = objects(quads, `${NAME}board.canvas`, 'https://schema.org/about')
  assert.deepEqual(anchors.map(t => t.value), [`${NAME}board.canvas%23n1`])
  assert.ok(lines(quads).some(line => line.endsWith(`<${OA}exact> "first"`)))
  assert.ok(!lines(quads).some(line => line.includes('"second"')))
})

test('a file node points at the note, Markdown losing its extension', () => {
  const quads = run(canvas([fileNode('n1', 'bob/Bob.md'), fileNode('n2', 'houses/img.png')]))
  assert.ok(has(quads, `<${NAME}board.canvas%23n1> <${DCT}references> <${NAME}Bob>`))
  assert.ok(has(quads, `<${NAME}board.canvas%23n2> <${DCT}references> <${NAME}img.png>`))
})

test('a file node subpath gives the heading its identity', () => {
  const quads = run(canvas([fileNode('n1', 'Bob.md', { subpath: '#Bio' })]))
  const heading = `${NAME}Bob%23Bio`

  assert.ok(has(quads, `<${NAME}board.canvas%23n1> <${DCT}references> <${heading}>`))
  assert.ok(has(quads, `<${heading}> <${RDF_TYPE}> <${RESOURCE}ResourceReference>`))
  assert.ok(has(quads, `<${heading}> <${RESOURCE}source> <${NAME}Bob>`))
  assert.deepEqual(selectorValues(quads, heading), [
    { value: 'Bio', conformsTo: 'https://obsidian.md/help/links' },
  ])
})

test('a link node points at its URL', () => {
  const quads = run(canvas([{ type: 'link', id: 'n1', url: 'https://example.com/spec' }]))
  assert.ok(has(quads, `<${NAME}board.canvas%23n1> <${DCT}references> <https://example.com/spec>`))
})

test('a text card carries its text and its fields', () => {
  const quads = run(canvas([textNode('n1', '## Bob\nrole :: Product Manager\nknows :: [[Alice]]\nsee [[Person]]')]))
  const anchor = `${NAME}board.canvas%23n1`

  assert.ok(has(quads, `<${anchor}> <urn:token:role> "Product Manager"`))
  assert.ok(has(quads, `<${anchor}> <urn:token:knows> <${NAME}Alice>`))
  assert.ok(has(quads, `<${anchor}> <${DCT}references> <${NAME}Person>`))
})

test('a group carries its label and holds the nodes drawn inside it', () => {
  const quads = run(canvas([
    { type: 'group', id: 'outer', label: 'Entities', x: 0, y: 0, width: 1000, height: 1000 },
    { type: 'group', id: 'inner', label: 'Friends', x: 10, y: 10, width: 500, height: 500 },
    textNode('card', 'Bob', { x: 20, y: 20, width: 100, height: 100 }),
    textNode('outside', 'Elsewhere', { x: 5000, y: 5000, width: 100, height: 100 }),
  ]))
  const anchor = id => `${NAME}board.canvas%23${id}`

  assert.ok(has(quads, `<${anchor('outer')}> <${RDFS_LABEL}> "Entities"`))
  // The smallest containing group only: nesting is a tree, the rest is its
  // transitive closure.
  assert.ok(has(quads, `<${anchor('outer')}> <${DCT}hasPart> <${anchor('inner')}>`))
  assert.ok(has(quads, `<${anchor('inner')}> <${DCT}hasPart> <${anchor('card')}>`))
  assert.ok(!has(quads, `<${anchor('outer')}> <${DCT}hasPart> <${anchor('card')}>`))
  assert.ok(!lines(quads).some(line => line.includes(`hasPart> <${anchor('outside')}>`)))
})

test('a group holds what a node points at, not the anchor that draws it', () => {
  const quads = run(canvas([
    { type: 'group', id: 'outer', label: 'Entities', x: 0, y: 0, width: 1000, height: 1000 },
    { type: 'group', id: 'inner', label: 'Friends', x: 10, y: 10, width: 500, height: 500 },
    { ...fileNode('note', 'bob/Bob.md'), x: 20, y: 20, width: 100, height: 100 },
    { type: 'link', id: 'url', url: 'https://example.com/spec', x: 20, y: 200, width: 100, height: 100 },
    textNode('card', 'Bob', { x: 20, y: 400, width: 100, height: 100 }),
  ]))
  const anchor = id => `${NAME}board.canvas%23${id}`

  // A group is a rectangle and points at nothing, so it is held as its anchor.
  assert.ok(has(quads, `<${anchor('outer')}> <${DCT}hasPart> <${anchor('inner')}>`))
  // A note in a group is held as the note, a link as its URL.
  assert.ok(has(quads, `<${anchor('inner')}> <${DCT}hasPart> <${NAME}Bob>`))
  assert.ok(has(quads, `<${anchor('inner')}> <${DCT}hasPart> <https://example.com/spec>`))
  assert.ok(!has(quads, `<${anchor('inner')}> <${DCT}hasPart> <${anchor('note')}>`))
  // A text card points at nothing either.
  assert.ok(has(quads, `<${anchor('inner')}> <${DCT}hasPart> <${anchor('card')}>`))
})

test('a labelled edge states a property between the notes the two ends point at', () => {
  const quads = run(canvas(
    [fileNode('n1', 'Bob.md'), fileNode('n2', 'houses/BobHouse.md')],
    [{ id: 'e1', fromNode: 'n1', toNode: 'n2', label: 'lives in' }],
  ))
  assert.ok(has(quads, `<${NAME}Bob> <urn:token:lives%20in> <${NAME}BobHouse>`))
})

test('an edge between two cards states the property between the anchors', () => {
  const quads = run(canvas(
    [textNode('n1', '## Bob'), textNode('n2', '## Ice cream')],
    [{ id: 'e1', fromNode: 'n1', toNode: 'n2', label: 'likes' }],
  ))
  assert.ok(has(quads, `<${NAME}board.canvas%23n1> <urn:token:likes> <${NAME}board.canvas%23n2>`))
})

test('an edge label resolves like a field key: mapping, then known prefix, then token', () => {
  // The reader writes the label as a token; triplifyToQuads maps it.
  const mapped = (json, options = {}) => triplifyToQuads(json, { name: 'board.canvas', ...options })
  const nodes = [textNode('n1', 'a'), textNode('n2', 'b')]
  const edge = label => canvas(nodes, [{ id: 'e1', fromNode: 'n1', toNode: 'n2', label }])
  const anchors = `<${NAME}board.canvas%23n1> %s <${NAME}board.canvas%23n2>`
  const property = (quads, predicate) => has(quads, anchors.replace('%s', `<${predicate}>`))

  assert.ok(property(mapped(edge('knows'), { mappings: { knows: 'http://xmlns.com/foaf/0.1/knows' } }),
    'http://xmlns.com/foaf/0.1/knows'))
  assert.ok(property(mapped(edge('rdfs:seeAlso')), 'http://www.w3.org/2000/01/rdf-schema#seeAlso'))
  assert.ok(property(mapped(edge('ex:details'), { prefixes: { ex: 'http://example.org/' } }),
    'http://example.org/details'))
  assert.ok(property(mapped(edge('ex:details')), 'urn:token:ex%3Adetails'))
  assert.ok(property(mapped(edge('lives in')), 'urn:token:lives%20in'))
})

test('an edge label that is an absolute IRI is the predicate, verbatim', () => {
  const quads = run(canvas(
    [textNode('n1', 'a'), textNode('n2', 'b')],
    [{ id: 'e1', fromNode: 'n1', toNode: 'n2', label: 'https://schema.org/knows' }],
  ))
  assert.ok(has(quads, `<${NAME}board.canvas%23n1> <https://schema.org/knows> <${NAME}board.canvas%23n2>`))
})

test('an edge label is read as one line', () => {
  const quads = run(canvas(
    [textNode('n1', 'a'), textNode('n2', 'b')],
    [{ id: 'e1', fromNode: 'n1', toNode: 'n2', label: 'lives\n  in' }],
  ))
  assert.ok(has(quads, `<${NAME}board.canvas%23n1> <urn:token:lives%20in> <${NAME}board.canvas%23n2>`))
})

test('an unlabelled edge is a reference', () => {
  const quads = run(canvas(
    [textNode('n1', 'a'), textNode('n2', 'b')],
    [{ id: 'e1', fromNode: 'n1', toNode: 'n2' }],
  ))
  assert.ok(has(quads, `<${NAME}board.canvas%23n1> <${DCT}references> <${NAME}board.canvas%23n2>`))
})

test('the arrowheads decide which way the property runs', () => {
  const nodes = [fileNode('n1', 'Bob.md'), fileNode('n2', 'Alice.md')]
  const drawn = ends => run(canvas(nodes, [{ id: 'e1', fromNode: 'n1', toNode: 'n2', label: 'knows', ...ends }]))
  const forward = `<${NAME}Bob> <urn:token:knows> <${NAME}Alice>`
  const backward = `<${NAME}Alice> <urn:token:knows> <${NAME}Bob>`

  const arrowToTo = drawn({})
  assert.ok(has(arrowToTo, forward) && !has(arrowToTo, backward))

  const arrowToFrom = drawn({ fromEnd: 'arrow', toEnd: 'none' })
  assert.ok(!has(arrowToFrom, forward) && has(arrowToFrom, backward))

  const bothEnds = drawn({ fromEnd: 'arrow', toEnd: 'arrow' })
  assert.ok(has(bothEnds, forward) && has(bothEnds, backward))

  const plainLine = drawn({ fromEnd: 'none', toEnd: 'none' })
  assert.ok(has(plainLine, forward) && !has(plainLine, backward))
})

test('an edge to a node that is not in the file states nothing', () => {
  const quads = run(canvas(
    [textNode('n1', 'a')],
    [{ id: 'e1', fromNode: 'n1', toNode: 'missing', label: 'knows' }],
  ))
  assert.ok(!lines(quads).some(line => line.includes('urn:token:knows')))
})

test('an empty canvas, and one with no nodes or edges key, produce the file alone', () => {
  assert.equal(run({}).length, 2)
  assert.equal(run(canvas([])).length, 2)
})

test('malformed JSON fails', () => {
  assert.throws(() => run('{ not json'), SyntaxError)
})

test('Buffer input preserves nodes, edges and Unicode text', () => {
  const json = canvas([textNode('a', 'café'), textNode('b', '東京')], [
    { id: 'edge', fromNode: 'a', toNode: 'b', label: 'knows' },
  ])
  const content = JSON.stringify(json)
  assert.deepEqual(lines(run(Buffer.from(content))), lines(run(content)))
  assert.throws(() => run(Buffer.from('{ not json')), SyntaxError)
})

test('fenced code is retained as text without asserting its fields or links', () => {
  for (const [open, interior, close] of [
    ['```js', '~~~', '```'], ['~~~', '```', '~~~~'], ['````', '```', '````'],
  ]) {
    const content = [open, 'knows :: [[Alice]]', '[[Hidden]]', interior, 'hidden :: true', close,
      'count :: 3', '[[Visible]]'].join('\n')
    const quads = run(canvas([textNode('a', content)]))
    const anchor = `${NAME}board.canvas%23a`
    assert.equal(objects(quads, anchor, 'urn:token:knows').length, 0)
    assert.equal(objects(quads, anchor, 'urn:token:hidden').length, 0)
    assert.deepEqual(objects(quads, anchor, `${DCT}references`).map(t => t.value), [`${NAME}Visible`])
    assert.equal(objects(quads, anchor, 'urn:token:count')[0].value, '3')
    assert.ok(quads.some(q => q.predicate.value === `${OA}exact` && q.object.value === content))
  }
})

test('an unclosed fence ends at the card boundary', () => {
  const quads = run(canvas([
    textNode('a', '```\nknows :: [[Alice]]'),
    textNode('b', 'knows :: [[Bob]]'),
  ]))
  assert.equal(objects(quads, `${NAME}board.canvas%23a`, 'urn:token:knows').length, 0)
  assert.equal(objects(quads, `${NAME}board.canvas%23b`, 'urn:token:knows')[0].value, `${NAME}Bob`)
})

test('CRLF fences suppress facts until a valid closing fence', () => {
  const text = ['  ```js', 'knows :: [[Alice]]', '  ```still code',
    'hidden :: true', '  ```', 'count :: 3'].join('\r\n')
  const quads = run(canvas([textNode('a', text)]))
  const anchor = `${NAME}board.canvas%23a`
  assert.equal(objects(quads, anchor, 'urn:token:knows').length, 0)
  assert.equal(objects(quads, anchor, 'urn:token:hidden').length, 0)
  assert.equal(objects(quads, anchor, 'urn:token:count')[0].value, '3')
})

test('the API and CLI preserve selector strings and field strings', () => {
  const content = JSON.stringify(canvas([
    textNode('00123', '00123'), textNode('false', 'false'),
    textNode('2026-09-16', '2026-09-16'), textNode('fields', 'count :: 3'),
  ]))
  const quads = triplifyToQuads(content, { name: 'board.canvas' })
  for (const quad of quads.filter(q => [RDF_VALUE, `${OA}exact`].includes(q.predicate.value))) {
    assert.equal(quad.object.datatype.value, 'http://www.w3.org/2001/XMLSchema#string')
  }
  assert.equal(objects(quads, `${NAME}board.canvas%23fields`, 'urn:token:count')[0].datatype.value,
    'http://www.w3.org/2001/XMLSchema#string')

  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), 'board.canvas'],
    { input: content, encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
  for (const value of ['00123', 'false', '2026-09-16']) {
    assert.ok(cli.stdout.includes(`<${RDF_VALUE}> "${value}" .`))
    assert.ok(cli.stdout.includes(`<${OA}exact> "${value}" .`))
  }
  assert.ok(cli.stdout.includes('<urn:token:count> "3" .'))
})

test('triplifyToQuads expands CURIEs and preserves literal strings', () => {
  const quads = triplifyToQuads(JSON.stringify(canvas([
    textNode('n1', 'count :: 3\ntype :: schema:Person'),
  ])), { name: 'board.canvas' })

  assert.ok(has(quads, `<${NAME}board.canvas%23n1> <urn:token:count> "3"`))
  assert.ok(has(quads, `<${NAME}board.canvas%23n1> <urn:token:type> <https://schema.org/Person>`))
})

test('the quad transform produces what triplifyCanvas produces', async () => {
  const content = fixture('board.canvas')
  const expected = lines(triplifyCanvas(content, { name: 'board.canvas' }))

  const streamed = []
  const transform = createCanvasQuadTransform({ name: 'board.canvas' })
  Readable.from([content.slice(0, 200), content.slice(200)]).pipe(transform)
  for await (const quad of transform) streamed.push(quad)

  assert.deepEqual(lines(streamed), expected)
})

test('an empty input produces no quads', async () => {
  const transform = createCanvasQuadTransform({ name: 'board.canvas' })
  Readable.from(['   ']).pipe(transform)
  const streamed = []
  for await (const quad of transform) streamed.push(quad)
  assert.equal(streamed.length, 0)
})

test('the example canvas states the properties its edges draw', () => {
  const quads = triplifyToQuads(fixture('board.canvas'), {
    name: 'board.canvas',
    prefixes: { ex: 'http://example.org/' },
  })

  assert.ok(has(quads, `<${NAME}Bob> <${DCT}references> <${NAME}BobHouse>`) === false)
  assert.ok(has(quads, `<${NAME}Bob> <http://example.org/details> <${NAME}Bob%20Details>`))
  assert.ok(has(quads, `<${NAME}Bob> <urn:token:lives%20in> <${NAME}BobHouse>`))
  assert.ok(has(quads, `<${NAME}Bob> <urn:token:drew> <${NAME}img.png>`))
  // The "ex:friends" group is a rectangle, not a note, so it is the anchor
  // that carries the property the edge draws.
  assert.ok(has(quads, `<${NAME}board.canvas%23539e02882770ae3f> <urn:token:Same%20as> <${NAME}Person>`))
})

test('the cards fixture links anchors and ignores its dangling edge', () => {
  const quads = triplifyToQuads(fixture('cards.canvas'), { name: 'cards.canvas' })
  const anchor = id => `${NAME}cards.canvas%23${id}`
  const references = quads.filter(q => q.predicate.value === `${DCT}references`)
  assert.deepEqual(references.map(q => [q.subject.value, q.object.value]), [
    [anchor('05f8fdf93ab87df8'), anchor('ccee2d298466cc2d')],
    [anchor('ccee2d298466cc2d'), anchor('e9992f3480f8494f')],
  ])
  assert.deepEqual(selectorValues(quads, anchor('ccee2d298466cc2d')).filter(s => s.exact),
    [{ exact: '## Alice\n\n' }])
})

test('distinct groups with equal bounds contain each other', () => {
  const quads = run(canvas(['a', 'b'].map(id => ({
    id, type: 'group', x: 0, y: 0, width: 100, height: 100,
  }))))
  const anchor = id => `${NAME}board.canvas%23${id}`
  assert.deepEqual(objects(quads, anchor('a'), `${DCT}hasPart`).map(t => t.value), [anchor('b')])
  assert.deepEqual(objects(quads, anchor('b'), `${DCT}hasPart`).map(t => t.value), [anchor('a')])
})

test('the quad transform decodes UTF-8 across byte boundaries', async () => {
  const content = JSON.stringify(canvas([textNode('a', 'café 東京 😀')]))
  const transform = createCanvasQuadTransform({ name: 'board.canvas' })
  Readable.from([...Buffer.from(content)].map(byte => Buffer.from([byte]))).pipe(transform)
  const quads = []
  for await (const quad of transform) quads.push(quad)
  assert.deepEqual(lines(quads), lines(run(content)))
})

test('the quad transform reports malformed JSON', async () => {
  const transform = createCanvasQuadTransform({ name: 'board.canvas' })
  Readable.from(['{ not json']).pipe(transform)
  await assert.rejects(async () => {
    for await (const quad of transform) assert.fail(`Unexpected quad: ${quad}`)
  }, SyntaxError)
})

test('an edge label and a link node follow the one IRI rule of triplifier-md', () => {
  const nodes = [textNode('n1', 'a'), textNode('n2', 'b')]
  const edge = label => canvas(nodes, [{ id: 'e1', fromNode: 'n1', toNode: 'n2', label }])
  const predicates = json => run(json).map(q => q.predicate.value)

  assert.ok(predicates(edge('mailto:a@b.org')).includes('mailto:a@b.org'), 'a known scheme is an IRI')
  assert.ok(predicates(edge('ftp://x.org/f')).includes('urn:token:ftp%3A%2F%2Fx.org%2Ff'), 'an unknown scheme is a token')

  const link = url => run(canvas([{ id: 'l', type: 'link', url, x: 0, y: 0, width: 1, height: 1 }], []))
    .filter(q => q.predicate.value === `${DCT}references`).map(q => q.object.value)
  assert.deepEqual(link('https://example.org/x'), ['https://example.org/x'])
  assert.deepEqual(link('ftp://x.org/f'), [`${NAME}ftp%3A%2F%2Fx.org%2Ff`])
  assert.deepEqual(link('https://example.org/a b'), [], 'a URL no IRI may carry points at nothing')
})
