import test from 'node:test'
import assert from 'node:assert/strict'
import { getRepoUri, resolveRewriteContext } from '../src/context.js'

test('getRepoUri trims stdout', async () => {
  const repoUri = await getRepoUri('/repo', {
    execFile: async () => ({ stdout: 'osg://repo/local:abc123\n' }),
  })

  assert.equal(repoUri, 'osg://repo/local:abc123')
})

test('getRepoUri rejects empty stdout', async () => {
  await assert.rejects(
    () => getRepoUri('/repo', {
      execFile: async () => ({ stdout: ' \n' }),
    }),
    /repo-uri returned an empty value/,
  )
})

test('resolveRewriteContext resolves file path and repo uri', async () => {
  const context = await resolveRewriteContext({
    file: 'notes/example.md',
    repoPath: '/repos/sparql-md',
    execFile: async (command, args) => {
      assert.equal(command, 'repo-uri')
      assert.deepEqual(args, ['/repos/sparql-md'])
      return { stdout: 'osg://repo/local:xyz\n' }
    },
  })

  assert.match(context.filePath, /notes\/example\.md$/)
  assert.equal(context.repoUri, 'osg://repo/local:xyz')
})

test('resolveRewriteContext skips repo-uri lookup when repoUri is provided', async () => {
  const context = await resolveRewriteContext({
    file: '/repo/note.md',
    repoUri: 'osg://repo/local:provided',
    execFile: async () => {
      throw new Error('should not run')
    },
  })

  assert.equal(context.filePath, '/repo/note.md')
  assert.equal(context.repoUri, 'osg://repo/local:provided')
})

test('resolveRewriteContext leaves repoUri null without explicit repo input', async () => {
  const context = await resolveRewriteContext({
    file: '/repo/note.md',
  })

  assert.equal(context.filePath, '/repo/note.md')
  assert.equal(context.repoUri, null)
})
