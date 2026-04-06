const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
const YYYY_MM_DD_SLASH = /^\d{4}\/\d{2}\/\d{2}$/
const MM_DD_YYYY = /^\d{2}\/\d{2}\/\d{4}$/
const XSD = 'http://www.w3.org/2001/XMLSchema#'

function escapeLiteral(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

function unescapeLiteral(value) {
  return String(value)
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
}

function isValidDateString(value) {
  return (
    ISO_DATE.test(value) ||
    ISO_DATETIME.test(value) ||
    YYYY_MM_DD_SLASH.test(value) ||
    MM_DD_YYYY.test(value)
  )
}

function inferTypedLiteral(value) {
  const trimmed = String(value).trim()

  if (trimmed === '') return null
  if (trimmed === 'true') return `"true"^^<${XSD}boolean>`
  if (trimmed === 'false') return `"false"^^<${XSD}boolean>`

  const numberValue = Number(trimmed)
  if (!Number.isNaN(numberValue) && Number.isFinite(numberValue)) {
    const datatype = Number.isInteger(numberValue) ? 'integer' : 'decimal'
    return `"${trimmed}"^^<${XSD}${datatype}>`
  }

  if (isValidDateString(trimmed)) {
    const date = new Date(trimmed)
    if (!Number.isNaN(date.getTime())) {
      const datatype = ISO_DATE.test(trimmed) ? 'date' : 'dateTime'
      return `"${trimmed}"^^<${XSD}${datatype}>`
    }
  }

  return null
}

function transformLine(line) {
  const match = line.match(/^(<[^>]+>\s+<[^>]+>\s+)"((?:[^"\\]|\\.)*)"( \.)$/)
  if (!match) return line

  const [, start, rawLiteral, end] = match
  const decoded = unescapeLiteral(rawLiteral)
  const typed = inferTypedLiteral(decoded)

  if (!typed) return line
  return `${start}${typed}${end}`
}

export function typedLiterals(input) {
  return String(input)
    .split('\n')
    .map(transformLine)
    .join('\n')
}

export const internals = {
  inferTypedLiteral,
  transformLine,
  unescapeLiteral,
  escapeLiteral
}
