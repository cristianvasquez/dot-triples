// The standard prefix table: prefix -> namespace IRI. The one definition of
// these namespaces across dot-triples and the applications that use it.
//
// Plain strings and no imports, so a consumer can read the table without
// loading rdf-ext. Standard vocabularies only: a prefix that belongs to one
// domain or one project is declared by that project and given to the
// triplifier as `options.prefixes`.
export const PREFIXES = Object.freeze({
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  sh: 'http://www.w3.org/ns/shacl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  schema: 'https://schema.org/',
  dc: 'http://purl.org/dc/elements/1.1/',
  dct: 'http://purl.org/dc/terms/',
  dcterms: 'http://purl.org/dc/terms/',
  prov: 'http://www.w3.org/ns/prov#',
  dcat: 'http://www.w3.org/ns/dcat#',
  void: 'http://rdfs.org/ns/void#',
  oa: 'http://www.w3.org/ns/oa#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  org: 'http://www.w3.org/ns/org#',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  adms: 'http://www.w3.org/ns/adms#',
})
