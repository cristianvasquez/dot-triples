import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { Readable } from 'node:stream'
import rdf from 'rdf-ext'

export function parseTripleLine(line) {
  const trimmed = String(line).trim()

  if (!trimmed) return null

  return rdf.io.dataset
    .fromText('application/n-triples', `${trimmed}\n`, { factory: rdf })
    .then(dataset => {
      const [quad] = [...dataset]

      if (!quad) {
        throw new Error(`Invalid N-Triples line: ${line}`)
      }

      return quad
    })
}

export function serializeTripleLine(quad) {
  return quad.toString()
}

export function createQuadTransform(transformQuad) {
  return new Transform({
    objectMode: true,
    async transform(quad, encoding, callback) {
      try {
        callback(null, await transformQuad(quad))
      } catch (error) {
        callback(error)
      }
    }
  })
}

export function createParseTransform() {
  const decoder = new StringDecoder('utf8')
  let carry = ''

  async function pushLines(stream, text, flush = false) {
    const parts = text.split('\n')
    carry = parts.pop() ?? ''

    for (const line of parts) {
      if (!line) continue
      stream.push(await parseTripleLine(line))
    }

    if (flush && carry) {
      stream.push(await parseTripleLine(carry))
      carry = ''
    }
  }

  return new Transform({
    readableObjectMode: true,
    transform(chunk, encoding, callback) {
      pushLines(this, carry + decoder.write(chunk))
        .then(() => callback())
        .catch(error => callback(error))
    },

    flush(callback) {
      pushLines(this, carry + decoder.end(), true)
        .then(() => callback())
        .catch(error => callback(error))
    }
  })
}

export function createSerializeTransform() {
  return new Transform({
    writableObjectMode: true,
    transform(quad, encoding, callback) {
      try {
        callback(null, `${serializeTripleLine(quad)}\n`)
      } catch (error) {
        callback(error)
      }
    }
  })
}

export async function serializeQuads(quads) {
  let output = ''

  for await (const chunk of Readable.from(quads).pipe(createSerializeTransform())) {
    output += chunk
  }

  return output.endsWith('\n') ? output.slice(0, -1) : output
}

export function createLineTransform(transformQuad) {
  const decoder = new StringDecoder('utf8')
  let carry = ''

  return new Transform({
    async transform(chunk, encoding, callback) {
      try {
        const text = carry + decoder.write(chunk)
        const parts = text.split('\n')
        carry = parts.pop() ?? ''

        for (const line of parts) {
          if (!line) continue
          const quad = await parseTripleLine(line)
          this.push(`${serializeTripleLine(await transformQuad(quad))}\n`)
        }

        callback()
      } catch (error) {
        callback(error)
      }
    },

    async flush(callback) {
      try {
        const remainder = carry + decoder.end()

        if (remainder) {
          const quad = await parseTripleLine(remainder)
          this.push(`${serializeTripleLine(await transformQuad(quad))}\n`)
        }

        callback()
      } catch (error) {
        callback(error)
      }
    }
  })
}
