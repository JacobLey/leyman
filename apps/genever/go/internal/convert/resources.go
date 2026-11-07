package convert

import (
	"maps"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
)

// schemaKeywords are the keywords whose value is a schema.
//
//nolint:gochecknoglobals // Never changed
var schemaKeywords = []string{
	keywordAdditionalItems, "additionalProperties", "contains", "contentSchema", keywordElse, "if", keywordItems, "not",
	"propertyNames", keywordThen, "unevaluatedItems", "unevaluatedProperties",
}

// schemaArrayKeywords are the keywords whose value is an array of schemas.
//
//nolint:gochecknoglobals // Never changed
var schemaArrayKeywords = []string{keywordAllOf, keywordAnyOf, keywordItems, keywordOneOf, keywordPrefixItems}

// schemaMapKeywords are the keywords whose value is an object of schemas.
//
//nolint:gochecknoglobals // Never changed
var schemaMapKeywords = []string{
	keywordDefs, "definitions", keywordDependencies, keywordDependentSchemas, "patternProperties", "properties",
}

var (
	draft04Schema = regexp.MustCompile(`^https?://json-schema\.org/draft-04/(?:hyper-)?schema#?$`)
	anchorName    = regexp.MustCompile(`^[A-Z_a-z][\w\-.]*$`)
)

// declaresDraft04 reports whether a schema's `$schema` is draft-04, and then whether it has a `$schema` at all.
func declaresDraft04(schema *jsonv.Object) (bool, bool) {
	value, _ := schema.Get("$schema")
	uri, ok := value.(string)

	return ok && draft04Schema.MatchString(uri), ok
}

// idKeywordOf is the keyword naming a schema's resource: draft-04's `id`, unless it has a `$id`.
func idKeywordOf(schema *jsonv.Object, isDraft04 bool) string {
	if _, ok := schema.Get("$id"); isDraft04 && !ok {
		return "id"
	}

	return "$id"
}

// A target is a schema a reference resolves to, with its canonical JSON Pointer.
type target struct {
	schema  jsonv.Value
	pointer string
}

// A documentIndex holds a document's schema resources and anchors, which references resolve to.
type documentIndex struct {
	// baseURIs is the base URI of each schema with one of its own (the root, and each resource), by JSON Pointer.
	baseURIs map[string]string
	// draft04 holds the JSON Pointers of the schemas read as draft-04.
	draft04 map[string]bool
	// anchors are the schemas named by `$anchor`, by absolute URI with the anchor as fragment.
	anchors map[string]target
	// resources are the schemas named by a URI: the document, and each `$id`.
	resources map[string]target
	// references are the `$ref`s of the document's schemas, resolved, each once, in the order they appear.
	references []documentReference
}

// A documentReference is a `$ref` of a document.
type documentReference struct {
	// uri is the absolute URI it refers to, without the fragment.
	uri string
	// fragment is the fragment of the URI, decoded, without `#`.
	fragment string
	// pointer is the JSON Pointer to the first `$ref` to it.
	pointer string
}

// resolveURI resolves a reference against a base URI, as the WHATWG URL parser does, and splits off its decoded
// fragment. It returns the URI, the fragment, and whether both are valid: a fragment must decode to UTF-8, as
// JavaScript's decodeURIComponent requires.
func resolveURI(reference, baseURI string) (string, string, bool) {
	base, err := url.Parse(baseURI)
	if err != nil {
		return "", "", false
	}

	parsed, err := url.Parse(reference)
	if err != nil {
		return "", "", false
	}

	resolved := base.ResolveReference(parsed)
	fragment := resolved.Fragment
	resolved.Fragment, resolved.RawFragment = "", ""

	return resolved.String(), fragment, utf8.ValidString(fragment)
}

