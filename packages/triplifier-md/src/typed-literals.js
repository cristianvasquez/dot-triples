import rdf from 'rdf-ext'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
const YYYY_MM_DD_SLASH = /^\d{4}\/\d{2}\/\d{2}$/
const MM_DD_YYYY = /^\d{2}\/\d{2}\/\d{4}$/
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const RDFS_LABEL = 'rdfs:label'
const RDFS_LABEL_IRI = 'http://www.w3.org/2000/01/rdf-schema#label'

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
  if (trimmed === 'true') return `${XSD}boolean`
  if (trimmed === 'false') return `${XSD}boolean`

  const numberValue = Number(trimmed)
  if (!Number.isNaN(numberValue) && Number.isFinite(numberValue)) {
    return `${XSD}${Number.isInteger(numberValue) ? 'integer' : 'decimal'}`
  }

  if (isValidDateString(trimmed)) {
    const date = new Date(trimmed)
    if (!Number.isNaN(date.getTime())) {
      return `${XSD}${ISO_DATE.test(trimmed) ? 'date' : 'dateTime'}`
    }
  }

  return null
}

export function typeQuad(quad) {
  if (quad.object.termType !== 'Literal') return quad
  if (quad.object.language) return quad
  if (quad.object.datatype?.value !== `${XSD}string`) return quad
  if (quad.predicate.value === RDFS_LABEL || quad.predicate.value === RDFS_LABEL_IRI) return quad

  const datatype = inferTypedLiteral(quad.object.value)
  if (!datatype) return quad

  return rdf.quad(
    quad.subject,
    quad.predicate,
    rdf.literal(quad.object.value, rdf.namedNode(datatype))
  )
}

export const internals = {
  inferTypedLiteral
}
