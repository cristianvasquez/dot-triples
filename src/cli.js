#!/usr/bin/env node
import { pipeline } from 'node:stream/promises'
import { basename } from 'node:path'
import { stdin, stdout, stderr, argv } from 'node:process'
import rdf from 'rdf-ext'
import SerializerTurtle from '@rdfjs/serializer-turtle'
import { createTriplifyQuadTransform, createCurieExpansionQuadTransform, createTypedLiteralsQuadTransform } from './streams.js'
import { PREFIXES } from './curie-expansion.js'

try {
  const args = argv.slice(2)
  const turtle = args.includes('--turtle') || args.includes('-t')
  const sourceFile = args.find(a => !a.startsWith('-'))
  const sourceId = sourceFile ? basename(sourceFile) : 'stdin'

  const quadStream = stdin
    .pipe(createTriplifyQuadTransform({ sourceId }))
    .pipe(createCurieExpansionQuadTransform())
    .pipe(createTypedLiteralsQuadTransform())

  const outputStream = turtle
    ? new SerializerTurtle({ prefixes: new Map(Object.entries(PREFIXES)) }).import(quadStream)
    : rdf.formats.serializers.import('application/n-triples', quadStream)

  await pipeline(outputStream, stdout)
} catch (error) {
  stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
