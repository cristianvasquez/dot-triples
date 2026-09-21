// Shared fence state for Markdown documents and canvas text cards.
export function createFenceParser() {
  let fence = null
  return {
    readLine(line) {
      const marker = line.replace(/\r$/, '').match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
          fence = null
          return { kind: 'close' }
        }
        return { kind: 'content' }
      }
      if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
        fence = marker[1]
        return { kind: 'open', info: marker[2].trim() }
      }
      return { kind: 'prose' }
    }
  }
}
