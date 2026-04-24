import SerializerNTriples from '@rdfjs/serializer-ntriples'

export function serializeNTriplesStream(quadStream) {
  return new SerializerNTriples().import(quadStream)
}
