package openapi_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/JacobLey/leyman/demos/openapi/go/internal/openapi"
)

func TestOperations(t *testing.T) {
	t.Parallel()

	summary := make([]string, 0, len(openapi.Operations))
	for _, operation := range openapi.Operations {
		summary = append(summary, fmt.Sprintf("%s %s %s %v %v", operation.ID, operation.Method, operation.Path, operation.Scopes, operation.Statuses()))
	}

	want := []string{
		"listNotes GET /notes [notes:read] [200 400 401 403]",
		"createNote POST /notes [notes:write] [201 400 401 403 409 413 422]",
		"getNote GET /notes/{noteId} [notes:read] [200 400 401 403 404]",
	}
	if fmt.Sprint(summary) != fmt.Sprint(want) {
		t.Fatalf("operations %v", summary)
	}

	getNote, ok := openapi.ByID("getNote")
	if !ok || getNote.Parameters[0].Pointer != "/paths/~1notes~1{noteId}/parameters/0/schema" || !getNote.Parameters[0].Required {
		t.Fatalf("getNote %+v", getNote)
	}

	if _, ok := openapi.ByID("deleteNote"); ok {
		t.Fatal("found deleteNote")
	}

	createNote, _ := openapi.ByID("createNote")
	if createNote.BodyPointer != "/paths/~1notes/post/requestBody/content/application~1json/schema" {
		t.Fatalf("body %q", createNote.BodyPointer)
	}
}

func TestSchemaTypes(t *testing.T) {
	t.Parallel()

	for raw, want := range map[string][]string{`"integer"`: {"integer"}, `["integer","null"]`: {"integer", "null"}, ``: nil, `5`: nil} {
		info := openapi.SchemaInfo{Default: nil, Type: json.RawMessage(raw)}
		if got := info.Types(); fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("%s: %v", raw, got)
		}
	}
}

func TestParse(t *testing.T) {
	t.Parallel()

	operations, err := openapi.Parse([]byte(`{"paths":{"/a/{id}":{
		"parameters":[{"name":"id","in":"path","required":true,"schema":{}},{"name":"x","in":"query","schema":{}}],
		"get":{"operationId":"a","security":[{"bearer":["s"]}],"parameters":[{"name":"x","in":"query","schema":{"type":"integer"}}],
			"responses":{"204":{"content":{"application/json":{}}}}}
	}}}`))
	if err != nil {
		t.Fatal(err)
	}

	parameters := operations[0].Parameters
	if len(parameters) != 2 || parameters[1].Pointer != "/paths/~1a~1{id}/get/parameters/0/schema" ||
		parameters[1].Schema.Types()[0] != "integer" || openapi.Pointer("a~b") != "/a~0b" {
		t.Fatalf("parameters %+v", parameters)
	}

	operation := `"operationId":"a","security":[{"bearer":["s"]}]`
	for name, document := range map[string]string{
		"not JSON":            `{`,
		"bad parameters":      `{"paths":{"/a":{"parameters":5}}}`,
		"bad operation":       `{"paths":{"/a":{"get":5}}}`,
		"no operationId":      `{"paths":{"/a":{"get":{"security":[{"bearer":["s"]}]}}}}`,
		"no security":         `{"paths":{"/a":{"get":{"operationId":"a"}}}}`,
		"no scope":            `{"paths":{"/a":{"get":{"operationId":"a","security":[{"bearer":[]}]}}}}`,
		"body not JSON":       `{"paths":{"/a":{"get":{` + operation + `,"requestBody":{"content":{"text/plain":{}}}}}}}`,
		"default response":    `{"paths":{"/a":{"get":{` + operation + `,"responses":{"default":{}}}}}}`,
		"response not JSON":   `{"paths":{"/a":{"get":{` + operation + `,"responses":{"204":{}}}}}}`,
		"second path invalid": `{"paths":{"/a":{},"/b":{"get":5}}}`,
	} {
		if _, err := openapi.Parse([]byte(document)); !errors.Is(err, openapi.ErrDocument) || !strings.HasPrefix(err.Error(), "openapi:") {
			t.Errorf("%s: %v", name, err)
		}
	}
}
