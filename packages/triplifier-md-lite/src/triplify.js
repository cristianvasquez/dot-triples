import rdf from 'rdf-ext'
import { FRONTMATTER_TERMS, nameToURI, vocab } from 'canonical-md'
import { createFenceParser } from 'triplifier-md/fences'
import { splitFrontmatter } from 'triplifier-md/frontmatter'
import { extractPlainText, parseField } from 'triplifier-md/inline'
import { documentName, isAbsoluteIri, objectTerm, plainLiteralTerm, predicateNode } from 'triplifier-md/terms'

// The lite model: a file is a tree of sections, each section a record.
//
//   the file     <urn:name:Note.md>      a document:File; frontmatter; the
//                                        text before the first heading
//   a section    <urn:name:Note.md#sN>   the Nth heading of the file, any
//                                        level; dct:isPartOf the enclosing
//                                        section or the file
//
// A section is named by its position, not by its heading text, so two
// sections with the same heading stay two records. A node has its own text as
// rdf:value: the lines up to the next heading, without the field lines, and
// without the text of its subsections. A date value is typed (dateTerm).
// No selectors, no quotes.

const isPartOf = rdf.namedNode('http://purl.org/dc/terms/isPartOf')
const position = rdf.namedNode('https://schema.org/position')

const HEADING = /^(#{1,6})\s+(.*?)\s*$/
const MARKDOWN_LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/
const DATE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(:\d{2})?)?$/
const xsd = local => rdf.namedNode(`http://www.w3.org/2001/XMLSchema#${local}`)

// `2026-02-13` is an xsd:date; `2026-02-13 22:47` and `2026-02-13T22:47:05`
// are an xsd:dateTime, without a time zone. Anything else, and an impossible
// date such as 2026-02-30, stays a plain literal.
export function dateTerm (value) {
  const match = String(value).trim().match(DATE)
  if (!match) return null
  const [, day, time, seconds = ':00'] = match
  const lexical = time ? `${day}T${time}${seconds}` : day
  const parsed = new Date(`${time ? lexical : `${day}T00:00:00`}Z`)
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(lexical)) return null
  return rdf.literal(lexical, xsd(time ? 'dateTime' : 'date'))
}

// A field or frontmatter value: a term by the triplifier-md rules, and a
// plain literal that is a date gets its datatype.
function valueTerm (value) {
  const term = objectTerm(value)
  return (term.termType === 'Literal' && dateTerm(term.value)) || term
}

export function triplify (content, options = {}) {
  const quads = []
  const labeledUrls = new Set()
  const emit = (subject, predicate, object) => quads.push(rdf.quad(subject, predicate, object))

  const fileNode = nameToURI(documentName(options))
  emit(fileNode, vocab.type, vocab.File)

  const { frontmatter, body } = splitFrontmatter(String(content).replace(/\r\n/g, '\n'))
  for (const [key, value] of Object.entries(frontmatter)) {
    // As in triplifier-md: a label or a keyword is text, not a term.
    const term = FRONTMATTER_TERMS[key]
    const plain = term === vocab.label || term === vocab.keywords
    for (const item of [value].flat()) {
      emit(fileNode, predicateNode(key), plain ? plainLiteralTerm(item) : valueTerm(item))
    }
  }

  // A field value that is one Markdown link is the link target; the link
  // text labels it, unless options.linkLabels is false.
  const linkLabels = options.linkLabels !== false

  function emitField (subject, key, value) {
    const link = value.match(MARKDOWN_LINK)
    if (link && isAbsoluteIri(link[2])) {
      const target = objectTerm(link[2])
      emit(subject, predicateNode(key), target)
      if (linkLabels && !labeledUrls.has(target.value)) {
        labeledUrls.add(target.value)
        emit(target, vocab.label, rdf.literal(link[1]))
      }
      return
    }
    emit(subject, predicateNode(key), valueTerm(value))
  }

  const fence = createFenceParser()
  const stack = []
  let current = { node: fileNode, lines: [] }
  let count = 0

  function closeCurrent () {
    const text = current.lines.join('\n').replace(/^\s*\n/, '').trimEnd()
    if (text.trim()) emit(current.node, vocab.value, rdf.literal(text))
  }

  const lines = body.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()

  for (const line of lines) {
    if (fence.readLine(line).kind !== 'prose') {
      current.lines.push(line)
      continue
    }

    const heading = line.match(HEADING)
    if (heading && heading[2]) {
      closeCurrent()
      const depth = heading[1].length
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop()
      const parent = stack.length ? stack[stack.length - 1].node : fileNode
      const node = rdf.namedNode(`${fileNode.value}#s${++count}`)
      emit(node, vocab.label, rdf.literal(extractPlainText(heading[2])))
      emit(node, isPartOf, parent)
      emit(node, position, rdf.literal(String(count), xsd('integer')))
      stack.push({ depth, node })
      current = { node, lines: [] }
      continue
    }

    const field = parseField(line)
    if (field) {
      emitField(current.node, field.key, field.value)
      continue
    }

    current.lines.push(line)
  }
  closeCurrent()

  return quads
}
