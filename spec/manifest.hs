{-# LANGUAGE DataKinds              #-}
{-# LANGUAGE DuplicateRecordFields  #-}
{-# LANGUAGE GADTs                  #-}
{-# LANGUAGE KindSignatures         #-}

-- | Type-level manifest of dot-triples.
--
-- This is a /signature-level/ spec, not compiled code. It mirrors @packages/@
-- so the whole library can be reviewed through Haskell's types, in the same
-- style as rdf-cli's and triplifier's @spec/manifest.hs@. The prose companions
-- are @spec/document-model.md@, @spec/canvas-model.md@ and
-- @spec/canonical-md-spec.md@.
--
-- Conventions used to map the JavaScript onto types:
--
--   * @IO a@            — touches the filesystem, a child process, or stdio.
--   * @Either Error a@  — the JS implementation @throw@s on this path.
--   * @Maybe a@         — the JS returns @null@ / @undefined@ on this path.
--   * @Stream a@        — an async, single-pass sequence (a Node @Readable@ in
--                         object mode). Produced lazily, consumed once.
--   * LAW               — a property the code keeps. "(tested)" names the test
--                         that holds it; without that mark it is not tested.
--
-- The library in one line: a /reader/ turns one syntax (Markdown, JSON Canvas)
-- into quads over DEFERRED identifiers ('Name', 'Token'); ONE mapping step
-- ('mapQuad') resolves what it can against a prefix table and a key mapping,
-- the same step for every syntax; what does not resolve stays deferred, a
-- stable IRI a query can find. No reader decides a vocabulary term.

module DotTriples.Manifest where

--------------------------------------------------------------------------------
-- RDF core (the RDF/JS data model, as provided by rdf-ext)
--------------------------------------------------------------------------------

type Iri      = String
type Lexical  = String
type LangTag  = String
type Datatype = Iri

data Term
  = NamedNode    Iri
  | BlankNode    String
  | Literal      Lexical (Maybe LangTag) Datatype
  | DefaultGraph                            -- ^ the "no graph" graph term

data Quad = Quad
  { subject   :: Term
  , predicate :: Term
  , object    :: Term
  , graph     :: Term
  }

data Stream a      -- ^ async, single-pass sequence.
type Error    = String
type Text     = String

-- Graph policy: every reader emits graphless quads ('DefaultGraph'). Placing
-- them in a named graph is the caller's job (triplifier: one graph per file).

--------------------------------------------------------------------------------
-- Deferred identifiers  (packages/canonical-md — the naming layer)
--------------------------------------------------------------------------------

-- Two IRI schemes carry text whose meaning is decided later, by the mapping
-- step or by a SPARQL CONSTRUCT downstream:
--
--   urn:name:<encodeURIComponent(name)>    a thing: a note, a heading, a file,
--                                          an unexpanded CURIE value
--   urn:token:<encodeURIComponent(token)>  a word: a field key, a [token]
--
-- Encoding is exact: no case folding, no whitespace normalisation.

type Name  = String   -- ^ e.g. "Alice", "Alice#Skills", "Board.canvas", "dprod:DataProduct".
type Token = String   -- ^ e.g. "lives in", "sh:path".

-- | Throws on null, empty, or untrimmed input.
nameToUri   :: Name  -> Either Error Term     -- ^ JS nameToURI.
tokenToUri  :: Token -> Either Error Term     -- ^ JS tokenToURI.
nameFromUri :: Term  -> Maybe Name            -- ^ Nothing unless a urn:name: NamedNode.
tokenFromUri :: Term -> Maybe Token           -- ^ Nothing unless a urn:token: NamedNode.
tokenToLiteral :: Token -> Either Error Term  -- ^ plain literal; throws when untrimmed.

-- LAW (round trip, tested: canonical-md/test/index.test.js, fast-check):
--   nameFromUri  <$> nameToUri  n == Right (Just n)
--   tokenFromUri <$> tokenToUri t == Right (Just t)

-- | A heading name is "<note>#<heading>", split at the FIRST '#'.
splitHeadingName :: Name -> (Name, Maybe String)

-- | RFC 5147 line range for 1-based inclusive lines: line 10 alone is
-- "line=9,10". Throws unless 1 <= first <= last.
lineRange :: Int -> Int -> Either Error String

getNameFromPath :: FilePath -> Name           -- ^ basename, ".md" removed (only .md).
getDocName      :: Name -> Either Error Name  -- ^ name ++ ".md"; throws when empty/untrimmed.
pathToFileUrl   :: FilePath -> Term           -- ^ file:// NamedNode, per-segment encoded.
fileUrlToPath   :: Term -> Either Error FilePath  -- ^ throws unless file://.

--------------------------------------------------------------------------------
-- Vocabulary and tables  (canonical-md: vocab, FRONTMATTER_TERMS, prefixes)
--------------------------------------------------------------------------------

-- | The structural terms of the document model (@osg/model shapes/document.ttl,
-- shapes/resource.ttl). The only terms a reader emits besides deferred ones.
data Vocab = Vocab
  { vType, vValue, vLabel                      :: Term  -- rdf:type, rdf:value, rdfs:label
  , vFile, vResource, vResourceReference       :: Term  -- document:File, resource:*
  , vSource, vSelector                         :: Term  -- resource:source, resource:selector
  , vAbout, vHasPart, vKeywords                :: Term  -- schema:*
  , vProgrammingLanguage                       :: Term
  , vSoftwareSourceCode, vQuotation            :: Term
  , vReferences, vDctHasPart                   :: Term  -- dct:references, dct:hasPart
  , vCreated, vModified, vConformsTo           :: Term
  , vFragmentSelector, vTextQuoteSelector      :: Term  -- oa:*
  , vExact                                     :: Term
  , vObsidianLinks, vRfc5147                   :: Term  -- fragment syntaxes a selector
  , vJsonCanvas, vMediaFragments               :: Term  -- conforms to
  }
vocab :: Vocab

type Prefix   = String
type Prefixes = [(Prefix, Iri)]

-- | canonical-md/prefixes: the ONE definition of the standard prefixes across
-- dot-triples and its callers (triplifier core, triplifier vocabulary, the
-- Obsidian plugin). Plain strings, no imports. Standard vocabularies only: a
-- domain prefix (epdp, dprod, ...) is declared by the caller.
-- INVARIANT (tested: canonical-md/test/index.test.js): frozen, every value an
-- http(s) namespace, schema = "https://schema.org/".
prefixes :: Prefixes   -- ^ JS PREFIXES.

-- | A mapping value: a term, a CURIE, or an absolute IRI.
data MappingValue = MTerm Term | MCurieOrIri String
type Mappings     = [(Token, MappingValue)]

-- | The keys the document model names: title -> rdfs:label, tags ->
-- schema:keywords, created -> dct:created, modified -> dct:modified. They are
-- the DEFAULT mappings of 'mapQuad', so they apply to a frontmatter key and to
-- a body field key alike.
frontmatterTerms :: Mappings   -- ^ JS FRONTMATTER_TERMS = triplifier-md MAPPINGS.

--------------------------------------------------------------------------------
-- The reader contract  (what triplifier-md and triplifier-canvas emit)
--------------------------------------------------------------------------------

-- INVARIANT (reader output): every emitted NamedNode is one of
--   * a 'vocab' term,
--   * a urn:name: or urn:token: IRI,
--   * an absolute IRI whose scheme is in 'knownSchemes' (verbatim, unrepaired).
-- In particular a field key is ALWAYS urn:token:<key>, and a CURIE-like value
-- is urn:name:<value> unless its scheme is known. No reader expands a CURIE or
-- applies a mapping.

-- | Schemes read as absolute IRIs, never as CURIEs: http, https, file, urn,
-- mailto, tel, obsidian, osg, pkg, app (triplifier-md src/iri.js).
knownSchemes      :: [String]
isKnownAbsoluteIri :: String -> Bool

-- | THE IRI rule (triplifier-md src/iri.js, export "triplifier-md/iri"). Every
-- reader reads an identifier-shaped text with it: a Markdown field value, a
-- Markdown link target, a canvas link node, a canvas edge label.
--   knownIri   t = the IRI t when its scheme is known
--   iriOrName  t = knownIri t, else urn:name:<t>
-- Both are Nothing when t is empty or has a character no IRI may carry
-- (space, <, >, ", {, }, |, \, ^, `); the caller decides if that is an error.
knownIri  :: String -> Maybe Term
iriOrName :: String -> Maybe Term

-- | The shape of a field or frontmatter value, decided by its text alone.
data ValueShape
  = VWikiLink Name       -- ^ [[Name]], [[Name|Alias]], [[#Heading]]  -> urn:name:
  | VToken    Token      -- ^ [value]                                 -> urn:token:
  | VIri      Iri        -- ^ absolute IRI with a known scheme        -> the IRI
  | VCurie    String     -- ^ CURIE-like, scheme not known            -> urn:name:<value>
  | VText     String     -- ^ anything else                           -> plain literal

-- | The heading context a [[#Heading]] link resolves in.
data WikiContext = WikiContext { noteName :: Maybe Name, noteTitle :: Maybe String }

-- | triplifier-md src/terms.js objectTerm. An IRI-shaped value goes through
-- 'iriOrName'; it throws where 'iriOrName' is Nothing.
objectTerm :: WikiContext -> String -> Either Error Term

--------------------------------------------------------------------------------
-- Markdown reader  (packages/triplifier-md — src/triplify.js, src/inline.js)
--------------------------------------------------------------------------------

-- | Caller identity. 'name' wins over 'file'; one of them is required.
data ReadOpts = ReadOpts
  { name :: Maybe Name
  , file :: Maybe FilePath
  }

-- The three kinds of nodes (spec/document-model.md):
--   the file     urn:name:<name>.md          document:File; frontmatter; schema:about
--   the note     urn:name:<name>             resource:Resource; label from the first H1
--   a heading    urn:name:<name>%23<heading> resource:ResourceReference; source the
--                                            note; Obsidian fragment selector
--                                            (identity), RFC 5147 line selector and
--                                            text quote per occurrence
--   a part       blank node                  a code block or blockquote:
--                                            schema:SoftwareSourceCode | schema:Quotation

-- | The current subject of a body line: the latest heading, else the note once
-- the first H1 is seen, else the file.
data Subject = OnFile | OnNote | OnHeading Name

-- | Frontmatter: a YAML subset (scalars, [a, b] lists, "- item" lists).
data Scalar = SText String | SNumber Double | SBool Bool | SNull | SList [Scalar]
parseScalar      :: String -> Scalar
parseSimpleYaml  :: Text -> [(String, Scalar)]
splitFrontmatter :: Text -> ([(String, Scalar)], Text)

-- | One body line, read in this order; the first reading that applies wins:
data LineReading
  = Fence          -- ^ ``` opens or closes a code block; lines inside are content only
  | Blockquote     -- ^ "> ..." lines accumulate into one quotation part
  | Heading Int String  -- ^ #..###### ; the first H1 is the note
  | Field Token String  -- ^ [list marker] [task checkbox] key :: value
  | Prose          -- ^ [label](target), bare IRIs, [[links]], [tokens] -> dct:references;
                   --   a link target is read with 'iriOrName', as a field value is

-- | A candidate field key containing any of  [ ] ( ) / < > "  is not a key:
-- the "::" belonged to a URL or a path, and the line is prose.
fieldKeyRejected :: String -> Bool

-- | The reusable inline layer (fields, prose references, selectors, the
-- identity a heading link implies). triplifier-canvas runs the same one.
data InlineExtractor = InlineExtractor
  { field       :: String -> Term -> Bool   -- ^ False when the line is not a field.
  , references  :: String -> Term -> Bool
  , emitQuoteSelector    :: Term -> String -> Term
  , emitFragmentSelector :: Term -> String -> Term -> Term
  , describeHeadingIfAny :: Term -> ()
  , resolvePredicate     :: Token -> Term   -- ^ always urn:token:<key>
  }
createInlineExtractor :: (Quad -> IO ()) -> WikiContext -> InlineExtractor

-- | Line-at-a-time processor; 'triplify' and the stream transform drive the
-- same one, so both count lines alike.
data Processor = Processor
  { writeLine :: String -> IO ()
  , end       :: IO ()          -- ^ closes an open fence (CommonMark), flushes a quote
  }
createTriplifyProcessor :: ReadOpts -> (Quad -> IO ()) -> Either Error Processor
triplify                :: Text -> ReadOpts -> Either Error [Quad]

-- LAW (cross-document identity, spec/document-model.md): [[Alice#Skills]] in
-- any file and "## Skills" in Alice.md give the same IRI; files triplified
-- independently, in any order, merge into the same graph.

--------------------------------------------------------------------------------
-- The mapping step  (triplifier-md src/curie-expansion.js — ONE for all syntaxes)
--------------------------------------------------------------------------------

-- | "prefix:local" -> namespace ++ local. Nothing when the prefix is unknown,
-- when there is no prefix, or when local starts with "//" (an IRI with an
-- authority, e.g. osg://repo/..., is never a CURIE).
expandCurie :: Prefixes -> String -> Maybe Iri

data MapOpts = MapOpts
  { mPrefixes :: Maybe Prefixes   -- ^ default 'prefixes'. Given, it REPLACES the table.
  , mMappings :: Maybe Mappings   -- ^ default 'frontmatterTerms'. Given, it REPLACES them.
  }

-- | Per term, by position. The graph term passes through.
--
--   predicate urn:token:<k>   k in mappings  -> the mapping value, a CURIE in it expanded
--                             else           -> expandCurie k, else unchanged
--   any       urn:name:<n>                   -> expandCurie n, else unchanged
--   any       absolute IRI, known scheme     -> 'sanitizeForNQuads'
--   otherwise                                -> unchanged (a raw NamedNode is NOT parsed)
--
-- A urn:token: in subject or object position ([token]) is not mapped.
mapQuad :: MapOpts -> Quad -> Quad

-- LAW (unknown stays deferred, tested: triplifier-md "an unknown CURIE stays a
-- name as an object and a token as a key"): with no matching prefix,
-- "acme:k :: acme:v" gives <urn:token:acme%3Ak> <urn:name:acme%3Av>.
-- LAW (osg:// safe, tested: triplifier-md "mapQuad leaves an IRI with an
-- authority alone"): even with an "osg" prefix, osg://repo/x is unchanged.

-- | Percent-encodes what an N-Quads parser (Oxigraph) rejects in an absolute
-- IRI with a known scheme: space -> %20, "[1]" in a query -> %5B1%5D, a second
-- '#' -> %23. Keeps an IPv6 literal in the authority. Nothing when the value is
-- not a known absolute IRI (triplifier-md src/iri.js).
sanitizeForNQuads :: String -> Maybe Iri

--------------------------------------------------------------------------------
-- Typed literals  (triplifier-md src/typed-literals.js)
--------------------------------------------------------------------------------

-- | An xsd:string literal with no language gets a datatype from its text:
-- "true"/"false" -> boolean, a finite number -> integer | decimal,
-- YYYY-MM-DD -> date, ISO date-time / YYYY/MM/DD / MM/DD/YYYY -> dateTime.
-- The objects of rdfs:label, rdf:value and oa:exact stay text (full IRIs: this
-- runs after 'mapQuad'). The graph term passes through (tested).
typeQuad :: Quad -> Quad

--------------------------------------------------------------------------------
-- Package surface  (triplifier-md index.js, streams.js, cli.js)
--------------------------------------------------------------------------------

canProcessMd :: FilePath -> Bool     -- ^ ends with ".md".

-- | The whole library for one Markdown text, buffered.
--   triplifyToQuads t o = map (typeQuad . mapQuad o) <$> triplify t o
triplifyToQuads :: Text -> ReadOpts -> MapOpts -> Either Error [Quad]

type QuadTransform = Stream Quad -> Stream Quad

createTriplifyQuadTransform      :: ReadOpts -> Stream Text -> Stream Quad  -- ^ the reader, chunked.
createMappingQuadTransform       :: MapOpts -> QuadTransform                 -- ^ 'mapQuad' as a stage.
createTypedLiteralsQuadTransform :: QuadTransform                            -- ^ 'typeQuad' as a stage.
serializeNTriplesStream          :: Stream Quad -> Stream Text

-- | bin "triplify": stdin Markdown -> stdout N-Triples, with the DEFAULT tables:
--   reader :> mapping :> typed literals :> N-Triples
triplifyCli :: FilePath -> IO ()

--------------------------------------------------------------------------------
-- JSON Canvas reader  (packages/triplifier-canvas)
--------------------------------------------------------------------------------

-- | The JSON Canvas 1.0 input, as far as the reader reads it. A node with no id,
-- or a repeated id, is dropped. A rectangle is known only when x, y, width and
-- height are all finite.
data CanvasNode
  = FileNode  { nodeId :: String, nodeFile :: FilePath, nodeSubpath :: Maybe String, rect :: Maybe Rect }
  | LinkNode  { nodeId :: String, nodeUrl :: String, rect :: Maybe Rect }
  | TextNode  { nodeId :: String, nodeText :: String, rect :: Maybe Rect }
  | GroupNode { nodeId :: String, nodeLabel :: Maybe String, rect :: Maybe Rect }
  | OtherNode { nodeId :: String, rect :: Maybe Rect }

data Rect = Rect { x, y, width, height :: Double }

data End = ArrowEnd | NoEnd
data CanvasEdge = CanvasEdge
  { fromNode, toNode :: String
  , fromEnd          :: End      -- ^ default NoEnd
  , toEnd            :: End      -- ^ default ArrowEnd
  , edgeLabel        :: Maybe String
  }

data Canvas = Canvas { nodes :: [CanvasNode], edges :: [CanvasEdge] }

parseCanvas :: Text -> Either Error Canvas   -- ^ JSON.parse; also accepts an object or a Buffer.

-- Naming (src/terms.js). A canvas keeps its extension: the file is the whole
-- resource, so one IRI serves the file and [[Board.canvas]].
--   the canvas   urn:name:<name>.canvas          document:File; label; schema:about anchors
--   an anchor    urn:name:<name>.canvas%23<id>   resource:ResourceReference; source the
--                                                canvas; JSON Canvas fragment selector (id)
--                                                and media fragment "xywh=x,y,w,h"
resolveCanvasName :: ReadOpts -> Either Error Name   -- ^ 'name' wins; else the basename of 'file'.
canvasLabel       :: Name -> String                  -- ^ name without ".canvas".
anchorNode        :: Name -> String -> Term          -- ^ urn:name:<name>#<id>.
mediaFragment     :: Rect -> String                  -- ^ "xywh=x,y,w,h", canvas coordinates.

-- | What a node denotes: the note behind a file node (bob/Bob.md -> urn:name:Bob,
-- img.png keeps its extension, a subpath gives the heading IRI), 'iriOrName' of
-- the URL of a link node (Nothing, and no reference, when that is Nothing). A text or group node denotes nothing, and its anchor stands for it.
-- The anchor dct:references what the node denotes. A text card runs the
-- Markdown 'InlineExtractor' on its lines (fields and prose, fenced code skipped).
denotes :: Name -> CanvasNode -> Maybe Term

-- | An edge states a property between what its two ends denote.
--   label empty                        -> dct:references
--   label with 'knownIri'              -> that IRI, verbatim
--   otherwise                          -> urn:token:<label, whitespace collapsed>,
--                                         resolved later by 'mapQuad'
-- Direction from the arrowheads: toEnd arrow or no arrowhead at all -> from p to;
-- fromEnd arrow -> to p from; both -> both. An edge to an unknown node states nothing.
edgeQuads              :: (String -> Maybe Term) -> CanvasEdge -> [Quad]

-- | The containment rule (src/containment.js), the one relation a canvas does
-- not state: each placed node is dct:hasPart of the SMALLEST group whose
-- rectangle holds it (touching edges count as inside). The part is what the
-- node denotes. Known limits, kept on purpose: equal rectangles hold each
-- other; a tie in area is broken by file order; degenerate rectangles are not
-- rejected; a node sticking out of a group is in no group.
contains    :: CanvasNode -> CanvasNode -> Bool
area        :: CanvasNode -> Double
containment :: [(CanvasNode, Term {- anchor -}, Term {- denotes -})] -> [(Term, Term)]

createCanvasProcessor :: ReadOpts -> (Quad -> IO ()) -> Either Error (Canvas -> IO ())
triplifyCanvas        :: Text -> ReadOpts -> Either Error [Quad]

canProcessCanvas       :: FilePath -> Bool   -- ^ ends with ".canvas".
triplifyCanvasToQuads  :: Text -> ReadOpts -> MapOpts -> Either Error [Quad]
-- ^ JS triplifyToQuads: map (typeQuad . mapQuad o) <$> triplifyCanvas t o.
createCanvasQuadTransform :: ReadOpts -> Stream Text -> Stream Quad
-- ^ buffers the whole file (JSON is not line-oriented); a stream for symmetry only.

--------------------------------------------------------------------------------
-- SPARQL over the same names  (packages/sparql-md)
--------------------------------------------------------------------------------

-- | What a query may refer to. A placeholder whose value is missing is an error.
data RewriteContext = RewriteContext
  { filePath :: Maybe FilePath
  , repoUri  :: Maybe Iri
  }

-- | Rewrites a query written with the Markdown names into IRIs:
--   __THIS__      -> <urn:name:<note of filePath>>
--   __DOC__       -> <file://... of filePath>
--   __REPO__      -> <repoUri>
--   __<words>__   -> <urn:token:<words>>
--   [[Name]]      -> <urn:name:Name>
-- Throws when __THIS__ or __DOC__ is used with no filePath, or __REPO__ with no repoUri.
rewriteQuery        :: RewriteContext -> Text -> Either Error Text
parseQuery          :: Text -> Either Error SparqlAst          -- ^ sparqljs, SPARQL-star on.
rewriteAndParseQuery :: RewriteContext -> Text -> Either Error (Text, SparqlAst)
data SparqlAst

-- | repo-uri CLI: a path to its osg:// repository URI.
getRepoUri            :: FilePath -> IO (Either Error Iri)
resolveRewriteContext :: Maybe FilePath -> Maybe FilePath {- repoPath -} -> Maybe Iri -> IO RewriteContext

--------------------------------------------------------------------------------
-- Compile-only stubs
--------------------------------------------------------------------------------

manifestOnly :: a
manifestOnly = error "signature-level manifest only"

nameToUri = manifestOnly
tokenToUri = manifestOnly
nameFromUri = manifestOnly
tokenFromUri = manifestOnly
tokenToLiteral = manifestOnly
splitHeadingName = manifestOnly
lineRange = manifestOnly
getNameFromPath = manifestOnly
getDocName = manifestOnly
pathToFileUrl = manifestOnly
fileUrlToPath = manifestOnly

vocab = manifestOnly
prefixes = manifestOnly
frontmatterTerms = manifestOnly

knownSchemes = manifestOnly
isKnownAbsoluteIri = manifestOnly
knownIri = manifestOnly
iriOrName = manifestOnly
objectTerm = manifestOnly

parseScalar = manifestOnly
parseSimpleYaml = manifestOnly
splitFrontmatter = manifestOnly
fieldKeyRejected = manifestOnly
createInlineExtractor = manifestOnly
createTriplifyProcessor = manifestOnly
triplify = manifestOnly

expandCurie = manifestOnly
mapQuad = manifestOnly
sanitizeForNQuads = manifestOnly
typeQuad = manifestOnly

canProcessMd = manifestOnly
triplifyToQuads = manifestOnly
createTriplifyQuadTransform = manifestOnly
createMappingQuadTransform = manifestOnly
createTypedLiteralsQuadTransform = manifestOnly
serializeNTriplesStream = manifestOnly
triplifyCli = manifestOnly

parseCanvas = manifestOnly
resolveCanvasName = manifestOnly
canvasLabel = manifestOnly
anchorNode = manifestOnly
mediaFragment = manifestOnly
denotes = manifestOnly
edgeQuads = manifestOnly
contains = manifestOnly
area = manifestOnly
containment = manifestOnly
createCanvasProcessor = manifestOnly
triplifyCanvas = manifestOnly
canProcessCanvas = manifestOnly
triplifyCanvasToQuads = manifestOnly
createCanvasQuadTransform = manifestOnly

rewriteQuery = manifestOnly
parseQuery = manifestOnly
rewriteAndParseQuery = manifestOnly
getRepoUri = manifestOnly
resolveRewriteContext = manifestOnly
