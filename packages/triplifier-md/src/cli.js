#!/usr/bin/env node
import { pipeline } from 'node:stream/promises'
import { stdin, stdout, stderr, argv } from 'node:process'
import { createTriplifyQuadTransform, createCurieExpansionQuadTransform, createTypedLiteralsQuadTransform } from './streams.js'
import { serializeNTriplesStream } from './serialize.js'

try {
  const args = argv.slice(2)
  const file = args.find(a => !a.startsWith('-'))

  const quadStream = stdin
    .pipe(createTriplifyQuadTransform({ file }))
    .pipe(createCurieExpansionQuadTransform())
    .pipe(createTypedLiteralsQuadTransform())

  const outputStream = serializeNTriplesStream(quadStream)

  await pipeline(outputStream, stdout)
} catch (error) {
  stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
