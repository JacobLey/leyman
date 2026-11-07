package convert

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"slices"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
)

// LoadOptions are what Load reads, and how.
type LoadOptions struct {
	// OnRead is called with the text of each file or URL read, by the URI it was referenced by, e.g. to record hashes of
	// the inputs. It may be nil.
	OnRead func(uri string, text []byte)
	// Client fetches URLs. It must not follow redirects, which Load follows only to allowed hosts. Nil is a client that
	// doesn't.
	Client *http.Client
	// BaseURI is the URI the input was read from, which relative references resolve against.
	BaseURI string
	// FetchHosts are the hosts URLs may be loaded from, as allowHosts reads them. Without any, Fetch decides.
	FetchHosts []string
	// Fetch loads URLs from any host. Otherwise only files are loaded.
	Fetch bool
}

// maxRedirects is as many redirects as a browser's fetch follows.
const maxRedirects = 20

// yamlPath is the path of a YAML file, rather than JSON.
var yamlPath = regexp.MustCompile(`(?i)\.ya?ml$`)

// unloadable is why a resource can't be loaded.
type unloadable struct {
	// cause is the underlying error, e.g. the file system's or the parser's, if there was one.
	cause  error
	reason string
}

// A loadFailure is a resource that failed to load, and the `$ref` that needed it.
type loadFailure struct {
	unloadable

	uri            string
	pointer        string
	referencedFrom string
}

// A pendingReference is a `$ref` to load, in the file or URL at referencedFrom.
type pendingReference struct {
	documentReference

	referencedFrom string
	// kind is what it refers to: a schema, or an OpenAPI object (in a reference object).
	kind objectKind
}

// A loader loads every file and URL an input references.
type loader struct {
	ctx       context.Context //nolint:containedctx // Only lives for one call of Load
	options   LoadOptions
	isAllowed hostFilter
	client    *http.Client
	// known are the URIs of the schemas found so far, which need no loading.
	known map[string]bool
	// attempted are the URIs loaded, or that failed to.
	attempted map[string]bool
	// resources are the loaded schemas, to embed.
	resources []*jsonv.Object
	failures  []loadFailure
	// files are the OpenAPI documents loaded, by the URI they were referenced by.
	files map[string]*loadingFile
	// pending are the references still to load, as a stack: the last is next. Each file's are pushed in reverse, so
	// references load in the order they appear, each followed by what it refers to.
	pending []pendingReference
	// inputDialect is the input's dialect, which a file of OpenAPI objects it references has.
	inputDialect   Dialect
	isInputDraft04 bool
}

// A loadingFile is an OpenAPI document being loaded.
type loadingFile struct {
	OpenAPIFile

	// walked are the objects whose schemas have been found, by kind and JSON Pointer.
	walked map[walkedObject]bool
}

// A walkedObject is an object of an OpenAPI file whose schemas have been found.
type walkedObject struct {
	pointer string
	kind    objectKind
}

// A Bundle is an input, and every file and URL it references.
type Bundle struct {
	// Input is the input, with every schema it references embedded.
	Input jsonv.Value
	// Files are the OpenAPI documents the input references, by URI, for Options.Files.
	Files map[string]OpenAPIFile
}

