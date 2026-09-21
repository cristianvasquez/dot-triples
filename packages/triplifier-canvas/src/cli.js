#!/usr/bin/env node
import { pipeline } from 'node:stream/promises'
import { stdin, stdout, stderr, argv } from 'node:process'
import { createMappingQuadTransform } from 'triplifier-md'
import { serializeNTriplesStream } from 'triplifier-md/serialize'
import { createCanvasQuadTransform } from './streams.js'

try {
  const args = argv.slice(2)
  const file = args.find(a => !a.startsWith('-'))

  const quadStream = stdin
    .pipe(createCanvasQuadTransform({ file }))
    .pipe(createMappingQuadTransform())

  const outputStream = serializeNTriplesStream(quadStream)

  await pipeline(outputStream, stdout)
} catch (error) {
  stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
