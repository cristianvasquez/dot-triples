#!/usr/bin/env node
import { pipeline } from 'node:stream/promises'
import { basename } from 'node:path'
import { stdin, stdout, stderr, argv } from 'node:process'
import { createTriplifyTransform } from './triplify.js'

try {
  const sourceId = argv[2] ? basename(argv[2]) : 'stdin'
  await pipeline(stdin, createTriplifyTransform({ sourceId }), stdout)
} catch (error) {
  stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
