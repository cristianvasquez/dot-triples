import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const manifest = fileURLToPath(new URL('./manifest.hs', import.meta.url))

function compile(source) {
  const directory = mkdtempSync(join(tmpdir(), 'dot-triples-types-'))
  try {
    const fixture = join(directory, 'Contract.hs')
    writeFileSync(fixture, `module Contract where\nimport DotTriples.Manifest\n${source.replace(/^ {4}/gm, '')}\n`)
    const result = spawnSync('ghc', [
      '-fno-code', '-fforce-recomp', '-v0', '-outputdir', directory, manifest, fixture,
    ], { encoding: 'utf8', timeout: 30_000 })
    assert.ifError(result.error)
    return { status: result.status, output: result.stdout + result.stderr }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('validated identifiers compose into correctly positioned RDF nodes', () => {
  const result = compile(`
    note :: String -> Either Error NamedNode
    note text = nameToUri <$> parseName text

    document :: Name -> NamedNode
    document = nameToUri . getDocName

    fromPath :: FilePath -> Either Error NamedNode
    fromPath path = nameToUri <$> parseName (getNameFromPath path)

    recover :: Name -> Maybe Name
    recover = nameFromUri . nameToUri

    statement :: Name -> Token -> Token -> Quad
    statement name key value = Quad
      (SubjectNamed (nameToUri name))
      (tokenToUri key)
      (ObjectLiteral (tokenToLiteral value))
      DefaultGraph

    namedGraph :: BlankNode -> NamedNode -> NamedNode -> NamedNode -> Quad
    namedGraph subject predicate object graph = Quad
      (SubjectBlank subject) predicate (ObjectNamed object) (GraphNamed graph)

    quote :: InlineExtractor -> SubjectTerm -> String -> IO NamedNode
    quote = emitQuoteSelector

    readField :: InlineExtractor -> String -> SubjectTerm -> IO (Either Error Bool)
    readField = field
  `)
  assert.equal(result.status, 0, result.output)
})

const invalid = {
  'raw strings cannot bypass name validation': 'bad = nameToUri "Alice"',
  'names cannot be used as tokens': 'bad n = tokenToUri (getDocName n)',
  'names have no public constructor': 'bad = Name "Alice"',
  'tokens have no public constructor': 'bad = Token "key"',
  'IRI text is not a named node': 'bad = nameFromUri (Iri "urn:name:Alice")',
  'literal predicates are rejected': 'bad s t o g = Quad s (tokenToLiteral t) o g',
  'literal subjects are rejected': 'bad t p o g = Quad (tokenToLiteral t) p o g',
  'literal graph names are rejected': 'bad s p o t = Quad s p o (tokenToLiteral t)',
  'the default graph is not an object': 'bad s p = Quad s p DefaultGraph DefaultGraph',
  'selector effects cannot be discarded': `
    bad :: InlineExtractor -> SubjectTerm -> String -> NamedNode
    bad = emitQuoteSelector`,
}

for (const [name, source] of Object.entries(invalid)) {
  test(name, () => {
    const result = compile(source)
    assert.equal(result.status, 1, result.output)
    assert.match(result.output, /Couldn't match|Data constructor not in scope|Illegal term-level use/)
  })
}