// Load loads every file and URL an input references, and everything they reference in turn. The input is a schema, or
// an OpenAPI document, whose schemas' references are loaded.
//
// Loaded schemas are embedded in the input's `$defs` (or an OpenAPI document's `components.schemas`) with an absolute
// `$id`, named after their `title`, or else their file name. References are left as they are, and resolve to the
// embedded schemas by URI, as in the bundling process of JSON Schema 2020-12. The input is returned as it is if it
// references nothing to load.
//
// Another OpenAPI document isn't a schema, so isn't embedded: it's returned beside the input, with the schemas of it
// that are used, which are its components' and those referenced in it.
//
// A file or URL that can't be loaded fails with ErrLoad, unless another loaded schema declares its URI with `$id`. A
// loaded schema that isn't valid fails as the input would, with a pointer into that schema. An allowed host that is
// not a host fails with ErrHost.
func Load(ctx context.Context, input jsonv.Value, options LoadOptions) (Bundle, error) {
	none := Bundle{Input: nil, Files: nil}

	isAllowed, err := fetchFilter(options.Fetch, options.FetchHosts)
	if err != nil {
		return none, err
	}

	inputDialect, isDocument, err := DocumentDialect(input)
	if err != nil {
		return none, err
	}

	client := options.Client
	if client == nil {
		client = noRedirects()
	}

	schema, isSchema := input.(*jsonv.Object)
	isInputDraft04 := false

	if isSchema && !isDocument {
		isInputDraft04, _ = declaresDraft04(schema)
	}

	load := &loader{
		ctx: ctx, options: options, isAllowed: isAllowed, client: client,
		known: map[string]bool{}, attempted: map[string]bool{}, inputDialect: inputDialect,
		isInputDraft04: isInputDraft04,
		// Found as references are loaded
		resources: nil, failures: nil, files: map[string]*loadingFile{}, pending: nil,
	}

	index, references, err := indexInput(input, isDocument, options.BaseURI)
	if err != nil {
		return none, err
	}

	load.queue(index, references, options.BaseURI)

	if err := load.run(); err != nil {
		return none, err
	}

	files := map[string]OpenAPIFile{}
	for uri, file := range load.files {
		files[uri] = file.OpenAPIFile
	}

	if len(load.resources) == 0 {
		return Bundle{Input: input, Files: files}, nil
	}

	return Bundle{Input: embed(schema, load.resources, isDocument), Files: files}, nil
}

