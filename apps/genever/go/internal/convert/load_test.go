package convert_test

import (
	"context"
	"crypto/tls"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
)

// writeFiles writes files, by path relative to a new directory, and returns the directory's file URL, ending in `/`.
func writeFiles(t *testing.T, files map[string]string) string {
	t.Helper()

	dir := t.TempDir()

	for name, content := range files {
		file := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(file), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(file, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	return (&url.URL{Scheme: "file", Path: filepath.ToSlash(dir) + "/"}).String() //nolint:exhaustruct_v5 // A file URL
}

// load parses an input, read from baseURI, and loads what it references.
func load(t *testing.T, input, baseURI string, options convert.LoadOptions) (any, error) {
	t.Helper()

	value, err := jsonv.Parse([]byte(input))
	if err != nil {
		t.Fatal(err)
	}

	options.BaseURI = baseURI

	return convert.Load(t.Context(), value, options) //nolint:wrapcheck // The error under test
}

func noLoading() convert.LoadOptions {
	return convert.LoadOptions{OnRead: nil, Client: nil, BaseURI: "", FetchHosts: nil, Fetch: false}
}

// loadTypes loads what an input references, converts it, and returns its types' names and their keys.
func loadTypes(t *testing.T, input, baseURI string, options convert.LoadOptions) map[string]string {
	t.Helper()

	bundled, err := load(t, input, baseURI, options)
	if err != nil {
		t.Fatal(err)
	}

	converted := lax()
	converted.BaseURI = baseURI

	types, err := convert.Convert(bundled, rootName, converted)
	if err != nil {
		t.Fatalf("%v\n%s", err, jsonv.Stringify(bundled))
	}

	result := map[string]string{}
	for _, named := range types {
		result[named.Name] = named.Type.Key()
	}

	return result
}

// expectTypeNames expects exactly the named types.
func expectTypeNames(t *testing.T, types map[string]string, names ...string) {
	t.Helper()

	got := make([]string, 0, len(types))
	for name := range types {
		got = append(got, name)
	}

	slices.Sort(got)
	slices.Sort(names)

	if !slices.Equal(got, names) {
		t.Errorf("got types %v, expected %v", got, names)
	}
}

// expectLoadError expects ErrLoad, at a pointer, referenced from a URI, whose message has each of parts.
func expectLoadError(t *testing.T, err error, pointer, referencedFrom string, parts ...string) {
	t.Helper()

	var loadErr *gerr.Error
	if !errors.As(err, &loadErr) || !errors.Is(err, gerr.ErrLoad) {
		t.Fatalf("got %v, expected a load error", err)
	}

	if loadErr.Pointer != pointer || loadErr.ReferencedFrom != referencedFrom {
		t.Errorf("got %s from %s, expected %s from %s", loadErr.Pointer, loadErr.ReferencedFrom, pointer, referencedFrom)
	}

	for _, part := range parts {
		if !strings.Contains(err.Error(), part) {
			t.Errorf("%q has no %q", err.Error(), part)
		}
	}
}

func TestLoadFiles(t *testing.T) {
	t.Parallel()

	base := writeFiles(t, map[string]string{
		"common/address.json": `{"title": "Address", "type": "object", "properties": {"zip": {"$ref": "zip.yaml"}}}`,
		"common/zip.yaml":     "type: string\n",
		"other.json":          `{"$defs": {"Tag": {"type": "string"}}}`,
		"group.json":          `{"$defs": {"A": {"type": "number"}}}`,
	})

	read := map[string]bool{}
	options := noLoading()
	options.OnRead = func(uri string, text []byte) {
		read[strings.TrimPrefix(uri, base)] = len(text) > 0
	}

	types := loadTypes(t, `{
		"type": "object",
		"properties": {
			"home": {"$ref": "common/address.json"}, "work": {"$ref": "./common/address.json"},
			"tag": {"$ref": "other.json#/$defs/Tag"}, "a": {"$ref": "group.json#/$defs/A"}
		},
		"$defs": {"Local": {"type": "boolean"}}
	}`, base+"root.json", options)

	expectTypeNames(t, types, "Schema", "Local", "Address", "Zip", "Tag", "A")

	if !maps(read, "common/address.json", "common/zip.yaml", "other.json", "group.json") {
		t.Errorf("read %v", read)
	}
}

func maps(read map[string]bool, names ...string) bool {
	if len(read) != len(names) {
		return false
	}

	for _, name := range names {
		if !read[name] {
			return false
		}
	}

	return true
}

func TestLoadNothing(t *testing.T) {
	t.Parallel()

	input := `{"type": "object", "properties": {"a": {"$ref": "#/$defs/A"}}, "$defs": {"A": true}}`

	got, err := load(t, input, "file:///nowhere/root.json", noLoading())
	if err != nil || jsonv.Stringify(got) != jsonv.Stringify(mustParse(t, input)) {
		t.Fatalf("got %s, %v", jsonv.Stringify(got), err)
	}

	if _, err := load(t, `{"$id": 1}`, "file:///nowhere/root.json", noLoading()); !errors.Is(err, gerr.ErrInvalidSchema) {
		t.Errorf("got %v", err)
	}
}

func mustParse(t *testing.T, text string) any {
	t.Helper()

	value, err := jsonv.Parse([]byte(text))
	if err != nil {
		t.Fatal(err)
	}

	return value
}

func TestLoadEmbeds(t *testing.T) {
	t.Parallel()

	base := writeFiles(t, map[string]string{
		"a/item.json":      `{"type": "string"}`,
		"b/item.json":      `{"type": "number"}`,
		"c/item.json":      `{"type": "boolean"}`,
		"yes.json":         `true`,
		"no.json":          `false`,
		"noextension":      `{"type": "null"}`,
		"titled.json":      `{"title": "Named", "type": "integer"}`,
		"elsewhere.json":   `{"$id": "https://example.com/declared.json", "type": "string"}`,
		"relative.json":    `{"$id": "sub/relative.json", "$defs": {"X": {"type": "string"}}, "$ref": "#/$defs/X"}`,
		"anchor.json":      `{"$id": "#plain", "type": "string"}`,
		"back.json":        `{"type": "array", "items": {"$ref": "root.json"}}`,
		"declares.json":    `{"$defs": {"M": {"$id": "missing.json", "type": "string"}}}`,
		"usesmissing.json": `{"$ref": "missing.json"}`,
	})

	input := `{
		"type": "object",
		"properties": {
			"a": {"$ref": "a/item.json"}, "b": {"$ref": "b/item.json"}, "c": {"$ref": "c/item.json"},
			"yes": {"$ref": "yes.json"}, "no": {"$ref": "no.json"}, "n": {"$ref": "noextension"},
			"t": {"$ref": "titled.json"}, "e": {"$ref": "elsewhere.json"}, "r": {"$ref": "relative.json"},
			"p": {"$ref": "anchor.json"}, "back": {"$ref": "back.json"},
			"d": {"$ref": "declares.json"}, "m": {"$ref": "usesmissing.json"}
		}
	}`

	bundled, err := load(t, input, base+"root.json", noLoading())
	if err != nil {
		t.Fatal(err)
	}

	expected := []string{
		"item", "item 2", "item 3", "yes", "no", "noextension", "Named", "declared", "elsewhere", "relative",
		"relative 2", "anchor", "back", "declares", "usesmissing",
	}

	if got := defsKeys(t, bundled); !slices.Equal(got, expected) {
		t.Errorf("got $defs %v, expected %v", got, expected)
	}

	types := loadTypes(t, input, base+"root.json", noLoading())
	if types["Schema"] == "" || types["Named"] == "" || types["Back"] == "" {
		t.Errorf("got %v", types)
	}
}

// defsKeys are the keys of a bundle's `$defs`.
func defsKeys(t *testing.T, bundled any) []string {
	t.Helper()

	schema, _ := bundled.(*jsonv.Object)
	if schema == nil {
		t.Fatalf("got %v", bundled)
	}

	defs, _ := schema.Get("$defs")

	object, _ := defs.(*jsonv.Object)
	if object == nil {
		t.Fatalf("got $defs %v", defs)
	}

	return object.Keys()
}

func TestLoadDraft04(t *testing.T) {
	t.Parallel()

	base := writeFiles(t, map[string]string{
		"inherits.json": `{"id": "named.json", "type": "string"}`,
		"declares.json": `{"$schema": "https://json-schema.org/draft/2020-12/schema", "id": "x", "type": "string"}`,
	})

	bundled, err := load(t, `{
		"$schema": "http://json-schema.org/draft-04/schema#",
		"properties": {"a": {"$ref": "inherits.json"}, "b": {"$ref": "declares.json"}}
	}`, base+"root.json", noLoading())
	if err != nil {
		t.Fatal(err)
	}

	if got := defsKeys(t, bundled); !slices.Equal(got, []string{"named", "inherits", "declares"}) {
		t.Errorf("got $defs %v", got)
	}
}

func TestLoadFailures(t *testing.T) {
	t.Parallel()

	base := writeFiles(t, map[string]string{
		"nested.json":    `{"$ref": "gone.json"}`,
		"bad.json":       `{`,
		"bad.yaml":       "a: [\n",
		"list.json":      `[1]`,
		"invalid.json":   `{"$defs": {"A": {"$id": "x.json"}, "B": {"$id": "x.json"}}}`,
		"wrongtype.json": `{"$id": 1}`,
	})
	root := base + "root.json"

	_, err := load(t, `{"properties": {"a": {"$ref": "missing.json"}}}`, root, noLoading())
	expectLoadError(t, err, "#/properties/a/$ref", root, `Could not load "`+base+`missing.json": `)

	if strings.Contains(err.Error(), "referenced from") {
		t.Errorf("names the input: %v", err)
	}

	_, err = load(t, `{"$ref": "nested.json"}`, root, noLoading())
	expectLoadError(t, err, "#/$ref", base+"nested.json", `referenced from "`+base+`nested.json"`)

	for file, reason := range map[string]string{
		"bad.json": "not valid JSON", "bad.yaml": "not valid YAML: invalid YAML", "list.json": "not a schema",
	} {
		_, err = load(t, `{"$ref": "`+file+`"}`, root, noLoading())
		expectLoadError(t, err, "#/$ref", root, reason)
	}

	_, err = load(t, `{"$ref": "invalid.json"}`, root, noLoading())
	if !errors.Is(err, gerr.ErrInvalidSchema) || errors.Is(err, gerr.ErrLoad) {
		t.Errorf("got %v", err)
	}

	_, err = load(t, `{"$ref": "wrongtype.json"}`, root, noLoading())
	if !errors.Is(err, gerr.ErrInvalidSchema) {
		t.Errorf("got %v", err)
	}

	_, err = load(t, `{"$ref": "ftp://example.com/a.json"}`, root, noLoading())
	expectLoadError(t, err, "#/$ref", root, "ftp: URIs can't be loaded")

	_, err = load(t, `{"$ref": "https://example.com/a.json"}`, root, noLoading())
	expectLoadError(t, err, "#/$ref", root, "loading URLs is disabled")
}

// hosts serves schemas for any host, by host and path, through servers the client dials whatever the URL's host:
// one with TLS for port 443, and one without for any other.
func hosts(t *testing.T, handler http.HandlerFunc) *http.Client {
	t.Helper()

	plain := httptest.NewServer(handler)
	t.Cleanup(plain.Close)

	secure := httptest.NewTLSServer(handler)
	t.Cleanup(secure.Close)

	return &http.Client{ //nolint:exhaustruct_v5 // Defaults, but for dialing and redirects
		Transport: &http.Transport{ //nolint:exhaustruct_v5 // Defaults, but for dialing
			DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
				server := plain
				if strings.HasSuffix(address, ":443") {
					server = secure
				}

				return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String()) //nolint:exhaustruct_v5 // Defaults
			},
			// The test server's certificate is for example.com, not every host it serves
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:exhaustruct_v5,gosec // Only a test server
		},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

// schemaServer serves a schema of each host and path in schemas, redirects of the paths in redirects, and 404s.
func schemaServer(t *testing.T, schemas, redirects map[string]string) *http.Client {
	t.Helper()

	return hosts(t, func(writer http.ResponseWriter, request *http.Request) {
		key := request.Host + request.URL.Path
		if location, ok := redirects[key]; ok {
			http.Redirect(writer, request, location, http.StatusFound)

			return
		}

		schema, ok := schemas[key]
		if !ok {
			http.NotFound(writer, request)

			return
		}

		if yaml, isYAML := strings.CutPrefix(schema, "yaml:"); isYAML {
			writer.Header().Set("Content-Type", "application/yaml")

			schema = yaml
		}

		_, _ = io.WriteString(writer, schema)
	})
}

func fetching(client *http.Client, hostNames ...string) convert.LoadOptions {
	options := noLoading()
	options.Client = client
	options.Fetch = len(hostNames) == 0
	options.FetchHosts = hostNames

	return options
}

func TestLoadURLs(t *testing.T) {
	t.Parallel()

	client := schemaServer(t, map[string]string{
		"example.com/schemas/user.json":   `{"title": "User", "properties": {"tag": {"$ref": "tag"}}}`,
		"example.com/schemas/tag":         "yaml:type: string\n",
		"cdn.example.com/moved/item.json": `{"type": "array", "items": {"$ref": "part.json"}}`,
		"cdn.example.com/moved/part.json": `{"title": "Part", "type": "number"}`,
		"example.com/":                    `{"type": "boolean"}`,
	}, map[string]string{
		"example.com/item.json": "http://cdn.example.com/moved/item.json",
	})

	types := loadTypes(t, `{
		"properties": {"user": {"$ref": "https://example.com/schemas/user.json"}, "item": {"$ref": "item.json"},
			"index": {"$ref": "/"}}
	}`, "http://example.com/root.json", fetching(client))

	// item.json is embedded at its redirected URL, with an alias at its own, which isn't a type
	// A URL without a file name is named Schema, as the root is
	expectTypeNames(t, types, "Schema", "User", "Tag", "Item", "Part", "Schema2")
}

func TestLoadAllowedHosts(t *testing.T) {
	t.Parallel()

	client := schemaServer(t, nil, nil)

	for _, test := range []struct {
		uri     string
		allowed []string
	}{
		{"https://example.com/a.json", []string{"example.com"}},
		{"https://EXAMPLE.com/a.json", []string{"Example.COM"}},
		{"http://example.com:8080/a.json", []string{"example.com:8080"}},
		{"http://example.com/a.json", []string{"example.com:080"}},
		{"https://example.com/a.json", []string{"example.com:443"}},
		{"https://api.example.com/a.json", []string{"*.example.com"}},
		{"http://[::1]:8080/a.json", []string{"[::1]:8080"}},
		{"http://127.0.0.1/a.json", []string{"other.com", "127.0.0.1"}},
	} {
		_, err := load(t, `{"$ref": "`+test.uri+`"}`, "file:///root.json", fetching(client, test.allowed...))
		expectLoadError(t, err, "#/$ref", "file:///root.json", "HTTP 404")
	}

	for _, test := range []struct {
		uri     string
		allowed []string
	}{
		{"https://example.org/a.json", []string{"example.com"}},
		{"http://example.com:8080/a.json", []string{"example.com:80"}},
		{"https://example.com/a.json", []string{"*.example.com"}},
		{"https://badexample.com/a.json", []string{"*.example.com"}},
	} {
		_, err := load(t, `{"$ref": "`+test.uri+`"}`, "file:///root.json", fetching(client, test.allowed...))
		expectLoadError(t, err, "#/$ref", "file:///root.json", "is not an allowed host")
	}

	for _, entry := range []string{"", "example.com/path", "http://example.com", "user@example.com", "%zz"} {
		_, err := load(t, `{}`, "file:///root.json", fetching(client, entry))
		if !errors.Is(err, convert.ErrHost) || !strings.Contains(err.Error(), `"`+entry+`"`) {
			t.Errorf("%q: got %v", entry, err)
		}
	}
}

func TestLoadRedirects(t *testing.T) {
	t.Parallel()

	client := schemaServer(t, map[string]string{"allowed.com/a.json": `{"type": "string"}`}, map[string]string{
		"allowed.com/ok.json":      "/a.json",
		"allowed.com/away.json":    "https://other.com/a.json",
		"allowed.com/file.json":    "file:///etc/passwd",
		"allowed.com/loop.json":    "/loop.json",
		"allowed.com/invalid.json": "http://[",
	})

	if _, err := load(t, `{"$ref": "https://allowed.com/ok.json"}`, "file:///root.json",
		fetching(client, "allowed.com")); err != nil {
		t.Errorf("redirect within the host: %v", err)
	}

	for file, reason := range map[string]string{
		"away.json": "other.com is not an allowed host", "file.json": "redirected to a file: URI",
		"loop.json": "too many redirects", "invalid.json": "failed to parse Location",
	} {
		_, err := load(t, `{"$ref": "https://allowed.com/`+file+`"}`, "file:///root.json", fetching(client, "allowed.com"))
		expectLoadError(t, err, "#/$ref", "file:///root.json", reason)
	}
}

func TestLoadServer(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/moved.json" {
			http.Redirect(writer, request, "/b.yml", http.StatusMovedPermanently)

			return
		}

		_, _ = io.WriteString(writer, map[string]string{
			"/a.json": `{"$ref": "b.yml"}`, "/b.yml": "type: string\n",
		}[request.URL.Path])
	}))
	t.Cleanup(server.Close)

	options := noLoading()
	options.FetchHosts = []string{strings.TrimPrefix(server.URL, "http://")}

	// a.json only refers to b.yml, so is an alias of it, not a type
	types := loadTypes(t, `{"properties": {"a": {"$ref": "`+server.URL+`/a.json"}, "m": {"$ref": "`+server.URL+
		`/moved.json"}}}`, "file:///root.json", options)
	expectTypeNames(t, types, "Schema", "B")

	server.Close()

	_, err := load(t, `{"$ref": "`+server.URL+`/c.json"}`, "file:///root.json", options)
	expectLoadError(t, err, "#/$ref", "file:///root.json", "fetch "+server.URL+"/c.json")
}

// failingBody is a response body that fails to read.
type failingBody struct{}

func (failingBody) Read([]byte) (int, error) { return 0, errors.New("connection reset") } //nolint:err113 // A test's

func (failingBody) Close() error { return nil }

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(request *http.Request) (*http.Response, error) { return f(request) }

func TestLoadBodyFails(t *testing.T) {
	t.Parallel()

	client := &http.Client{Transport: roundTrip(func(request *http.Request) (*http.Response, error) { //nolint:exhaustruct_v5 // Defaults
		return &http.Response{StatusCode: http.StatusOK, Body: failingBody{}, Header: http.Header{}, Request: request}, nil //nolint:exhaustruct_v5 // Enough of a response
	})}

	_, err := load(t, `{"$ref": "https://example.com/a.json"}`, "file:///root.json", fetching(client))
	expectLoadError(t, err, "#/$ref", "file:///root.json", "connection reset")
}
