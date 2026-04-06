#!/usr/bin/env node
import { pipeline } from 'node:stream/promises'
import { basename } from 'node:path'
import { stdin, stdout, stderr, argv } from 'node:process'
import rdf from 'rdf-ext'
import { createTriplifyQuadTransform } from './triplify.js'
import { createMappingQuadTransform } from './mapping.js'
import { createTypedLiteralsQuadTransform } from './typed-literals.js'

try {
  const sourceId = argv[2] ? basename(argv[2]) : 'stdin'
  const quadStream = stdin
    .pipe(createTriplifyQuadTransform({ sourceId }))
    .pipe(createMappingQuadTransform())
    .pipe(createTypedLiteralsQuadTransform())

  await pipeline(rdf.formats.serializers.import('application/n-triples', quadStream), stdout)
} catch (error) {
  stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
