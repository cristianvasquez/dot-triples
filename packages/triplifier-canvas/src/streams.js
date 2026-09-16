import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { createCanvasProcessor, parseCanvas } from './triplify.js'

// JSON cannot be read line by line, so this transform buffers the whole canvas
// and emits every quad on flush. It is a stream for symmetry with the Markdown
// pipeline, not for incrementality. A canvas is a hand-drawn file; the buffer
// is the file.
export function createCanvasQuadTransform (options = {}) {
  const decoder = new StringDecoder('utf8')
  let text = ''

  return new Transform({
    readableObjectMode: true,

    transform (chunk, encoding, callback) {
      try {
        text += decoder.write(chunk)
        callback()
      } catch (error) {
        callback(error)
      }
    },

    flush (callback) {
      try {
        text += decoder.end()
        if (!text.trim()) return callback()

        const processor = createCanvasProcessor({
          ...options,
          onQuad: quad => {
            this.push(quad)
          }
        })

        processor.write(parseCanvas(text))
        callback()
      } catch (error) {
        callback(error)
      }
    }
  })
}
