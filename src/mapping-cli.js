#!/usr/bin/env node
import { pipeline } from 'node:stream/promises'
import { stdin, stdout, stderr } from 'node:process'
import { createMappingTransform } from './mapping.js'

try {
  await pipeline(stdin, createMappingTransform(), stdout)
} catch (error) {
  stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
