import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const packageNames = ['canonical-md', 'sparql-md', 'triplifier-md']
const dryRun = process.argv.includes('--dry-run')

const rootManifest = JSON.parse(readFileSync('package.json', 'utf8'))
const version = rootManifest.version
const packDirectory = mkdtempSync(join(tmpdir(), 'dot-triples-publish-'))

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`)
  }
}

try {
  const packed = spawnSync(
    'pnpm',
    ['--filter', './packages/*', '-r', 'pack', '--pack-destination', packDirectory, '--json'],
    { encoding: 'utf8' },
  )
  if (packed.error) throw packed.error
  if (packed.status !== 0) {
    throw new Error(`pnpm pack failed:\n${packed.stderr || packed.stdout}`)
  }

  const tarballs = new Map(JSON.parse(packed.stdout).map(pkg => [pkg.name, pkg.filename]))
  for (const name of packageNames) {
    const tarball = tarballs.get(name)
    if (!tarball) throw new Error(`No tarball was produced for ${name}`)

    const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
    const response = await fetch(registryUrl)
    if (response.ok) {
      console.log(`Skipping ${name}@${version}: already published`)
      continue
    }
    if (response.status !== 404) {
      throw new Error(`npm registry returned HTTP ${response.status} for ${name}@${version}`)
    }

    console.log(`${dryRun ? 'Checking' : 'Publishing'} ${name}@${version}`)
    run('npm', ['publish', tarball, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])])
  }
} finally {
  rmSync(packDirectory, { recursive: true, force: true })
}
