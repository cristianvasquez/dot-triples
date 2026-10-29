#!/usr/bin/env node
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { text } from 'node:stream/consumers'
import { stdin, stdout, stderr, argv } from 'node:process'
import { serializeNTriplesStream } from 'triplifier-md/serialize'
import { triplifyToQuads } from './index.js'

try {
  const args = argv.slice(2)
  const file = args.find(a => !a.startsWith('-'))
  const linkLabels = !args.includes('--no-link-labels')
  const quads = triplifyToQuads(await text(stdin), { file, linkLabels })
  await pipeline(serializeNTriplesStream(Readable.from(quads)), stdout)
} catch (error) {
  stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