// addTarget adds a target to a map, unless another target is already there.
func addTarget(targets map[string]target, key string, value target, pointer string) error {
	if existing, ok := targets[key]; ok && existing.pointer != value.pointer {
		return gerr.Invalid(quote(key)+" is already declared at "+existing.pointer, pointer)
	}

	targets[key] = value

	return nil
}

// isPointer reports whether a fragment is a JSON Pointer, rather than an anchor name.
func isPointer(fragment string) bool {
	return fragment == "" || strings.HasPrefix(fragment, "/")
}

// followPointer follows a JSON Pointer from a target, or reports false if it leads nowhere.
func followPointer(from target, pointer string) (target, bool) {
	current := from
	if pointer == "" {
		return current, true
	}

	for segment := range strings.SplitSeq(pointer[1:], "/") {
		next, ok := childTarget(current, unescapeSegment(segment))
		if !ok {
			return next, false
		}

		current = next
	}

	return current, true
}

// childTarget is the member of a target's object or array at a key, or reports false if there is none.
func childTarget(parent target, key string) (target, bool) {
	none := target{schema: nil, pointer: ""}

	switch value := parent.schema.(type) {
	case *jsonv.Object:
		child, ok := value.Get(key)
		if !ok {
			return none, false
		}

		return target{schema: child, pointer: childPointer(parent.pointer, key)}, true
	case []jsonv.Value:
		index, err := strconv.Atoi(key)
		if err != nil || index < 0 || index >= len(value) || strconv.Itoa(index) != key {
			return none, false
		}

		return target{schema: value[index], pointer: childPointer(parent.pointer, key)}, true
	default:
		return none, false
	}
}

// An indexer builds a documentIndex by visiting every schema of a document.
type indexer struct {
	index documentIndex
}

// visit indexes a schema and every schema in it.
func (x *indexer) visit(value jsonv.Value, pointer, parentBaseURI string, isParentDraft04 bool) error {
	schema, ok := value.(*jsonv.Object)
	if !ok {
		return nil
	}

	isDraft04, isDeclared := declaresDraft04(schema)
	if !isDeclared {
		isDraft04 = isParentDraft04
	}

	if isDraft04 {
		x.index.draft04[pointer] = true
	}

	baseURI, err := x.identify(schema, pointer, parentBaseURI, isDraft04)
	if err != nil {
		return err
	}

	x.index.baseURIs[pointer] = baseURI
	x.addReference(schema, pointer, baseURI)

	for _, child := range subschemas(schema, pointer) {
		if err := x.visit(child.schema, child.pointer, baseURI, isDraft04); err != nil {
			return err
		}
	}

	return nil
}

// visitFile indexes the schemas of an OpenAPI file at uri, with pointers starting with the URI.
func (x *indexer) visitFile(uri string, file OpenAPIFile) error {
	pointer := uri + "#"
	// Load never loads a file whose URI another schema declares
	x.index.resources[uri] = target{schema: file.document, pointer: pointer}

	x.index.baseURIs[pointer] = uri

	for _, schema := range file.schemas {
		if err := x.visit(schema.schema, uri+schema.pointer, uri, false); err != nil {
			return err
		}
	}

	return nil
}

// addReference records a schema's `$ref`, unless an earlier `$ref` refers to the same URI. An invalid `$ref` is
// reported where it's used.
func (x *indexer) addReference(schema *jsonv.Object, pointer, baseURI string) {
	ref, _ := schema.Get("$ref")

	refString, isString := ref.(string)
	if !isString {
		return
	}

	uri, fragment, isValid := resolveURI(refString, baseURI)
	if !isValid || slices.ContainsFunc(x.index.references, func(existing documentReference) bool {
		return existing.uri == uri && existing.fragment == fragment
	}) {
		return
	}

	x.index.references = append(x.index.references,
		documentReference{uri: uri, fragment: fragment, pointer: childPointer(pointer, "$ref")})
}

