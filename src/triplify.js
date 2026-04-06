import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { basename } from 'node:path'
import { PREFIXES } from './prefixes.js'

const NAME_BASE = 'urn:name:'
const PROPERTY_BASE = 'urn:property:'
const CURIE = /^[a-zA-Z][\w-]*:[^\s]+$/
const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/

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
  const base = subject.slice(1, -1)
  const suffix = headings.map(heading => encodeURI(heading)).join('#')
  return `<${base}#${suffix}>`
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

function escapeLiteral(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

function iri(value, fallbackBase) {
  const stringValue = String(value).trim()

  if (!stringValue) {
    throw new Error('Cannot build IRI from empty value')
  }

  if (stringValue.startsWith('[[') && stringValue.endsWith(']]')) {
    return `<${NAME_BASE}${encodeURI(stringValue.slice(2, -2).trim())}>`
  }

  if (isKnownCurie(stringValue)) return `<${stringValue}>`

  if (ABSOLUTE_IRI.test(stringValue)) return `<${stringValue}>`

  return `<${fallbackBase}${encodeURI(stringValue)}>`
}

function literal(value) {
  const stringValue = String(value)

  if (stringValue.startsWith('[[') && stringValue.endsWith(']]')) {
    return iri(stringValue, NAME_BASE)
  }

  if (isKnownCurie(stringValue)) return iri(stringValue, NAME_BASE)

  if (ABSOLUTE_IRI.test(stringValue)) {
    return iri(stringValue, NAME_BASE)
  }

  return `"${escapeLiteral(stringValue)}"`
}

function objectTerm(value) {
  if (Array.isArray(value)) {
    return value.map(item => objectTerm(item))
  }

  if (typeof value === 'string' && value.startsWith('[[') && value.endsWith(']]')) {
    return iri(value, NAME_BASE)
  }

  return literal(value)
}

function plainLiteral(value) {
  return `"${escapeLiteral(String(value))}"`
}

function subjectIri(frontmatter, sourceId = 'stdin') {
  if (frontmatter.uri) return iri(frontmatter.uri, NAME_BASE)
  const localName = basename(sourceId, '.md')
  return `<${NAME_BASE}${encodeURI(localName)}>`
}

function predicateIri(key) {
  if (key === 'type' || key === 'a' || key === 'is a') {
    return `<${PREFIXES.rdf}type>`
  }

  if (key === 'label' || key === 'title') {
    return `<${PREFIXES.rdfs}label>`
  }

  return iri(key, PROPERTY_BASE)
}

function pushTriple(lines, subject, predicate, value, options = {}) {
  const { plainObject = false } = options

  if (Array.isArray(value)) {
    for (const item of value) pushTriple(lines, subject, predicate, item, options)
    return
  }

  const object = plainObject ? plainLiteral(value) : objectTerm(value)
  lines.push(`${subject} ${predicate} ${object} .`)
}

function createTripleWriter(onTriple) {
  return (subject, predicate, value, options = {}) => {
    const lines = []
    pushTriple(lines, subject, predicate, value, options)

    for (const line of lines) {
      onTriple(line)
    }
  }
}

function createTriplifyProcessor(options = {}) {
  const { sourceId = 'stdin', onTriple = () => {} } = options
  const writeTriple = createTripleWriter(onTriple)
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
      writeTriple(subject, predicateIri(key), value, {
        plainObject: key === 'label' || key === 'title'
      })
    }
  }

  function currentSubject() {
    if (currentH3) return sectionIri(subject, [currentH3])
    if (currentH2) return sectionIri(subject, [currentH2])
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
      const sectionSubject = depth === 3
        ? sectionIri(subject, [currentH3].filter(Boolean))
        : sectionIri(subject, [currentH2].filter(Boolean))

      if (!labeledSubjects.has(sectionSubject)) {
        writeTriple(sectionSubject, predicateIri('label'), title, {
          plainObject: true
        })
        labeledSubjects.add(sectionSubject)
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

    writeTriple(currentSubject(), predicateIri(trimmedKey), parseInlineValue(rawValue), {
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
  const lines = []
  const processor = createTriplifyProcessor({
    ...options,
    onTriple(line) {
      lines.push(line)
    }
  })

  for (const line of String(content).split('\n')) {
    processor.writeLine(line)
  }

  processor.end()
  return lines.join('\n')
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
          onTriple: line => {
            if (emittedAny) {
              this.push('\n')
            }

            this.push(line)
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
          onTriple: line => {
            if (emittedAny) {
              this.push('\n')
            }

            this.push(line)
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
