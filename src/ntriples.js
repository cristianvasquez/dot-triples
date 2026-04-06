import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
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

export function createLineTransform(transformQuad) {
  const decoder = new StringDecoder('utf8')
  let carry = ''

  async function pushLines(stream, text, flush = false) {
    const parts = text.split('\n')
    carry = parts.pop() ?? ''

    for (const line of parts) {
      if (!line) {
        stream.push('\n')
        continue
      }

      const quad = await parseTripleLine(line)
      stream.push(`${serializeTripleLine(await transformQuad(quad))}\n`)
    }

    if (flush && carry) {
      const quad = await parseTripleLine(carry)
      stream.push(serializeTripleLine(await transformQuad(quad)))
      carry = ''
    }
  }

  return new Transform({
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
