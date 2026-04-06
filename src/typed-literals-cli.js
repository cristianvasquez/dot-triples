#!/usr/bin/env node
import { stdin, stdout, stderr } from 'node:process'
import { typedLiterals } from './typed-literals.js'

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
  stdout.write(typedLiterals(input))
} catch (error) {
  stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
