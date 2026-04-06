#!/usr/bin/env node
import { stdin, stdout, stderr, argv } from 'node:process'
import { basename } from 'node:path'
import { triplify } from './triplify.js'

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = ''
    stdin.setEncoding('utf8')
    stdin.on('data', chunk => {
      data += chunk
    })
    stdin.on('end', () => resolve(data))
    stdin.on('error', reject)
  })
}

try {
  const input = await readStdin()
  const sourceId = argv[2] ? basename(argv[2]) : 'stdin'
  stdout.write(triplify(input, { sourceId }))
  if (input && !input.endsWith('\n')) {
    stdout.write('\n')
  }
} catch (error) {
  stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