// noRedirects is a client that doesn't follow redirects.
func noRedirects() *http.Client {
	return &http.Client{ //nolint:exhaustruct_v5 // Defaults, but for redirects
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

// indexInput indexes the schemas of an input: itself, or an OpenAPI document's, whose components must be an object to
// embed schemas in. It also returns the reference objects of a document.
func indexInput(input jsonv.Value, isDocument bool, baseURI string) (documentIndex, []objectReference, error) {
	if !isDocument {
		index, err := indexDocument(input, baseURI, false)

		return index, nil, err
	}

	if components, ok := input.(*jsonv.Object).Get("components"); ok { //nolint:forcetypeassert // A document's an object
		if _, err := readObject(components, "#/components"); err != nil {
			return documentIndex{}, nil, err
		}
	}

	parts := documentParts(input, true)
	index, err := indexSchemas(input, parts.schemas, baseURI, false)

	return index, parts.references, err
}

// queue adds the references of a file's schemas, then of its reference objects, to load. A reference object's `$ref`
// resolves against the file's URI, and one that is invalid is reported where it's used.
func (l *loader) queue(index documentIndex, objects []objectReference, referencedFrom string) {
	for uri := range index.resources {
		l.known[uri] = true
	}

	references := make([]pendingReference, 0, len(index.references)+len(objects))
	for _, reference := range index.references {
		references = append(references,
			pendingReference{documentReference: reference, referencedFrom: referencedFrom, kind: kindSchema})
	}

	for _, object := range objects {
		ref, isString := object.ref.(string)
		if !isString {
			continue
		}

		if uri, fragment, isValid := resolveURI(ref, referencedFrom); isValid {
			references = append(references, pendingReference{
				documentReference: documentReference{uri: uri, fragment: fragment, pointer: childPointer(object.pointer, "$ref")},
				referencedFrom:    referencedFrom,
				kind:              object.kind,
			})
		}
	}

	for _, reference := range slices.Backward(references) {
		l.pending = append(l.pending, reference)
	}
}

func (l *loader) run() error {
	for len(l.pending) > 0 {
		reference := l.pending[len(l.pending)-1]
		l.pending = l.pending[:len(l.pending)-1]

		if file, ok := l.files[reference.uri]; ok {
			if err := l.walk(file, reference); err != nil {
				return err
			}

			continue
		}

		if l.known[reference.uri] || l.attempted[reference.uri] {
			continue
		}

		l.attempted[reference.uri] = true

		if err := l.load(reference); err != nil {
			return err
		}
	}

	// A resource may fail to load from its URI, but be declared by `$id` in another loaded schema
	for _, failure := range l.failures {
		if !l.known[failure.uri] {
			return failure.error(l.options.BaseURI)
		}
	}

	return nil
}

func (f loadFailure) error(baseURI string) error {
	// Other errors' pointers are into the input, so name the file only when it's another
	from := ""
	if f.referencedFrom != baseURI {
		from = ", referenced from " + quote(f.referencedFrom)
	}

	return &gerr.Error{
		Kind:           gerr.ErrLoad,
		Cause:          f.cause,
		Message:        "Could not load " + quote(f.uri) + from + ": " + f.reason,
		Pointer:        f.pointer,
		ReferencedFrom: f.referencedFrom,
	}
}

func (l *loader) load(reference pendingReference) error {
	fail := func(why unloadable) {
		l.failures = append(l.failures, loadFailure{
			unloadable: why, uri: reference.uri, pointer: reference.pointer, referencedFrom: reference.referencedFrom,
		})
	}

	parsed, readURI, why := l.readResource(reference.uri)
	if why != nil {
		fail(*why)

		return nil
	}

	dialect, isDocument, err := DocumentDialect(parsed)
	if err != nil {
		fail(unloadable{cause: err, reason: err.Error()})

		return nil //nolint:nilerr // A failure, only reported if no other schema declares the URI
	}

	if isDocument || reference.kind != kindSchema {
		return l.loadDocument(reference, parsed, dialect, isDocument)
	}

	resource, why := schemaResource(parsed, readURI, l.isInputDraft04)
	if why != nil {
		fail(*why)

		return nil
	}

	index, err := indexDocument(resource, readURI, l.isInputDraft04)
	if err != nil {
		return err
	}

	// The `$id` of a schema may be relative to where it was loaded from
	resourceURI := index.baseURIs["#"]
	if l.known[resourceURI] {
		// Already loaded, by a URI that redirects to the same place, or declared by another schema's `$id`
		l.resources = append(l.resources, aliasOf(reference.uri, resourceURI))
		l.known[reference.uri] = true

		return nil
	}

	resource.Set("$id", resourceURI)
	l.resources = append(l.resources, resource)

	if resourceURI != reference.uri {
		l.resources = append(l.resources, aliasOf(reference.uri, resourceURI))
	}

	// Referred to by its URL, even if its `$id` is another
	l.known[reference.uri] = true
	l.queue(index, nil, reference.uri)

	return nil
}

// loadDocument adds a loaded OpenAPI file to the files: an OpenAPI document, with its components' schemas, or a file
// of OpenAPI objects a reference object refers to, whose schemas are in the dialect of the file that refers to it.
// Then it adds the schemas of the object the reference refers to. Its references resolve against the URI it was
// referenced by, even if redirected, so it has one URI.
func (l *loader) loadDocument(reference pendingReference, document jsonv.Value, dialect Dialect, isDocument bool) error {
	if !isDocument {
		dialect = l.inputDialect
		if from, ok := l.files[reference.referencedFrom]; ok {
			dialect = from.dialect
		}
	}

	file := &loadingFile{
		OpenAPIFile: OpenAPIFile{document: document, schemas: nil, dialect: dialect},
		walked:      map[walkedObject]bool{},
	}
	l.files[reference.uri] = file
	l.known[reference.uri] = true

	if isDocument {
		if err := l.addParts(reference.uri, file, documentParts(document, false)); err != nil {
			return err
		}
	}

	return l.walk(file, reference)
}

// walk adds the schemas of the object a reference refers to in an OpenAPI file. A reference to nothing, or to an anchor, is
// reported where it's used, if it doesn't resolve.
func (l *loader) walk(file *loadingFile, reference pendingReference) error {
	if !isPointer(reference.fragment) {
		return nil
	}

	found, ok := followPointer(target{schema: file.document, pointer: "#"}, reference.fragment)
	walked := walkedObject{pointer: found.pointer, kind: reference.kind}

	if !ok || file.walked[walked] {
		return nil
	}

	file.walked[walked] = true

	return l.addParts(reference.uri, file, objectParts(found, reference.kind))
}

// addParts adds schemas found in an OpenAPI file, and queues their references, and those of the reference objects
// found. A schema inside one already found is indexed with it, under the right base URI.
func (l *loader) addParts(uri string, file *loadingFile, parts openAPIParts) error {
	added := slices.DeleteFunc(parts.schemas, func(schema target) bool {
		return slices.ContainsFunc(file.schemas, func(found target) bool {
			return schema.pointer == found.pointer || strings.HasPrefix(schema.pointer, found.pointer+"/")
		})
	})
	file.schemas = append(file.schemas, added...)

	index, err := indexSchemas(file.document, added, uri, false)
	if err != nil {
		return err
	}

	l.queue(index, parts.references, uri)

	return nil
}

// readResource reads and parses a file or URL, and returns the value, and the URI it is from after redirects.
func (l *loader) readResource(uri string) (any, string, *unloadable) {
	text, readURI, isYAML, why := l.readText(uri)
	if why != nil {
		return nil, "", why
	}

	if l.options.OnRead != nil {
		l.options.OnRead(uri, text)
	}

	if isYAML {
		parsed, err := ParseYAML(text)
		if err != nil {
			return nil, "", &unloadable{cause: err, reason: "not valid YAML: " + err.Error()}
		}

		return parsed, readURI, nil
	}

	parsed, err := jsonv.Parse(text)
	if err != nil {
		return nil, "", &unloadable{cause: err, reason: "not valid JSON"}
	}

	return parsed, readURI, nil
}

// readText reads a file or URL, and returns its text, the URI it is from after redirects, and whether it is YAML.
func (l *loader) readText(uri string) ([]byte, string, bool, *unloadable) {
	parsed, _ := url.Parse(uri)

	switch parsed.Scheme {
	case "file":
		text, err := os.ReadFile(parsed.Path)
		if err != nil {
			return nil, "", false, &unloadable{cause: err, reason: err.Error()}
		}

		return text, uri, yamlPath.MatchString(parsed.Path), nil
	case schemeHTTP, schemeHTTPS:
		if l.isAllowed == nil {
			return nil, "", false, &unloadable{cause: nil, reason: "loading URLs is disabled"}
		}

		return l.fetch(parsed)
	default:
		return nil, "", false, &unloadable{cause: nil, reason: parsed.Scheme + ": URIs can't be loaded"}
	}
}

// fetch fetches a URL, following redirects only to hosts that are allowed.
func (l *loader) fetch(target *url.URL) ([]byte, string, bool, *unloadable) {
	for range maxRedirects + 1 {
		if !l.isAllowed(target) {
			return nil, "", false, &unloadable{cause: nil, reason: target.Host + " is not an allowed host"}
		}

		response, err := l.get(target)
		if err != nil {
			return nil, "", false, &unloadable{cause: err, reason: err.Error()}
		}

		// The client fails on a redirect to an invalid URL, so one that doesn't parse here isn't a redirect
		next, err := target.Parse(response.Header.Get("Location"))
		if err != nil || response.Header.Get("Location") == "" ||
			!slices.Contains([]int{301, 302, 303, 307, 308}, response.StatusCode) {
			return l.body(target, response)
		}

		_ = response.Body.Close()

		if next.Scheme != schemeHTTP && next.Scheme != schemeHTTPS {
			return nil, "", false, &unloadable{cause: nil, reason: "redirected to a " + next.Scheme + ": URI"}
		}

		target = next
	}

	return nil, "", false, &unloadable{cause: nil, reason: "too many redirects"}
}

func (l *loader) get(target *url.URL) (*http.Response, error) {
	request := (&http.Request{ //nolint:exhaustruct_v5 // A GET without a body
		Method: http.MethodGet,
		URL:    target,
		Header: http.Header{"Accept": {"application/schema+json, application/json, application/yaml;q=0.9"}},
	}).WithContext(l.ctx)

	response, err := l.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", target, err)
	}

	return response, nil
}

// body reads a response, and returns its text, its URL, and whether it is YAML.
func (l *loader) body(target *url.URL, response *http.Response) ([]byte, string, bool, *unloadable) {
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, "", false, &unloadable{cause: nil, reason: fmt.Sprintf("HTTP %d", response.StatusCode)}
	}

	text, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, "", false, &unloadable{cause: err, reason: err.Error()}
	}

	isYAML := yamlPath.MatchString(target.Path) ||
		strings.Contains(strings.ToLower(response.Header.Get("Content-Type")), "yaml")

	return text, target.String(), isYAML, nil
}