// subschemas lists the schemas directly inside a schema, under keywords whose values are schemas.
func subschemas(schema *jsonv.Object, pointer string) []target {
	var children []target

	for _, keyword := range schemaKeywords {
		if value, ok := schema.Get(keyword); ok {
			children = append(children, target{schema: value, pointer: childPointer(pointer, keyword)})
		}
	}

	for _, keyword := range schemaArrayKeywords {
		value, _ := schema.Get(keyword)
		if array, ok := value.([]jsonv.Value); ok {
			for i, member := range array {
				children = append(children, target{schema: member, pointer: indexPointer(childPointer(pointer, keyword), i)})
			}
		}
	}

	for _, keyword := range schemaMapKeywords {
		value, _ := schema.Get(keyword)
		if object, ok := value.(*jsonv.Object); ok {
			for _, key := range object.Keys() {
				member, _ := object.Get(key)
				children = append(children, target{schema: member, pointer: childPointer(childPointer(pointer, keyword), key)})
			}
		}
	}

	return children
}

// An anchor is a keyword naming an anchor, with its value.
type anchor struct {
	value   jsonv.Value
	keyword string
}

// identify indexes a schema's `$id` and anchors, and returns its base URI.
func (x *indexer) identify(schema *jsonv.Object, pointer, parentBaseURI string, isDraft04 bool) (string, error) {
	baseURI := parentBaseURI
	idKeyword := idKeywordOf(schema, isDraft04)

	var anchors []anchor

	for _, keyword := range []string{"$anchor", "$dynamicAnchor"} {
		if value, ok := schema.Get(keyword); ok {
			anchors = append(anchors, anchor{keyword: keyword, value: value})
		}
	}

	if idValue, ok := schema.Get(idKeyword); ok {
		idPointer := childPointer(pointer, idKeyword)

		if idString, isString := idValue.(string); isString && strings.HasPrefix(idString, "#") {
			// Draft 7 and earlier name a plain anchor with `$id`
			anchors = append(anchors, anchor{keyword: idKeyword, value: idString[1:]})
		} else {
			resolved, err := x.resource(schema, idValue, pointer, idPointer, idKeyword, parentBaseURI)
			if err != nil {
				return "", err
			}

			baseURI = resolved
		}
	}

	if err := x.addAnchors(anchors, schema, pointer, baseURI); err != nil {
		return "", err
	}

	return baseURI, nil
}

// addAnchors indexes a schema's anchors, in the resource at baseURI.
func (x *indexer) addAnchors(anchors []anchor, schema *jsonv.Object, pointer, baseURI string) error {
	for _, named := range anchors {
		anchorPointer := childPointer(pointer, named.keyword)

		name, isString := named.value.(string)
		if !isString || !anchorName.MatchString(name) {
			return gerr.Invalid("Invalid anchor name", anchorPointer)
		}

		err := addTarget(x.index.anchors, baseURI+"#"+name, target{schema: schema, pointer: pointer}, anchorPointer)
		if err != nil {
			return err
		}
	}

	return nil
}

// resource indexes a schema named by an `$id` that is a URI, and returns the URI.
func (x *indexer) resource(
	schema *jsonv.Object, id jsonv.Value, pointer, idPointer, idKeyword, parentBaseURI string,
) (string, error) {
	idString, isString := id.(string)

	uri, fragment, ok := resolveURI(idString, parentBaseURI)
	if !isString || !ok || fragment != "" {
		return "", gerr.Invalid(idKeyword+" must be a URI without a fragment", idPointer)
	}

	if err := addTarget(x.index.resources, uri, target{schema: schema, pointer: pointer}, idPointer); err != nil {
		return "", err
	}

	return uri, nil
}

// indexDocument indexes a schema document, read from baseURI, as draft-04 unless it declares another `$schema` when
// isDraft04.
func indexDocument(root jsonv.Value, baseURI string, isDraft04 bool) (documentIndex, error) {
	return indexSchemas(root, []target{{schema: root, pointer: "#"}}, baseURI, isDraft04)
}

