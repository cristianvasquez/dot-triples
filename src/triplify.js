import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { basename } from 'node:path'
import rdf from 'rdf-ext'
import { serializeTripleLine } from './ntriples.js'
import { PREFIXES } from './prefixes.js'

const NAME_BASE = 'urn:name:'
const PROPERTY_BASE = 'urn:property:'
const CURIE = /^[a-zA-Z][\w-]*:[^\s]+$/
const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const RDF = rdf.namespace(PREFIXES.rdf)
const RDFS = rdf.namespace(PREFIXES.rdfs)

function splitFrontmatter(content) {
  const input = String(content ?? '')
  const match = input.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)

  if (!match) {
    return { frontmatter: {}, body: input }
  }

  return {
    frontmatter: parseSimpleYaml(match[1]),
    body: input.slice(match[0].length)
  }
}

function parseSimpleYaml(yamlText) {
  const lines = yamlText.replace(/\r/g, '').split('\n')
  const result = {}

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue

    const keyMatch = rawLine.match(/^([A-Za-z0-9_.:-]+):(?:\s+(.*))?$/)
    if (!keyMatch) continue

    const [, key, rest = ''] = keyMatch

    if (!rest.trim()) {
      const list = []
      let cursor = index + 1

      while (cursor < lines.length) {
        const itemMatch = lines[cursor].match(/^\s*-\s+(.*)$/)
        if (!itemMatch) break
        list.push(parseScalar(itemMatch[1]))
        cursor += 1
      }

      result[key] = list
      index = cursor - 1
      continue
    }

    result[key] = parseScalar(rest)
  }

  return result
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('\'') && value.endsWith('\''))
  ) {
    return value.slice(1, -1)
  }
  return value
}

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

function parseScalar(value) {
  const trimmed = String(value).trim()

  if (!trimmed) return ''

  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    return trimmed.slice(1, -1)
  }

  if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
    return trimmed
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return []
    return splitList(inner).map(item => parseScalar(item))
  }

  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)

  return stripQuotes(trimmed)
}

function removeCodeFences(content) {
  return content.replace(/```[\s\S]*?```/g, '')
}

function sectionIri(subject, headings) {
  const base = typeof subject === 'string' ? subject.slice(1, -1) : subject.value
  const suffix = headings.map(heading => encodeURI(heading)).join('#')
  return `<${base}#${suffix}>`
}

function sectionSubject(subject, headings) {
  return rdf.namedNode(sectionIri(subject, headings).slice(1, -1))
}

function parseBodyEntries(body) {
  const cleanBody = removeCodeFences(body)
  const entries = []
  let currentH2 = null
  let currentH3 = null

  for (const line of cleanBody.split(/\r?\n/)) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*$/)
    if (headingMatch) {
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

      entries.push({
        type: 'heading',
        depth,
        title,
        subjectPath: depth === 3
          ? [currentH3].filter(Boolean)
          : [currentH2].filter(Boolean)
      })
      continue
    }

    const normalizedLine = line.replace(/^\s*[-*+]\s+/, '')
    const match = normalizedLine.match(/^\s*([^:#][^:]*?)\s*::\s*(.+?)\s*$/)
    if (!match) continue

    const [, key, rawValue] = match
    entries.push({
      type: 'field',
      key: key.trim(),
      value: parseInlineValue(rawValue),
      subjectPath: currentH3 ? [currentH3].filter(Boolean) : [currentH2].filter(Boolean)
    })
  }

  return entries
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

function isKnownCurie(value) {
  if (!CURIE.test(value)) return false
  const prefix = value.slice(0, value.indexOf(':'))
  return Boolean(PREFIXES[prefix])
}

function namedNodeFromValue(value, fallbackBase) {
  const stringValue = String(value).trim()

  if (!stringValue) {
    throw new Error('Cannot build IRI from empty value')
  }

  if (stringValue.startsWith('[[') && stringValue.endsWith(']]')) {
    return rdf.namedNode(`${NAME_BASE}${encodeURI(stringValue.slice(2, -2).trim())}`)
  }

  if (isKnownCurie(stringValue)) return rdf.namedNode(stringValue)

  if (ABSOLUTE_IRI.test(stringValue)) return rdf.namedNode(stringValue)

  return rdf.namedNode(`${fallbackBase}${encodeURI(stringValue)}`)
}

function objectTerm(value) {
  if (Array.isArray(value)) {
    return value.map(item => objectTerm(item))
  }

  if (typeof value === 'string') {
    if (value.startsWith('[[') && value.endsWith(']]')) {
      return namedNodeFromValue(value, NAME_BASE)
    }

    if (isKnownCurie(value) || ABSOLUTE_IRI.test(value)) {
      return namedNodeFromValue(value, NAME_BASE)
    }
  }

  return rdf.literal(String(value))
}

function plainLiteralTerm(value) {
  return rdf.literal(String(value))
}

function subjectIri(frontmatter, sourceId = 'stdin') {
  if (frontmatter.uri) return namedNodeFromValue(frontmatter.uri, NAME_BASE)
  const localName = basename(sourceId, '.md')
  return rdf.namedNode(`${NAME_BASE}${encodeURI(localName)}`)
}

function predicateIri(key) {
  if (key === 'type' || key === 'a' || key === 'is a') {
    return RDF('type')
  }

  if (key === 'label' || key === 'title') {
    return RDFS('label')
  }

  return namedNodeFromValue(key, PROPERTY_BASE)
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
  return quads.map(serializeTripleLine).join('\n')
}

export function createTriplifyTransform(options = {}) {
  const decoder = new StringDecoder('utf8')
  let carry = ''
  let emittedAny = false

  return new Transform({
    transform(chunk, encoding, callback) {
      try {
        const text = carry + decoder.write(chunk)
        const parts = text.split('\n')
        carry = parts.pop() ?? ''

        const processor = this.processor ??= createTriplifyProcessor({
          ...options,
          onQuad: quad => {
            if (emittedAny) {
              this.push('\n')
            }

            this.push(serializeTripleLine(quad))
            emittedAny = true
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
            if (emittedAny) {
              this.push('\n')
            }

            this.push(serializeTripleLine(quad))
            emittedAny = true
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
  splitFrontmatter,
  parseSimpleYaml,
  parseBodyEntries,
  parseScalar,
  predicateIri,
  subjectIri,
  sectionIri,
  createTriplifyProcessor
}
