import test from 'node:test'
import assert from 'node:assert/strict'
import { triplifyToQuads } from '../src/index.js'

const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'
const VALUE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value'
const PART_OF = 'http://purl.org/dc/terms/isPartOf'
const POSITION = 'https://schema.org/position'

function objects(quads, subject, predicate) {
  return quads
    .filter(q => q.subject.value === subject && q.predicate.value === predicate)
    .map(q => q.object.value)
}

test('two sections with the same heading are two records', () => {
  const quads = triplifyToQuads([
    '## Work',
    'date :: 2026-02-13',
    'First.',
    '## Work',
    'date :: 2026-02-14',
    'Second.',
  ].join('\n'), { file: 'Week.md' })

  assert.deepEqual(objects(quads, 'urn:name:Week.md#s1', 'urn:token:date'), ['2026-02-13'])
  assert.deepEqual(objects(quads, 'urn:name:Week.md#s2', 'urn:token:date'), ['2026-02-14'])
  assert.deepEqual(objects(quads, 'urn:name:Week.md#s1', VALUE), ['First.'])
  assert.deepEqual(objects(quads, 'urn:name:Week.md#s2', VALUE), ['Second.'])
  assert.deepEqual(objects(quads, 'urn:name:Week.md#s2', POSITION), ['2'])
})

test('a section has only its own text; nesting is dct:isPartOf', () => {
  const quads = triplifyToQuads([
    'Preamble.',
    '# Note',
    '## A',
    'Text of A.',
    '',
    '### A.1',
    'Text of A.1.',
    '## B',
  ].join('\n'), { file: 'Note.md' })

  assert.deepEqual(objects(quads, 'urn:name:Note.md', VALUE), ['Preamble.'])
  assert.deepEqual(objects(quads, 'urn:name:Note.md#s1', VALUE), [])
  assert.deepEqual(objects(quads, 'urn:name:Note.md#s2', VALUE), ['Text of A.'])
  assert.deepEqual(objects(quads, 'urn:name:Note.md#s3', VALUE), ['Text of A.1.'])
  assert.deepEqual(objects(quads, 'urn:name:Note.md#s1', PART_OF), ['urn:name:Note.md'])
  assert.deepEqual(objects(quads, 'urn:name:Note.md#s2', PART_OF), ['urn:name:Note.md#s1'])
  assert.deepEqual(objects(quads, 'urn:name:Note.md#s3', PART_OF), ['urn:name:Note.md#s2'])
  assert.deepEqual(objects(quads, 'urn:name:Note.md#s4', PART_OF), ['urn:name:Note.md#s1'])
})

test('a field value that is one Markdown link is an IRI labeled by the link text', () => {
  const quads = triplifyToQuads('## S\n- repository :: [repo](osg://repo/example)\n- tag :: plain text', { file: 'N.md' })

  assert.deepEqual(objects(quads, 'urn:name:N.md#s1', 'urn:token:repository'), ['osg://repo/example'])
  assert.equal(quads.find(q => q.predicate.value === 'urn:token:repository').object.termType, 'NamedNode')
  assert.deepEqual(objects(quads, 'osg://repo/example', LABEL), ['repo'])
  assert.deepEqual(objects(quads, 'urn:name:N.md#s1', 'urn:token:tag'), ['plain text'])
  assert.deepEqual(objects(quads, 'urn:name:N.md#s1', VALUE), [])
})

test('headings and fields inside a code fence are text', () => {
  const text = '```md\n# not a heading\nkey :: not a field\n```'
  const quads = triplifyToQuads(`## S\n${text}`, { file: 'N.md' })

  assert.deepEqual(objects(quads, 'urn:name:N.md#s1', VALUE), [text])
  assert.equal(quads.some(q => q.subject.value === 'urn:name:N.md#s2'), false)
  assert.equal(quads.some(q => q.predicate.value === 'urn:token:key'), false)
})

test('frontmatter goes on the file and is not text', () => {
  const quads = triplifyToQuads('---\ntitle: Week\nstatus: draft\n---\nBody.', { file: 'W.md' })

  assert.deepEqual(objects(quads, 'urn:name:W.md', LABEL), ['Week'])
  assert.deepEqual(objects(quads, 'urn:name:W.md', 'urn:token:status'), ['draft'])
  assert.deepEqual(objects(quads, 'urn:name:W.md', VALUE), ['Body.'])
})

test('a date value is xsd:date or xsd:dateTime; other values stay plain', () => {
  const quads = triplifyToQuads([
    '---',
    'created: 2026-02-13',
    '---',
    '## S',
    '- date :: 2026-02-13 22:47',
    '- start :: 2026-02-13T22:47:05',
    '- day :: 2026-02-13',
    '- bad :: 2026-02-30 10:00',
    '- note :: 2026-02-13 in the morning',
  ].join('\n'), { file: 'N.md' })

  const object = (subject, key) => quads.find(q => q.subject.value === subject && q.predicate.value === `urn:token:${key}`).object
  const XSD = 'http://www.w3.org/2001/XMLSchema#'
  const XSD_STRING = `${XSD}string`
  assert.deepEqual([object('urn:name:N.md', 'created').value, object('urn:name:N.md', 'created').datatype.value], ['2026-02-13', `${XSD}date`])
  assert.deepEqual([object('urn:name:N.md#s1', 'date').value, object('urn:name:N.md#s1', 'date').datatype.value], ['2026-02-13T22:47:00', `${XSD}dateTime`])
  assert.deepEqual([object('urn:name:N.md#s1', 'start').value, object('urn:name:N.md#s1', 'start').datatype.value], ['2026-02-13T22:47:05', `${XSD}dateTime`])
  assert.equal(object('urn:name:N.md#s1', 'day').datatype.value, `${XSD}date`)
  assert.equal(object('urn:name:N.md#s1', 'bad').datatype.value, XSD_STRING)
  assert.equal(object('urn:name:N.md#s1', 'note').datatype.value, XSD_STRING)
})
