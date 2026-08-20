import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const expectedPackages = new Map([
  ['canonical-md', 'packages/canonical-md'],
  ['sparql-md', 'packages/sparql-md'],
  ['triplifier-md', 'packages/triplifier-md'],
])

const manifests = [...expectedPackages].map(([name, directory]) => {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  if (manifest.name !== name) {
    throw new Error(`${directory}/package.json has package name ${manifest.name}; expected ${name}`)
  }
  if (manifest.private) {
    throw new Error(`${name} is marked private`)
  }
  if (manifest.publishConfig?.registry !== 'https://registry.npmjs.org/') {
    throw new Error(`${name} is not configured for npmjs.com`)
  }
  return manifest
})

const versions = new Set(manifests.map(manifest => manifest.version))
if (versions.size !== 1) {
  throw new Error(`Workspace versions differ: ${[...versions].join(', ')}`)
}

const [version] = versions
const rootManifest = JSON.parse(readFileSync('package.json', 'utf8'))
if (rootManifest.version !== version) {
  throw new Error(`Root version ${rootManifest.version} does not match workspace version ${version}`)
}

const releaseTag = process.env.GITHUB_REF_NAME
if (releaseTag && releaseTag !== `v${version}`) {
  throw new Error(`Release tag ${releaseTag} does not match workspace version v${version}`)
}

const packDirectory = mkdtempSync(join(tmpdir(), 'dot-triples-pack-'))

try {
  const packed = spawnSync(
    'pnpm',
    ['--filter', './packages/*', '-r', 'pack', '--pack-destination', packDirectory, '--json'],
    { encoding: 'utf8' },
  )

  if (packed.status !== 0) {
    throw new Error(`pnpm pack failed:\n${packed.stderr || packed.stdout}`)
  }

  const packages = JSON.parse(packed.stdout)
  if (packages.length !== expectedPackages.size) {
    throw new Error(`Packed ${packages.length} packages; expected ${expectedPackages.size}`)
  }

  for (const pkg of packages) {
    if (!expectedPackages.has(pkg.name)) {
      throw new Error(`Unexpected package in pack output: ${pkg.name}`)
    }
    if (pkg.version !== version) {
      throw new Error(`${pkg.name} packed as ${pkg.version}; expected ${version}`)
    }

    const paths = new Set(pkg.files.map(file => file.path.toLowerCase()))
    for (const requiredPath of ['license.md', 'package.json', 'readme.md']) {
      if (!paths.has(requiredPath)) {
        throw new Error(`${pkg.name} is missing required publish file: ${requiredPath}`)
      }
    }
    if (![...paths].some(path => path.startsWith('src/'))) {
      throw new Error(`${pkg.name} does not contain any source files`)
    }

    for (const file of pkg.files) {
      if (!/^(LICENSE\.md|package\.json|readme\.md|src\/)/i.test(file.path)) {
        throw new Error(`${pkg.name} contains unexpected publish file: ${file.path}`)
      }
    }

    const packedManifest = spawnSync(
      'tar',
      ['-xOf', pkg.filename, 'package/package.json'],
      { encoding: 'utf8' },
    )
    if (packedManifest.status !== 0) {
      throw new Error(`Could not inspect ${pkg.filename}: ${packedManifest.stderr}`)
    }

    const manifest = JSON.parse(packedManifest.stdout)
    for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
      if (String(range).startsWith('workspace:')) {
        throw new Error(`${pkg.name} still has workspace protocol dependency ${dependency}: ${range}`)
      }
      if (expectedPackages.has(dependency) && range !== version) {
        throw new Error(`${pkg.name} depends on ${dependency}@${range}; expected ${version}`)
      }
    }
  }

  console.log(`Validated ${packages.length} npm packages at version ${version}`)
} finally {
  rmSync(packDirectory, { recursive: true, force: true })
}
