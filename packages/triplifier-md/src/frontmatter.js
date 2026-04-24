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

export function parseScalar(value) {
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

export function parseSimpleYaml(yamlText) {
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

      if (list.length) result[key] = list
      index = cursor - 1
      continue
    }

    result[key] = parseScalar(rest)
  }

  return result
}

export function splitFrontmatter(content) {
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
