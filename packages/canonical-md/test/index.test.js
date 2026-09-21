import test from 'node:test'
import assert from 'node:assert/strict'
import * as fc from 'fast-check'
import rdf from 'rdf-ext'
import {
  FRONTMATTER_TERMS,
  fragmentReferenceNode,
  fragmentSelectorNode,
  fileURLToPath,
  getDocName,
  getNameFromPath,
  lineRange,
  nameFromURI,
  nameToURI,
  parseName,
  parseToken,
  pathToFileURL,
  splitHeadingName,
  textQuoteSelectorNode,
  tokenFromURI,
  tokenToLiteral,
  tokenToURI,
  vocab,
} from '../src/index.js'

// Arbitrary: trimmed single-line non-empty string
const nameArb = fc.string({ unit: 'grapheme', minLength: 1 }).filter(
  s => s === s.trim() && s.length > 0 && !s.includes('\n')
)

const tokenArb = fc.string({ unit: 'grapheme', minLength: 1 }).filter(
  s => s === s.trim() && s.length > 0 && !s.includes('\n')
)

test('identifier validation preserves valid text without normalization', () => {
  for (const parse of [parseName, parseToken]) {
    for (const value of ['Alice', 'lives in', 'A\nB', 'café', 'e\u0301', '🦊', 'A\uFEFFB']) {
      assert.equal(parse(value), value)
    }
  }
})

test('identifier boundaries reject invalid strings and implicit coercion', () => {
  const invalid = [null, undefined, '', ' ', '\uFEFFAlice', 'Alice\u00A0',
    '\uD800', '\uDC00', 'A\uD800B', 42, true, {}, ['Alice']]
  for (const fn of [parseName, parseToken, nameToURI, tokenToURI, tokenToLiteral, getDocName]) {
    for (const value of invalid) {
      assert.throws(() => fn(value), `${fn.name} accepted ${JSON.stringify(value)}`)
    }
  }
})

test('reverse helpers reject malformed encoding and invalid decoded identifiers', () => {
  for (const [base, decode] of [['urn:name:', nameFromURI], ['urn:token:', tokenFromURI]]) {
    for (const suffix of ['', '%', '%GG', '%C3', '%ED%A0%80', '%20Alice', 'Alice%20', '\uD800']) {
      assert.equal(decode(rdf.namedNode(base + suffix)), null, base + suffix)
    }
    assert.equal(decode({ termType: 'NamedNode', value: 42 }), null)
    assert.equal(decode(rdf.namedNode(base + 'caf%C3%A9')), 'café')
    assert.equal(decode(rdf.namedNode(base + 'A%20B')), 'A B')
  }
})

test('raw path and heading components require separate name validation', () => {
  const basename = getNameFromPath('.md')
  assert.equal(basename, '')
  assert.throws(() => parseName(basename))
  for (const name of ['#Heading', 'Alice #Heading']) {
    const { note } = splitHeadingName(parseName(name))
    assert.throws(() => parseName(note))
  }
})

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

test('tokenToURI throws on null, undefined, empty', () => {
  assert.throws(() => tokenToURI(null))
  assert.throws(() => tokenToURI(undefined))
  assert.throws(() => tokenToURI(''))
})

test('splitHeadingName splits at the first # and round-trips', () => {
  assert.deepEqual(splitHeadingName('Alice'), { note: 'Alice', heading: null })
  assert.deepEqual(splitHeadingName('Alice#Methods'), { note: 'Alice', heading: 'Methods' })
  assert.deepEqual(splitHeadingName('Alice#A#B'), { note: 'Alice', heading: 'A#B' })
  fc.assert(fc.property(nameArb.filter(s => !s.includes('#')), nameArb, (note, heading) => {
    const { note: n, heading: h } = splitHeadingName(nameFromURI(nameToURI(`${note}#${heading}`)))
    assert.equal(n, note)
    assert.equal(h, heading)
  }))
})

test('lineRange follows RFC 5147: positions from 0, a 1-based line L is line=L-1,L', () => {
  assert.equal(lineRange(10), 'line=9,10')
  assert.equal(lineRange(12, 14), 'line=11,14')
  assert.throws(() => lineRange(0))
  assert.throws(() => lineRange(5, 4))
})

test('selector URIs preserve values and distinguish syntax, type, and component boundaries', () => {
  for (const value of ['', ' leading and trailing ', 'café 🦊\n"<>#%:']) {
    const selector = fragmentSelectorNode(value, vocab.RFC5147)
    assert.equal(selector.termType, 'NamedNode')
    assert.equal(decodeURIComponent(selector.value.split(':').at(-1)), value)
    assert.notEqual(selector.value, fragmentSelectorNode(value, vocab.OBSIDIAN_LINKS).value)
    assert.notEqual(selector.value, textQuoteSelectorNode(value).value)
    assert.equal(decodeURIComponent(textQuoteSelectorNode(value).value.slice('urn:selector:quote:'.length)), value)
  }
  assert.notEqual(fragmentSelectorNode('b:c', rdf.namedNode('urn:a')).value,
    fragmentSelectorNode('c', rdf.namedNode('urn:a:b')).value)
  assert.notEqual(textQuoteSelectorNode('a b').value, textQuoteSelectorNode('a%20b').value)
  const source = nameToURI('Example')
  assert.notEqual(fragmentReferenceNode(source, 'line=0,1', vocab.RFC5147).value,
    nameToURI('Example#line=0,1').value)
})

test('selector helpers reject non-string values and unnamed sources or syntaxes', () => {
  for (const value of [null, undefined, 42, {}, '\uD800']) {
    assert.throws(() => textQuoteSelectorNode(value))
    assert.throws(() => fragmentSelectorNode(value, vocab.RFC5147))
    assert.throws(() => fragmentReferenceNode(nameToURI('Example'), value, vocab.RFC5147))
  }
  for (const term of [rdf.blankNode(), rdf.literal('urn:test'), null, rdf.namedNode('')]) {
    assert.throws(() => fragmentSelectorNode('x', term))
    assert.throws(() => fragmentReferenceNode(term, 'x', vocab.RFC5147))
    assert.throws(() => fragmentReferenceNode(nameToURI('Example'), 'x', term))
  }
})

test('the vocabulary uses the https schema.org namespace and names the fragment syntaxes', () => {
  assert.equal(vocab.about.value, 'https://schema.org/about')
  assert.equal(vocab.File.value, 'osg://vocab/document#File')
  assert.equal(vocab.OBSIDIAN_LINKS.value, 'https://obsidian.md/help/links')
  assert.equal(vocab.RFC5147.value, 'http://tools.ietf.org/rfc/rfc5147')
  assert.equal(FRONTMATTER_TERMS.tags, vocab.keywords)
})

test('the prefix table is standard vocabularies only, as plain strings', async () => {
  const { PREFIXES } = await import('canonical-md/prefixes')
  assert.ok(Object.isFrozen(PREFIXES))
  for (const [prefix, namespace] of Object.entries(PREFIXES)) {
    assert.equal(typeof namespace, 'string', prefix)
    assert.match(namespace, /^https?:\/\//, prefix)
  }
  assert.equal(PREFIXES.schema, 'https://schema.org/')
  assert.equal(vocab.label.value, `${PREFIXES.rdfs}label`)
})