// schemaResource makes a loaded schema a resource, to embed.
//
// Its `$id`, if any, is its base URI. Otherwise the URI it was read from, after redirects, is (RFC 3986, section
// 5.1.3), which it is given as its `$id`, so it can be embedded in another document, and still resolve its own
// references. A boolean schema is the object schema of the same meaning. A file without a `$schema` is read in the
// input's dialect.
func schemaResource(parsed jsonv.Value, readURI string, isInputDraft04 bool) (*jsonv.Object, *unloadable) {
	if boolean, isBoolean := parsed.(bool); isBoolean {
		schema := jsonv.NewObject()
		if !boolean {
			schema.Set("not", jsonv.NewObject())
		}

		parsed = schema
	}

	schema, isSchema := parsed.(*jsonv.Object)
	if !isSchema {
		return nil, &unloadable{cause: nil, reason: "not a schema"}
	}

	isDraft04, isDeclared := declaresDraft04(schema)
	if !isDeclared {
		isDraft04 = isInputDraft04
	}

	resource := cloneObject(schema)
	idValue, hasID := schema.Get(idKeywordOf(schema, isDraft04))

	idString, isString := idValue.(string)
	switch {
	case isString && strings.HasPrefix(idString, "#"):
		// Draft 7 names a plain anchor with `$id`, which can't name the schema's resource
		resource.Set("$id", readURI)
		resource.Set("$anchor", idString[1:])
	case hasID:
		resource.Set("$id", idValue)
	default:
		resource.Set("$id", readURI)
	}

	return resource, nil
}

