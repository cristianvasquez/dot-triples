import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { createTriplifyProcessor } from './triplify.js'
import { mapQuad, PREFIXES } from './curie-expansion.js'
import { typeQuad } from './typed-literals.js'

export function createTriplifyQuadTransform(options = {}) {
  const decoder = new StringDecoder('utf8')
  let carry = ''

  return new Transform({
    readableObjectMode: true,
    transform(chunk, encoding, callback) {
      try {
        const text = carry + decoder.write(chunk)
        const parts = text.split('\n')
        carry = parts.pop() ?? ''

        const processor = this.processor ??= createTriplifyProcessor({
          ...options,
          onQuad: quad => {
            this.push(quad)
          }
        })

        for (const line of parts) {
          processor.writeLine(line)
        }

        callback()
      } catch (error) {
        callback(error)
      }
    },

    flush(callback) {
      try {
        const remainder = carry + decoder.end()
        const processor = this.processor ??= createTriplifyProcessor({
          ...options,
          onQuad: quad => {
            this.push(quad)
          }
        })

        if (remainder) {
          processor.writeLine(remainder)
        }

        processor.end()
        callback()
      } catch (error) {
        callback(error)
      }
    }
  })
}

export function createCurieExpansionQuadTransform(options = {}) {
  const { prefixes: extraPrefixes = {} } = options
  const prefixes = { ...PREFIXES, ...extraPrefixes }
  return new Transform({
    objectMode: true,
    transform(quad, encoding, callback) {
      try {
        callback(null, mapQuad(quad, prefixes))
      } catch (error) {
        callback(error)
      }
    }
  })
}

export function createTypedLiteralsQuadTransform() {
  return new Transform({
    objectMode: true,
    transform(quad, encoding, callback) {
      try {
        callback(null, typeQuad(quad))
      } catch (error) {
        callback(error)
      }
    }
  })
}
