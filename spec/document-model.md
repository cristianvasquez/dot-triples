---
repo-group: rdf
tags: [spec/rdf]
---

# document-model

The SHACL contract for this model is `shapes/document.ttl` in [model](osg://repo/local:e8f91724f0402986bb4471229a092c12a0fdae49), together with `shapes/resource.ttl`. This page says how Markdown maps onto it. `canonical-md` exports the vocabulary as `vocab` and the naming helpers.

## Three kinds of nodes

A Markdown file produces three kinds of nodes.

**The file** is a `document:File`. It holds frontmatter and says which notes and headings it materialised, with `schema:about`. Its IRI is `urn:name:<name>.md` from this library; a wrapping triplifier may rewrite it to a `file://` or `obsidian://` URI. No shape constrains that IRI.

**The note** is `urn:name:<name>`, a `resource:Resource`. It is what `[[name]]` resolves to, from any file. The first `#` heading materialises it and sets its `rdfs:label`.

**A heading** is `urn:name:<name>%23<heading>`, a `resource:ResourceReference` that has an IRI. Its `resource:source` is the note. Its selectors say which part: an `oa:FragmentSelector` with the heading text under the Obsidian link syntax is its identity; an RFC 5147 line fragment says where it is; an `oa:TextQuoteSelector` with the heading line says what it says.

Fields, references and parts attach to the note or heading they appear under. The file carries only frontmatter and `schema:about`.

## Names

Triplification takes `name`, the canonical note identity, or `file`, from which `name` is derived with `getNameFromPath`. `name` wins when both are given.

Names are exact and reversible: `urn:name:<encodeURIComponent(name)>`. Case is preserved. A link must match the file's casing to resolve to the same IRI. There is no normalisation, so an IRI decodes back to the text that produced it.

A heading name is `<note>#<heading>`. `splitHeadingName` splits it at the first `#`. Depth is not encoded and repeated headings merge: `## Advanced` and `### Advanced` in `Alice.md` are one IRI, `urn:name:Alice%23Advanced`, with one line selector per occurrence.

## The file

```
<urn:name:Alice.md>  rdf:type         document:File
<urn:name:Alice.md>  urn:token:kind   "person"        # any frontmatter key
<urn:name:Alice.md>  schema:about     <urn:name:Alice>
<urn:name:Alice.md>  schema:about     <urn:name:Alice%23Skills>
```

Frontmatter keys the model names go to standard predicates; every other key is `urn:token:<key>`:

| Key | Predicate |
|---|---|
| `title` | `rdfs:label` |
| `tags` | `schema:keywords`, one value per tag |
| `created` | `dct:created` |
| `modified` | `dct:modified` |

`options.mappings` overrides these and applies to body fields too.

Body fields before the first `#` heading attach to the file, since no note exists yet.

## The note

```markdown
# Alice Smith
role :: Product Manager
```

```
<urn:name:Alice>  rdf:type    resource:Resource
<urn:name:Alice>  rdfs:label  "Alice Smith"
<urn:name:Alice>  urn:token:role  "Product Manager"
```

Only the first H1 is the note. Any later `#` heading is a heading like `##`.

## A heading

```markdown
## Skills
expertise :: Python
```

```
<urn:name:Alice%23Skills>  rdf:type          resource:ResourceReference
<urn:name:Alice%23Skills>  rdfs:label        "Skills"
<urn:name:Alice%23Skills>  resource:source   <urn:name:Alice>
<urn:name:Alice%23Skills>  resource:selector [ a oa:FragmentSelector ; rdf:value "Skills" ; dct:conformsTo <https://obsidian.md/help/links> ]
<urn:name:Alice%23Skills>  resource:selector [ a oa:FragmentSelector ; rdf:value "line=2,3" ; dct:conformsTo <http://tools.ietf.org/rfc/rfc5147> ]
<urn:name:Alice%23Skills>  resource:selector [ a oa:TextQuoteSelector ; oa:exact "## Skills" ]
<urn:name:Alice%23Skills>  urn:token:expertise  "Python"
```

RFC 5147 counts line positions from 0, so a heading on 1-based line 3 is `line=2,3`. `lineRange(first, last)` in `canonical-md` builds the value. Identical heading lines are quoted once per IRI.

## Cross-document identity

`[[Alice]]` resolves to `urn:name:Alice` and `[[Alice#Skills]]` to `urn:name:Alice%23Skills`, the same IRIs the owning file produces. Files are triplified independently in any order and the merged graph is the same.

A heading link carries a name and a fragment, which is all a heading's identity takes. So any file that links `[[Bob#Bio]]` emits the reference's type, source and Obsidian fragment selector for `urn:name:Bob%23Bio`. It does not emit `schema:about` for it, does not type `urn:name:Bob`, and does not know Bob's line numbers: the owning file adds those.

`[[#Skills]]` resolves within the current note to `urn:name:<note>%23Skills`. `[[#<note name>]]` and `[[#<first H1 text>]]` resolve to the note itself.

## Fields

All inline field keys go through `tokenToURI`. No `rdf:type` from fields; type assignment happens in downstream SPARQL CONSTRUCTs. The `rdf:type` values this library emits are the structural ones the model names: `document:File`, `resource:Resource`, `resource:ResourceReference`, the selector classes, and the part kinds.

| Syntax | Result |
|---|---|
| `[[Name]]` | `urn:name:Name` |
| `[[Name#Section]]` | `urn:name:Name%23Section`, described as above |
| `[[Name\|Alias]]`, `![[img.png\|411]]` | the alias or size is dropped |
| `[value]` | `urn:token:value` |
| CURIE `schema:Person` | `schema:Person`, expanded later |
| Absolute IRI | the IRI |
| plain text | a literal, typed later |

## References in prose

Named references in prose emit `dct:references` on the current subject. The same extraction runs on heading text.

```markdown
See [the spec](https://example.com/spec), [[Bob]], [sparql], and schema:Person.
```

```
<urn:name:Alice%23Skills>  dct:references  <https://example.com/spec>
<urn:name:Alice%23Skills>  dct:references  <urn:name:Bob>
<urn:name:Alice%23Skills>  dct:references  <urn:token:sparql>
<urn:name:Alice%23Skills>  dct:references  <schema:Person>
<https://example.com/spec>  rdfs:label  "the spec"
```

An embed `![[photo.png]]` is a reference to `urn:name:photo.png`. Resolving it to an image is a wrapping triplifier's job.

## Parts: code blocks and blockquotes

A fenced code block or a contiguous blockquote is a part of the note, attached to the current subject with `schema:hasPart`. It is a `resource:ResourceReference` whose source is the note, with a line fragment for the location and a text quote for the content, typed by kind.

```markdown
```js
const x = 1
```
```

```
<urn:name:Alice%23Skills>  schema:hasPart  _:b
_:b  rdf:type  resource:ResourceReference, schema:SoftwareSourceCode
_:b  resource:source  <urn:name:Alice>
_:b  resource:selector  [ a oa:FragmentSelector ; rdf:value "line=4,6" ; dct:conformsTo <http://tools.ietf.org/rfc/rfc5147> ]
_:b  resource:selector  [ a oa:TextQuoteSelector ; oa:exact "const x = 1" ]
_:b  schema:programmingLanguage  "js"
```

The line range covers the fence lines; the quote is the content between them. A blockquote is `schema:Quotation` with no language. Neither parses fields or references.

## What is gone

- `urn:meta:raw`, `urn:meta:depth`, `urn:meta:line`: replaced by the line and quote selectors. Depth is the count of `#` in the quoted line.
- `urn:token:about`: replaced by `schema:about`.
- `urn:token:_`: replaced by `dct:references`.
- `urn:code-block:<lang>` and `urn:blockquote`: replaced by parts.
- `UNTYPED_TOKEN`: `tokenToURI` throws on an empty token, as `nameToURI` does.

## What is deferred

- SPARQL CONSTRUCTs for domain `rdf:type`, the frontmatter `uri:` key, and CURIE expansion of `urn:token:` predicates.
