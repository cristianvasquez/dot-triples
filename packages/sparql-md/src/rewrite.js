import {
  nameToURI,
  pathToFileURL,
  tokenToURI,
} from 'canonical-md'
import { Parser } from 'sparqljs'

const THIS = '__THIS__'
const DOC = '__DOC__'
const REPO = '__REPO__'

function assertRequiredContext(processed, token, value, message) {
  if (processed.includes(token) && !value) {
    throw new Error(message)
  }
}

function getNameFromPath(filePath) {
  const fileName = String(filePath).split(/[\\/]/).pop() ?? ''
  return fileName.replace(/\.[^.]+$/, '')
}

export function replaceInternalLinks(text, replacer) {
  return text.replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
    return replacer(linkText)
  })
}

export function replacePropertyPlaceholders(text) {
  return text.replace(/__([a-zA-Z][a-zA-Z0-9_\s:]*?)__/g, (match, property) => {
    const propUri = tokenToURI(property.trim())
    return `<${propUri.value}>`
  })
}

export function rewriteQuery(text, context = {}) {
  let processed = String(text)

  assertRequiredContext(
    processed,
    THIS,
    context.filePath,
    'Query uses __THIS__. Provide --file explicitly.',
  )

  assertRequiredContext(
    processed,
    DOC,
    context.filePath,
    'Query uses __DOC__. Provide --file explicitly.',
  )

  assertRequiredContext(
    processed,
    REPO,
    context.repoUri,
    'Query uses __REPO__. Provide --repo-path or --repo-uri explicitly.',
  )

  if (processed.includes(THIS)) {
    const name = getNameFromPath(context.filePath)
    processed = processed.replaceAll(THIS, `<${nameToURI(name).value}>`)
  }

  if (processed.includes(DOC)) {
    const fileUri = pathToFileURL(context.filePath)
    processed = processed.replaceAll(DOC, `<${fileUri.value}>`)
  }

  if (processed.includes(REPO)) {
    processed = processed.replaceAll(REPO, `<${context.repoUri}>`)
  }

  processed = replacePropertyPlaceholders(processed)
  processed = replaceInternalLinks(processed, (linkText) => {
    return `<${nameToURI(linkText.trim()).value}>`
  })

  return processed
}

export const replaceAllTokens = rewriteQuery

export function parseQuery(text) {
  const parser = new Parser({
    skipValidation: false,
    sparqlStar: true,
  })
  return parser.parse(String(text))
}

export function rewriteAndParseQuery(text, context = {}) {
  const query = rewriteQuery(text, context)
  const parsed = parseQuery(query)
  return {
    query,
    parsed,
  }
}
