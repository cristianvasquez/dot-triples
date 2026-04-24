import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function getRepoUri(targetPath, options = {}) {
  const runner = options.execFile ?? execFileAsync
  const { stdout } = await runner('repo-uri', [targetPath])
  const repoUri = stdout.trim()

  if (!repoUri) {
    throw new Error(`repo-uri returned an empty value for ${targetPath}`)
  }

  return repoUri
}

export async function resolveRewriteContext(options = {}) {
  const filePath = options.file ? resolve(options.file) : null
  const repoTarget = options.repoPath ? resolve(options.repoPath) : null
  const repoUri = options.repoUri ?? (repoTarget
    ? await getRepoUri(repoTarget, options)
    : null)

  return {
    filePath,
    repoUri,
  }
}
