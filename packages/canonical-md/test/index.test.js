import test from 'node:test'
import assert from 'node:assert/strict'
import * as fc from 'fast-check'
import rdf from 'rdf-ext'
import {
  UNTYPED_TOKEN,
  fileURLToPath,
  getDocName,
  getNameFromPath,
  nameFromURI,
  nameToURI,
  pathToFileURL,
  tokenFromURI,
  tokenToLiteral,
  tokenToURI,
} from '../src/index.js'

// Arbitrary: trimmed single-line non-empty string, not '_'
const nameArb = fc.string({ unit: 'grapheme', minLength: 1 }).filter(
  s => s === s.trim() && s.length > 0 && !s.includes('\n')
)

const tokenArb = fc.string({ unit: 'grapheme', minLength: 1 }).filter(
  s => s === s.trim() && s.length > 0 && !s.includes('\n') && s !== '_'
)

test('nameToURI / nameFromURI round-trip', () => {
  fc.assert(fc.property(nameArb, s => {
    assert.equal(nameFromURI(nameToURI(s)), s)
  }))
})

test('tokenToURI / tokenFromURI round-trip', () => {
  fc.assert(fc.property(tokenArb, s => {
    assert.equal(tokenFromURI(tokenToURI(s)), s)
  }))
})

test('nameToURI produces urn:name: URIs', () => {
  fc.assert(fc.property(nameArb, s => {
    assert.ok(nameToURI(s).value.startsWith('urn:name:'))
    assert.equal(nameToURI(s).termType, 'NamedNode')
  }))
})

test('tokenToURI produces urn:token: URIs', () => {
  fc.assert(fc.property(tokenArb, s => {
    assert.ok(tokenToURI(s).value.startsWith('urn:token:'))
    assert.equal(tokenToURI(s).termType, 'NamedNode')
  }))
})

test('UNTYPED_TOKEN for null, undefined, empty, _', () => {
  assert.equal(tokenToURI(null), UNTYPED_TOKEN)
  assert.equal(tokenToURI(undefined), UNTYPED_TOKEN)
  assert.equal(tokenToURI(''), UNTYPED_TOKEN)
  assert.equal(tokenToURI('_'), UNTYPED_TOKEN)
})

test('tokenFromURI returns null for UNTYPED_TOKEN', () => {
  assert.equal(tokenFromURI(UNTYPED_TOKEN), null)
})

test('cross-namespace isolation', () => {
  fc.assert(fc.property(tokenArb, s => {
    assert.equal(nameFromURI(tokenToURI(s)), null)
  }))
  fc.assert(fc.property(nameArb, s => {
    assert.equal(tokenFromURI(nameToURI(s)), null)
  }))
})

test('nameFromURI returns null for non-name terms', () => {
  assert.equal(nameFromURI(null), null)
  assert.equal(nameFromURI(rdf.namedNode('https://example.com')), null)
  assert.equal(nameFromURI(rdf.literal('Alice')), null)
})

test('tokenFromURI returns null for non-token terms', () => {
  assert.equal(tokenFromURI(null), null)
  assert.equal(tokenFromURI(rdf.namedNode('https://example.com')), null)
  assert.equal(tokenFromURI(rdf.literal('part of')), null)
})

test('nameToURI throws on null, undefined, empty', () => {
  assert.throws(() => nameToURI(null))
  assert.throws(() => nameToURI(undefined))
  assert.throws(() => nameToURI(''))
})

test('nameToURI throws on untrimmed input', () => {
  assert.throws(() => nameToURI('  Alice'))
  assert.throws(() => nameToURI('Alice  '))
  assert.throws(() => nameToURI(' Alice '))
})

test('tokenToURI throws on untrimmed input', () => {
  assert.throws(() => tokenToURI('  part of'))
  assert.throws(() => tokenToURI('part of  '))
})

test('tokenToLiteral produces a Literal', () => {
  fc.assert(fc.property(tokenArb, s => {
    const lit = tokenToLiteral(s)
    assert.equal(lit.termType, 'Literal')
    assert.equal(lit.value, s)
  }))
})

test('tokenToLiteral throws on untrimmed input', () => {
  assert.throws(() => tokenToLiteral('  part of'))
})

test('getNameFromPath derives note names from markdown file paths', () => {
  assert.equal(getNameFromPath('/some-path/bob.md'), 'bob')
  assert.equal(getNameFromPath('notes/Bob.md'), 'Bob')
  assert.equal(getNameFromPath('C:/Users/Alice/My Note.md'), 'My Note')
  assert.equal(getNameFromPath('/some-path/no-extension'), 'no-extension')
  assert.equal(getNameFromPath('/some-path/archive.tar.gz'), 'archive.tar.gz')
})

test('getDocName derives canonical document names from note names', () => {
  assert.equal(getDocName('bob'), 'bob.md')
  assert.equal(getDocName('Alice Smith'), 'Alice Smith.md')
  assert.throws(() => getDocName(null))
  assert.throws(() => getDocName(' Alice '))
})

test('file URL helpers encode and decode paths', () => {
  const unixUrl = pathToFileURL('/tmp/space here.md')
  const relativeUrl = pathToFileURL('notes/today.md')
  const windowsUrl = pathToFileURL('C:/Users/Alice/My Notes.md')

  assert.equal(unixUrl.value, 'file:///tmp/space%20here.md')
  assert.equal(relativeUrl.value, 'file:///notes/today.md')
  assert.equal(windowsUrl.value, 'file://C%3A/Users/Alice/My%20Notes.md')

  assert.equal(fileURLToPath(unixUrl), '/tmp/space here.md')
  assert.equal(fileURLToPath(relativeUrl), '/notes/today.md')
  assert.equal(fileURLToPath(windowsUrl), 'C:/Users/Alice/My Notes.md')
  assert.throws(() => fileURLToPath(rdf.namedNode('https://example.com')), /file: protocol/)
})
