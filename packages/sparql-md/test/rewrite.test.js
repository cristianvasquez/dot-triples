import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseQuery,
  replaceAllTokens,
  replaceInternalLinks,
  replacePropertyPlaceholders,
  rewriteAndParseQuery,
  rewriteQuery,
} from '../src/rewrite.js'

test('replacePropertyPlaceholders replaces simple properties', () => {
  const input = 'SELECT * WHERE { ?s __label__ ?o }'
  const result = replacePropertyPlaceholders(input)
  assert.match(result, /<urn:property:label>/)
  assert.doesNotMatch(result, /__label__/)
})

test('replacePropertyPlaceholders replaces properties with spaces', () => {
  const input = 'SELECT * WHERE { ?s __generated at time__ ?o }'
  const result = replacePropertyPlaceholders(input)
  assert.match(result, /<urn:property:generated%20at%20time>/)
  assert.doesNotMatch(result, /__generated at time__/)
})

test('replacePropertyPlaceholders replaces prefixed properties', () => {
  const input = 'SELECT * WHERE { ?s __rdfs:label__ ?o }'
  const result = replacePropertyPlaceholders(input)
  assert.match(result, /<urn:property:rdfs:label>/)
  assert.doesNotMatch(result, /__rdfs:label__/)
})

test('replacePropertyPlaceholders handles multiple placeholders', () => {
  const input = '?s __type__ ?type . ?s __label__ ?name'
  const result = replacePropertyPlaceholders(input)
  assert.match(result, /<urn:property:type>/)
  assert.match(result, /<urn:property:label>/)
})

test('replacePropertyPlaceholders leaves normal text unchanged', () => {
  const input = 'SELECT * WHERE { ?s ?p ?o }'
  assert.equal(replacePropertyPlaceholders(input), input)
})

test('replaceInternalLinks replaces wiki links', () => {
  const input = 'SELECT * WHERE { [[MyNote]] ?p ?o }'
  const result = replaceInternalLinks(input, (link) => `<urn:name:${link}>`)
  assert.match(result, /<urn:name:MyNote>/)
  assert.doesNotMatch(result, /\[\[MyNote\]\]/)
})

test('replaceInternalLinks handles multiple wiki links', () => {
  const input = '[[Note1]] [[Note2]]'
  const result = replaceInternalLinks(input, (link) => `<urn:name:${link}>`)
  assert.match(result, /<urn:name:Note1>/)
  assert.match(result, /<urn:name:Note2>/)
})

test('rewriteQuery replaces multiple token types', () => {
  const input = '__THIS__ __label__ [[LinkedNote]]'
  const result = rewriteQuery(input, {
    filePath: '/path/to/TestFile.md',
    repoUri: 'osg://repo/local:test',
  })

  assert.match(result, /<urn:name:TestFile>/)
  assert.match(result, /<urn:property:label>/)
  assert.match(result, /<urn:name:LinkedNote>/)
})

test('replaceAllTokens replaces __THIS__ token', () => {
  const sparql = 'SELECT * WHERE { __THIS__ ?p ?o }'
  const result = replaceAllTokens(sparql, {
    filePath: '/path/to/MyFile.md',
  })
  assert.match(result, /<urn:name:MyFile>/)
  assert.doesNotMatch(result, /__THIS__/)
})

test('replaceAllTokens replaces __DOC__ token', () => {
  const sparql = 'CONSTRUCT { ?s ?p ?o } WHERE { GRAPH __DOC__ { ?s ?p ?o } }'
  const result = replaceAllTokens(sparql, {
    filePath: '/path/to/MyFile.md',
  })
  assert.match(result, /<file:\/\/\/path\/to\/MyFile\.md>/)
  assert.doesNotMatch(result, /__DOC__/)
})

test('replaceAllTokens replaces __REPO__ token with repo-uri', () => {
  const sparql = 'SELECT * WHERE { GRAPH __REPO__ { ?s ?p ?o } }'
  const result = replaceAllTokens(sparql, {
    filePath: '/path/to/MyFile.md',
    repoUri: 'osg://repo/local:abc123',
  })
  assert.match(result, /<osg:\/\/repo\/local:abc123>/)
  assert.doesNotMatch(result, /__REPO__/)
})

test('replaceAllTokens handles combined replacements', () => {
  const sparql = `
    SELECT * WHERE {
      GRAPH __DOC__ {
        __THIS__ __label__ [[LinkedNote]]
      }
    }`
  const result = replaceAllTokens(sparql, {
    filePath: '/path/to/TestFile.md',
    repoUri: 'osg://repo/local:test',
  })

  assert.match(result, /<file:\/\/\/path\/to\/TestFile\.md>/)
  assert.match(result, /<urn:name:TestFile>/)
  assert.match(result, /<urn:property:label>/)
  assert.match(result, /<urn:name:LinkedNote>/)
})

test('replaceAllTokens handles prefixed properties in SPARQL', () => {
  const sparql = 'SELECT * WHERE { ?s __rdfs:label__ __owl:sameAs__ }'
  const result = replaceAllTokens(sparql, {
    filePath: '/path/to/file.md',
  })

  assert.match(result, /<urn:property:rdfs:label>/)
  assert.match(result, /<urn:property:owl:sameAs>/)
})

test('replaceAllTokens works without file path', () => {
  const sparql = 'SELECT * WHERE { [[MyNote]] __label__ ?o }'
  const result = replaceAllTokens(sparql, {})

  assert.match(result, /<urn:name:MyNote>/)
  assert.match(result, /<urn:property:label>/)
  assert.doesNotMatch(result, /__THIS__/)
  assert.doesNotMatch(result, /__DOC__/)
})

test('replaceAllTokens rejects __THIS__ without file context', () => {
  assert.throws(
    () => replaceAllTokens('SELECT * WHERE { __THIS__ ?p ?o }', {}),
    /Provide --file explicitly/,
  )
})

test('replaceAllTokens rejects __DOC__ without file context', () => {
  assert.throws(
    () => replaceAllTokens('SELECT * WHERE { GRAPH __DOC__ { ?s ?p ?o } }', {}),
    /Provide --file explicitly/,
  )
})

test('replaceAllTokens rejects __REPO__ without repo context', () => {
  assert.throws(
    () => replaceAllTokens('SELECT * WHERE { GRAPH __REPO__ { ?s ?p ?o } }', {
      filePath: '/path/to/file.md',
    }),
    /Provide --repo-path or --repo-uri explicitly/,
  )
})

test('parseQuery validates valid sparql', () => {
  const parsed = parseQuery('SELECT * WHERE { ?s ?p ?o } LIMIT 1')
  assert.equal(parsed.queryType, 'SELECT')
})

test('parseQuery rejects invalid sparql', () => {
  assert.throws(
    () => parseQuery('THIS IS NOT SPARQL'),
  )
})

test('rewriteAndParseQuery returns rewritten query and parsed AST', () => {
  const result = rewriteAndParseQuery('SELECT * WHERE { __THIS__ ?p ?o }', {
    filePath: '/path/to/MyFile.md',
  })

  assert.match(result.query, /<urn:name:MyFile>/)
  assert.equal(result.parsed.queryType, 'SELECT')
})
