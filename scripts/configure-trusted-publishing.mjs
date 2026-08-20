import { spawnSync } from 'node:child_process'

const packageNames = ['canonical-md', 'sparql-md', 'triplifier-md']

for (const [index, name] of packageNames.entries()) {
  console.log(`Configuring GitHub trusted publishing for ${name}`)
  const result = spawnSync(
    'npm',
    [
      'trust',
      'github',
      name,
      '--file',
      'npm-publish.yml',
      '--repo',
      'cristianvasquez/dot-triples',
      '--allow-publish',
      '--yes',
    ],
    { stdio: 'inherit' },
  )

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Could not configure trusted publishing for ${name}`)
  }

  if (index < packageNames.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 2_000))
  }
}
