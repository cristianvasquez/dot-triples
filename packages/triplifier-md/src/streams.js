import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { createTriplifyProcessor } from './triplify.js'
import { mapQuad } from './curie-expansion.js'
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

// mapQuad as a stream stage: the one mapping step every syntax is piped
// through. `prefixes` and `mappings` default to PREFIXES and MAPPINGS.
export function createMappingQuadTransform(options = {}) {
  return new Transform({
    objectMode: true,
    transform(quad, encoding, callback) {
      try {
        callback(null, mapQuad(quad, options))
      } catch (error) {
        callback(error)
      }
    }
  })
}

// Deprecated compatibility stage: passes quads through without inference.
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
