import { basename, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import rdf from 'rdf-ext'
import { triplify as bigTriplify } from '/home/cvasquez/github.com/cristianvasquez/vault-triplifier/index.js'
import { createTriplifyQuadTransform } from '../src/triplify.js'
import { createMappingQuadTransform } from '../src/mapping.js'
import { createTypedLiteralsQuadTransform } from '../src/typed-literals.js'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'
const OA_ANNOTATION = 'http://www.w3.org/ns/oa#Annotation'
const DOT_PREFIX = 'http://pending.org/dot/'
const PROV_PREFIX = 'http://www.w3.org/ns/prov#'
const PROPERTY_PREFIX = 'urn:property:'
const FILE_PREFIX = 'file://'

function formatNamedNode(value) {
  return `<${value}>`
}

function formatLiteral(term) {
  const escaped = term.value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')

  if (term.language) {
    return `"${escaped}"@${term.language}`
  }

  if (
    term.datatype &&
    term.datatype.value &&
    term.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string'
  ) {
    return `"${escaped}"^^<${term.datatype.value}>`
  }

  return `"${escaped}"`
}

function quadToLine(quad) {
  const subject = formatNamedNode(quad.subject.value)
  const predicate = formatNamedNode(quad.predicate.value)
  const object = quad.object.termType === 'NamedNode'
    ? formatNamedNode(quad.object.value)
    : formatLiteral(quad.object)

  return `${subject} ${predicate} ${object} .`
}

function isRelevantBigQuad(quad) {
  if (quad.subject.termType !== 'NamedNode') return false
  if (quad.object.termType === 'BlankNode') return false
  if (quad.subject.value.startsWith(FILE_PREFIX)) return false
  if (quad.object.termType === 'NamedNode' && quad.object.value.startsWith(FILE_PREFIX)) return false
  if (quad.predicate.value.startsWith(DOT_PREFIX)) return false
  if (quad.predicate.value.startsWith(PROV_PREFIX)) return false

  if (quad.predicate.value.startsWith(PROPERTY_PREFIX)) return true
  if (quad.predicate.value === RDFS_LABEL) return true
  if (quad.predicate.value === RDF_TYPE && quad.object.termType === 'NamedNode') {
    return quad.object.value !== OA_ANNOTATION && !quad.object.value.startsWith(DOT_PREFIX)
  }

  return false
}

function normalizeLines(lines) {
  return Array.from(new Set(lines.filter(Boolean))).sort()
}

function diffSets(expected, actual) {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)

  return {
    onlyInExpected: expected.filter(line => !actualSet.has(line)),
    onlyInActual: actual.filter(line => !expectedSet.has(line))
  }
}

async function runComparison(filePath, options = {}) {
  const absolutePath = resolve(filePath)
  const content = await readFile(absolutePath, 'utf8')

  const bigResult = bigTriplify(absolutePath, content, {
    partitionBy: ['headers-h2-h3'],
    includeSelectors: false,
    includeRaw: false,
    includeLabelsFor: ['sections']
  })

  const bigLines = normalizeLines(
    [...bigResult.dataset]
      .filter(isRelevantBigQuad)
      .map(quadToLine)
  )

  let smallStream = Readable
    .from([content])
    .pipe(createTriplifyQuadTransform({ sourceId: basename(absolutePath) }))
    .pipe(createMappingQuadTransform())

  if (options.typed) {
    smallStream = smallStream.pipe(createTypedLiteralsQuadTransform())
  }

  const smallOutput = await rdf.io.stream.toText('application/n-triples', smallStream, {
    factory: rdf
  })
  const smallLines = normalizeLines(
    smallOutput.split('\n').filter(Boolean)
  )

  return {
    filePath: absolutePath,
    bigLines,
    smallLines,
    ...diffSets(bigLines, smallLines)
  }
}

function printResult(result) {
  console.log(`\n# ${result.filePath}`)
  console.log(`big: ${result.bigLines.length} relevant triples`)
  console.log(`small: ${result.smallLines.length} relevant triples`)
  console.log(`missing in small: ${result.onlyInExpected.length}`)
  console.log(`extra in small: ${result.onlyInActual.length}`)

  if (result.onlyInExpected.length > 0) {
    console.log('\nmissing in small:')
    for (const line of result.onlyInExpected.slice(0, 20)) {
      console.log(line)
    }
  }

  if (result.onlyInActual.length > 0) {
    console.log('\nextra in small:')
    for (const line of result.onlyInActual.slice(0, 20)) {
      console.log(line)
    }
  }
}

const args = process.argv.slice(2)
const typed = args.includes('--typed')
const files = args.filter(arg => arg !== '--typed')

if (files.length === 0) {
  console.error('usage: node scripts/compare-with-vault-triplifier.mjs [--typed] file.md [more.md ...]')
  process.exit(1)
}

let mismatched = 0

for (const file of files) {
  const result = await runComparison(file, { typed })
  printResult(result)
  if (result.onlyInExpected.length > 0 || result.onlyInActual.length > 0) {
    mismatched += 1
  }
}

if (mismatched > 0) {
  process.exitCode = 2
}
