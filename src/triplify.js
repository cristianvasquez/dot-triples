import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import rdf from 'rdf-ext'
import { parseSimpleYaml, parseScalar } from './frontmatter.js'
import { objectTerm, plainLiteralTerm, predicateIri, subjectIri } from './terms.js'

function splitList(value) {
  const parts = []
  let current = ''
  let quote = null

  for (const char of value) {
    if ((char === '"' || char === '\'') && (!quote || quote === char)) {
      quote = quote ? null : char
      current += char
      continue
    }

    if (char === ',' && !quote) {
      parts.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function sectionIri(subject, headings) {
  const base = typeof subject === 'string' ? subject.slice(1, -1) : subject.value
  const suffix = headings.map(heading => encodeURI(heading)).join('#')
  return `<${base}#${suffix}>`
}

function sectionSubject(subject, headings) {
  return rdf.namedNode(sectionIri(subject, headings).slice(1, -1))
}

function parseInlineValue(value) {
  const parts = splitList(String(value))
  if (parts.length > 1) {
    return parts.map(part => parseAtomicValue(part))
  }
  return parseAtomicValue(value)
}

function parseAtomicValue(value) {
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function emitQuads(onQuad, subject, predicate, value, options = {}) {
  const { plainObject = false } = options

  if (Array.isArray(value)) {
    for (const item of value) emitQuads(onQuad, subject, predicate, item, options)
    return
  }

  const object = plainObject ? plainLiteralTerm(value) : objectTerm(value)
  onQuad(rdf.quad(subject, predicate, object))
}

function createQuadWriter(onQuad) {
  return (subject, predicate, value, options = {}) => {
    emitQuads(onQuad, subject, predicate, value, options)
  }
}

function createTriplifyProcessor(options = {}) {
  const { sourceId = 'stdin', onQuad = () => {} } = options
  const writeQuad = createQuadWriter(onQuad)
  const labeledSubjects = new Set()
  let subject = subjectIri({}, sourceId)
  let frontmatterLines = []
  let inFrontmatter = false
  let atDocumentStart = true
  let inCodeFence = false
  let currentH2 = null
  let currentH3 = null

  function emitFrontmatter(frontmatter) {
    subject = subjectIri(frontmatter, sourceId)

    for (const [key, value] of Object.entries(frontmatter)) {
      if (key === 'uri') continue
      writeQuad(subject, predicateIri(key), value, {
        plainObject: key === 'label' || key === 'title'
      })
    }
  }

  function currentSubject() {
    if (currentH3) return sectionSubject(subject, [currentH3])
    if (currentH2) return sectionSubject(subject, [currentH2])
    return subject
  }

  function handleHeading(line) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*$/)
    if (!headingMatch) return false

    const depth = headingMatch[1].length
    const title = headingMatch[2].trim()

    if (depth === 2 && title) {
      currentH2 = title
      currentH3 = null
    } else if (depth === 3 && title) {
      currentH3 = title
    } else if (depth < 2) {
      currentH2 = null
      currentH3 = null
    }

    if ((depth === 2 || depth === 3) && title) {
      const sectionNode = depth === 3
        ? sectionSubject(subject, [currentH3].filter(Boolean))
        : sectionSubject(subject, [currentH2].filter(Boolean))

      if (!labeledSubjects.has(sectionNode)) {
        writeQuad(sectionNode, predicateIri('label'), title, {
          plainObject: true
        })
        labeledSubjects.add(sectionNode)
      }
    }

    return true
  }

  function handleField(line) {
    const normalizedLine = line.replace(/^\s*[-*+]\s+/, '')
    const match = normalizedLine.match(/^\s*([^:#][^:]*?)\s*::\s*(.+?)\s*$/)
    if (!match) return

    const [, key, rawValue] = match
    const trimmedKey = key.trim()

    if (trimmedKey === 'uri' && currentSubject() !== subject) {
      return
    }

    writeQuad(currentSubject(), predicateIri(trimmedKey), parseInlineValue(rawValue), {
      plainObject: trimmedKey === 'label' || trimmedKey === 'title'
    })
  }

  function processBodyLine(line) {
    if (line.trimStart().startsWith('```')) {
      inCodeFence = !inCodeFence
      return
    }

    if (inCodeFence) return
    if (handleHeading(line)) return
    handleField(line)
  }

  return {
    writeLine(line) {
      const normalizedLine = line.replace(/\r$/, '')

      if (atDocumentStart) {
        atDocumentStart = false

        if (normalizedLine === '---') {
          inFrontmatter = true
          frontmatterLines = []
          return
        }
      }

      if (inFrontmatter) {
        if (normalizedLine === '---') {
          inFrontmatter = false
          emitFrontmatter(parseSimpleYaml(frontmatterLines.join('\n')))
          frontmatterLines = []
          return
        }

        frontmatterLines.push(normalizedLine)
        return
      }

      processBodyLine(normalizedLine)
    },

    end() {
      if (!inFrontmatter) return

      inFrontmatter = false
      processBodyLine('---')
      for (const line of frontmatterLines) {
        processBodyLine(line)
      }
      frontmatterLines = []
    }
  }
}

export function triplify(content, options = {}) {
  const quads = []
  const processor = createTriplifyProcessor({
    ...options,
    onQuad(quad) {
      quads.push(quad)
    }
  })

  for (const line of String(content).split('\n')) {
    processor.writeLine(line)
  }

  processor.end()
  return quads.map(quad => quad.toString()).join('\n')
}

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

export const internals = {
  parseSimpleYaml,
  parseScalar,
  predicateIri,
  subjectIri,
  sectionIri,
  createTriplifyProcessor
}