// aliasOf is a schema at uri that is the schema at target.
func aliasOf(uri, target string) *jsonv.Object {
	alias := jsonv.NewObject()
	alias.Set("$id", uri)
	alias.Set("$ref", target)

	return alias
}

func cloneObject(object *jsonv.Object) *jsonv.Object {
	clone := jsonv.NewObject()

	for _, key := range object.Keys() {
		value, _ := object.Get(key)
		clone.Set(key, value)
	}

	return clone
}

// embed returns a copy of the input with the resources added to its `$defs`, or an OpenAPI document's
// `components.schemas`.
func embed(input *jsonv.Object, resources []*jsonv.Object, isDocument bool) *jsonv.Object {
	parent, key := input, keywordDefs

	if isDocument {
		parent, key = jsonv.NewObject(), "schemas"

		if components, ok := input.Get("components"); ok {
			// Load checked its components are an object
			parent = cloneObject(components.(*jsonv.Object)) //nolint:forcetypeassert // Checked by Load
		}
	}

	container := jsonv.NewObject()

	existing, _ := parent.Get(key)
	if defs, ok := existing.(*jsonv.Object); ok {
		container = cloneObject(defs)
	}

	taken := map[string]bool{}
	for _, key := range container.Keys() {
		taken[key] = true
	}

	for _, resource := range resources {
		name := resourceName(resource, taken)
		taken[name] = true
		container.Set(name, resource)
	}

	parent.Set(key, container)

	if !isDocument {
		return parent
	}

	bundled := cloneObject(input)
	bundled.Set("components", parent)

	return bundled
}

// resourceName names an embedded resource, which names its type: its `title`, else its file name, unique among taken.
func resourceName(resource *jsonv.Object, taken map[string]bool) string {
	id, _ := resource.Get("$id")
	parsed, _ := url.Parse(id.(string)) //nolint:forcetypeassert // Every resource is given a URI

	base, _, _ := strings.Cut(path.Base(parsed.Path), ".")
	if base == "" || base == "/" {
		base = "Schema"
	}

	if title, ok := resource.Get("title"); ok {
		if titleString, isString := title.(string); isString {
			base = titleString
		}
	}

	name := base
	for suffix := 2; taken[name]; suffix++ {
		name = fmt.Sprintf("%s %d", base, suffix)
	}

	return name
}
