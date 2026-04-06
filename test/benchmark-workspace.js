import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { homedir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { triplify, internals as triplifyInternals } from '../src/triplify.js'
import { mapQuad } from '../src/mapping.js'
import { typeQuad } from '../src/typed-literals.js'

const EXCLUDED_DIRS = new Set(['.obsidian', 'node_modules'])

async function* walkMarkdownFiles(root) {
  const entries = await readdir(root, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(root, entry.name)

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      yield* walkMarkdownFiles(fullPath)
      continue
    }

    if (entry.isFile() && extname(entry.name) === '.md') {
      yield fullPath
    }
  }
}

function countLines(text) {
  return text ? text.split('\n').length : 0
}

function formatRate(numerator, elapsedMs) {
  if (elapsedMs === 0) return '0.000'
  return ((numerator / elapsedMs) * 1000).toFixed(3)
}

async function benchmarkWorkspace(root) {
  let fileCount = 0
  let inputBytes = 0
  let triplifyTripleCount = 0
  let pipelineTripleCount = 0
  let triplifyElapsedMs = 0
  let pipelineElapsedMs = 0

  for await (const file of walkMarkdownFiles(root)) {
    const markdown = await readFile(file, 'utf8')
    fileCount += 1
    inputBytes += Buffer.byteLength(markdown, 'utf8')

    const triplifyStartedAt = performance.now()
    const triplified = triplify(markdown, { sourceId: file })
    triplifyElapsedMs += performance.now() - triplifyStartedAt
    triplifyTripleCount += countLines(triplified)

    const pipelineStartedAt = performance.now()
    let typedCount = 0
    const processor = triplifyInternals.createTriplifyProcessor({
      sourceId: file,
      onQuad(quad) {
        typeQuad(mapQuad(quad))
        typedCount += 1
      }
    })

    for (const line of markdown.split('\n')) {
      processor.writeLine(line)
    }

    processor.end()
    pipelineElapsedMs += performance.now() - pipelineStartedAt
    pipelineTripleCount += typedCount
  }

  const inputMiB = inputBytes / (1024 * 1024)
  const totalElapsedMs = triplifyElapsedMs + pipelineElapsedMs

  return {
    root,
    fileCount,
    inputBytes,
    inputMiB,
    triplifyTripleCount,
    pipelineTripleCount,
    triplifyElapsedMs,
    pipelineElapsedMs,
    totalElapsedMs,
    triplifyMiBPerSecond: formatRate(inputMiB, triplifyElapsedMs),
    pipelineMiBPerSecond: formatRate(inputMiB, pipelineElapsedMs),
    triplifyTriplesPerSecond: formatRate(triplifyTripleCount, triplifyElapsedMs),
    pipelineTriplesPerSecond: formatRate(pipelineTripleCount, pipelineElapsedMs)
  }
}

const root = process.argv[2] ?? join(homedir(), 'obsidian/workspace')
const result = await benchmarkWorkspace(root)

console.log(`root=${result.root}`)
console.log(`files=${result.fileCount}`)
console.log(`input_bytes=${result.inputBytes}`)
console.log(`input_mib=${result.inputMiB.toFixed(3)}`)
console.log(`triplify_triples=${result.triplifyTripleCount}`)
console.log(`pipeline_triples=${result.pipelineTripleCount}`)
console.log(`triplify_elapsed_ms=${result.triplifyElapsedMs.toFixed(3)}`)
console.log(`triplify_elapsed_seconds=${(result.triplifyElapsedMs / 1000).toFixed(3)}`)
console.log(`triplify_avg_ms_per_file=${result.fileCount > 0 ? (result.triplifyElapsedMs / result.fileCount).toFixed(3) : '0.000'}`)
console.log(`triplify_mib_per_second=${result.triplifyMiBPerSecond}`)
console.log(`triplify_triples_per_second=${result.triplifyTriplesPerSecond}`)
console.log(`pipeline_elapsed_ms=${result.pipelineElapsedMs.toFixed(3)}`)
console.log(`pipeline_elapsed_seconds=${(result.pipelineElapsedMs / 1000).toFixed(3)}`)
console.log(`pipeline_avg_ms_per_file=${result.fileCount > 0 ? (result.pipelineElapsedMs / result.fileCount).toFixed(3) : '0.000'}`)
console.log(`pipeline_mib_per_second=${result.pipelineMiBPerSecond}`)
console.log(`pipeline_triples_per_second=${result.pipelineTriplesPerSecond}`)
console.log(`total_elapsed_ms=${result.totalElapsedMs.toFixed(3)}`)
console.log(`total_elapsed_seconds=${(result.totalElapsedMs / 1000).toFixed(3)}`)
