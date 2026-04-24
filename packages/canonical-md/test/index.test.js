import test from 'node:test'
import assert from 'node:assert/strict'
import rdf from 'rdf-ext'
import {
  fileURLToPath,
  nameFromUri,
  nameToUri,
  pathToFileURL,
  propertyFromUri,
  propertyToUri,
} from '../src/index.js'

test('canonical name and property helpers round-trip values', () => {
  const name = nameToUri('Alice Smith')
  const property = propertyToUri('has name')

  assert.equal(name.value, 'urn:name:Alice%20Smith')
  assert.equal(property.value, 'urn:property:has%20name')
  assert.equal(nameFromUri(name), 'Alice Smith')
  assert.equal(propertyFromUri(property), 'has name')
  assert.equal(nameFromUri(property), null)
  assert.equal(propertyFromUri(name), null)
})

test('canonical file URL helpers encode and decode paths', () => {
  const unixUrl = pathToFileURL('/tmp/space here.md')
  const relativeUrl = pathToFileURL('notes/today.md')
  const windowsUrl = pathToFileURL('C:/Users/Alice/My Notes.md')

  assert.equal(unixUrl.value, 'file:///tmp/space%20here.md')
  assert.equal(relativeUrl.value, 'file:///notes/today.md')
  assert.equal(windowsUrl.value, 'file://C%3A/Users/Alice/My%20Notes.md')

  assert.equal(fileURLToPath(unixUrl), '/tmp/space here.md')
  assert.equal(fileURLToPath(relativeUrl), '/notes/today.md')
  assert.equal(fileURLToPath(windowsUrl), 'C:/Users/Alice/My Notes.md')
  assert.throws(() => fileURLToPath(rdf.namedNode('https://example.com')), /file: protocol/)
})