// indexSchemas indexes the schemas of a document read from baseURI: the document itself, or those of an OpenAPI
// document, which is not a schema.
func indexSchemas(root jsonv.Value, schemas []target, baseURI string, isDraft04 bool) (documentIndex, error) {
	return indexFiles(root, schemas, nil, baseURI, isDraft04)
}

// indexFiles indexes the schemas of a document, as indexSchemas does, and those of the OpenAPI files it refers to,
// under their URIs.
func indexFiles(
	root jsonv.Value, schemas []target, files map[string]OpenAPIFile, baseURI string, isDraft04 bool,
) (documentIndex, error) {
	documentURI := documentURIOf(root, baseURI)

	walker := &indexer{index: documentIndex{
		baseURIs:  map[string]string{"#": documentURI},
		draft04:   map[string]bool{},
		anchors:   map[string]target{},
		resources: map[string]target{documentURI: {schema: root, pointer: "#"}},
		// Found as the document is visited
		references: nil,
	}}

	for _, schema := range schemas {
		if err := walker.visit(schema.schema, schema.pointer, documentURI, isDraft04); err != nil {
			return documentIndex{}, err //nolint:exhaustruct // Unused with an error
		}
	}

	for _, uri := range slices.Sorted(maps.Keys(files)) {
		if err := walker.visitFile(uri, files[uri]); err != nil {
			return documentIndex{}, err //nolint:exhaustruct // Unused with an error
		}
	}

	return walker.index, nil
}

// documentURIOf is the URI of a document read from baseURI: its root's `$id`, if that is a valid URI.
func documentURIOf(root jsonv.Value, baseURI string) string {
	schema, ok := root.(*jsonv.Object)
	if !ok {
		return baseURI
	}

	isDraft04, _ := declaresDraft04(schema)
	id, _ := schema.Get(idKeywordOf(schema, isDraft04))

	idString, isString := id.(string)
	if !isString {
		return baseURI
	}

	if uri, _, isValid := resolveURI(idString, baseURI); isValid {
		return uri
	}

	return baseURI
}

// indexedAncestor is the nearest schema, from a JSON Pointer up, that has a base URI of its own.
func (i documentIndex) indexedAncestor(pointer string) string {
	ancestor := pointer
	for _, ok := i.baseURIs[ancestor]; !ok; _, ok = i.baseURIs[ancestor] {
		ancestor = ancestor[:strings.LastIndex(ancestor, "/")]
	}

	return ancestor
}

// isDraft04 reports whether the schema at a JSON Pointer is read as draft-04.
func (i documentIndex) isDraft04(pointer string) bool {
	return i.draft04[i.indexedAncestor(pointer)]
}

// resolveReference resolves a `$ref` of the schema at schemaPointer to the schema it refers to.
func (i documentIndex) resolveReference(ref, schemaPointer string) (target, error) {
	refPointer := childPointer(schemaPointer, "$ref")
	baseURI := i.baseURIs[i.indexedAncestor(schemaPointer)]
	quoted := quote(ref)
	none := target{schema: nil, pointer: ""}

	uri, fragment, isValid := resolveURI(ref, baseURI)
	if !isValid {
		return none, gerr.Invalid("Invalid $ref "+quoted, refPointer)
	}

	resource, isKnown := i.resources[uri]
	if !isKnown {
		return none, gerr.Unsupported(
			"Only references within the same document are supported, found "+quoted, refPointer,
		)
	}

	var (
		resolved target
		isFound  bool
	)

	if isPointer(fragment) {
		resolved, isFound = followPointer(resource, fragment)
	} else {
		resolved, isFound = i.anchors[uri+"#"+fragment]
	}

	if !isFound {
		return none, gerr.Invalid("$ref "+quoted+" does not resolve to a schema in the document", refPointer)
	}

	return resolved, nil
}
