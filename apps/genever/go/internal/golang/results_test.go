package golang_test

import (
	"go/types"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/golang"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// resultField is a field of a result, with a wrapper for a range or default.
func resultField(name, status, body, wrapper string) convert.ResultField {
	return convert.ResultField{Doc: nil, Name: name, Status: status, Body: body, Wrapper: wrapper, Pointer: ""}
}

// result is an operation's result type.
func result(name string, fields ...convert.ResultField) convert.NamedType {
	return convert.NamedType{Doc: nil, Type: nil, Result: &convert.Result{Fields: fields}, Name: name, Pointer: ""}
}

// resultTypes are the types of an operation with a result of each kind of field, and one of an operation without
// responses.
func resultTypes() []convert.NamedType {
	documented := resultField("OK", "200", "GetNoteResponse200", "")
	documented.Doc = &model.Doc{Tags: nil, Deprecated: false, Description: "", Title: "The note"}

	return []convert.NamedType{
		// Its field's type would be GetNoteResult4XX, taken by the result's
		named("GetNote", object(prop("result4XX", object(prop("a", model.StringType, true)), true))),
		named("GetNoteResponse200", object(prop("text", model.StringType, false))),
		named("GetNoteResponse404", model.Union(model.StringType, model.NullType)),
		named("GetNoteResponseDefault", model.StringType),
		result("GetNoteResult",
			documented,
			resultField("NoContent", "204", "", ""),
			resultField("NotFound", "404", "GetNoteResponse404", ""),
			resultField("Status4XX", "4XX", "", "GetNoteResult4XX"),
			resultField("Default", "default", "GetNoteResponseDefault", "GetNoteResultDefault"),
		),
		result("EmptyResult"),
	}
}

// The harness sets and reads results through their methods, printing a line for each that doesn't do as expected.
const resultHarness = `package main

import (
	"fmt"
	"reflect"

	"harness/schema"
)

func expect(name string, got, expected any) {
	if !reflect.DeepEqual(got, expected) {
		fmt.Printf("%s: got %#v, expected %#v\n", name, got, expected)
	}
}

func response(result schema.GetNoteResult) []any {
	status, body, ok := result.Response()
	return []any{status, body, ok}
}

func unmarshal(status int, data string) []any {
	result := schema.GetNoteResult{NoContent: &struct{}{}}
	ok, err := result.UnmarshalResponse(status, []byte(data))
	return []any{result, ok, err != nil}
}

func main() {
	note := schema.GetNoteResponse200{Text: "a"}
	var missing *string
	none := []any{0, nil, false}

	expect("200", response(schema.GetNoteResult{OK: &note}), []any{200, note, true})
	expect("204", response(schema.GetNoteResult{NoContent: &struct{}{}}), []any{204, nil, true})
	expect("404", response(schema.GetNoteResult{NotFound: &missing}), []any{404, missing, true})
	expect("4XX", response(schema.GetNoteResult{Status4XX: &schema.GetNoteResult4XX{Status: 418}}), []any{418, nil, true})
	expect("default", response(schema.GetNoteResult{Default: &schema.GetNoteResultDefault{Status: 500, Body: "x"}}),
		[]any{500, schema.GetNoteResponseDefault("x"), true})

	// A status of a range or default that another field documents, or that isn't one, is no response
	expect("4XX 404", response(schema.GetNoteResult{Status4XX: &schema.GetNoteResult4XX{Status: 404}}), none)
	expect("4XX 500", response(schema.GetNoteResult{Status4XX: &schema.GetNoteResult4XX{Status: 500}}), none)
	expect("default 450", response(schema.GetNoteResult{Default: &schema.GetNoteResultDefault{Status: 450}}), none)
	expect("default 600", response(schema.GetNoteResult{Default: &schema.GetNoteResultDefault{Status: 600}}), none)
	expect("default 99", response(schema.GetNoteResult{Default: &schema.GetNoteResultDefault{Status: 99}}), none)
	expect("unset", response(schema.GetNoteResult{}), none)
	expect("both", response(schema.GetNoteResult{OK: &note, NoContent: &struct{}{}}), none)

	expect("read 200", unmarshal(200, ` + "`" + `{"text": "a"}` + "`" + `), []any{schema.GetNoteResult{OK: &note}, true, false})
	expect("read 204", unmarshal(204, "not JSON"), []any{schema.GetNoteResult{NoContent: &struct{}{}}, true, false})
	expect("read 404", unmarshal(404, "null"), []any{schema.GetNoteResult{NotFound: &missing}, true, false})
	expect("read 4XX", unmarshal(418, ""), []any{
		schema.GetNoteResult{Status4XX: &schema.GetNoteResult4XX{Status: 418}}, true, false,
	})
	expect("read default", unmarshal(500, ` + "`" + `"x"` + "`" + `), []any{
		schema.GetNoteResult{Default: &schema.GetNoteResultDefault{Status: 500, Body: "x"}}, true, false,
	})

	// Left as it was
	unchanged := schema.GetNoteResult{NoContent: &struct{}{}}
	expect("read 600", unmarshal(600, "null"), []any{unchanged, false, false})
	expect("read bad 200", unmarshal(200, "["), []any{unchanged, false, true})
	expect("read bad 404", unmarshal(404, "1"), []any{unchanged, false, true})
	expect("read bad default", unmarshal(503, "1"), []any{unchanged, false, true})

	var empty schema.EmptyResult
	status, body, ok := empty.Response()
	expect("empty", []any{status, body, ok}, none)
	read, err := empty.UnmarshalResponse(200, nil)
	expect("read empty", []any{empty, read, err}, []any{schema.EmptyResult{}, false, nil})

	// What a client reads, a server answers with
	var result schema.GetNoteResult
	_, _ = result.UnmarshalResponse(451, nil)
	expect("round trip", response(result), []any{451, nil, true})
}
`

// A result has a pointer field per response, tagged with its status, and the field of a range or default holds its
// status with its body.
func TestResultFields(t *testing.T) {
	t.Parallel()

	pkg, _ := compile(t, resultTypes())

	expectFields(t, fields(t, pkg, "GetNoteResult"), map[string]string{
		"OK":        "*GetNoteResponse200",
		"NoContent": "*struct{}",
		"NotFound":  "*GetNoteResponse404",
		"Status4XX": "*GetNoteResult4XX",
		"Default":   "*GetNoteResultDefault",
	})

	// In the order given, each tagged with its status
	structure, _ := lookup(t, pkg, "GetNoteResult").Type().Underlying().(*types.Struct)

	tags := make([]string, structure.NumFields())
	for index := range tags {
		tags[index] = structure.Field(index).Name() + " " + structure.Tag(index)
	}

	if got := strings.Join(tags, ", "); got != `OK status:"200", NoContent status:"204", NotFound status:"404", `+
		`Status4XX status:"4XX", Default status:"default"` {
		t.Errorf("got %s", got)
	}

	expectFields(t, fields(t, pkg, "GetNoteResult4XX"), map[string]string{"Status": "int"})
	expectFields(t, fields(t, pkg, "GetNoteResultDefault"), map[string]string{
		"Status": "int", "Body": "GetNoteResponseDefault",
	})
	expectFields(t, fields(t, pkg, "GetNote"), map[string]string{"Result4XX": "*GetNoteResult4XX2"})
	expectFields(t, fields(t, pkg, "EmptyResult"), map[string]string{})
}

// A server answers with the one response a result sets, and a client reads a response into the field of its status.
func TestResultMethods(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	output, err := golang.Generate(resultTypes(), "schema")
	if err != nil {
		t.Fatal(err)
	}

	writeFile(t, filepath.Join(dir, "schema", "schema.go"), output.Source)
	writeFile(t, filepath.Join(dir, "go.mod"), []byte("module harness\n\ngo 1.24\n"))
	writeFile(t, filepath.Join(dir, "main.go"), []byte(resultHarness))

	command := exec.CommandContext(t.Context(), "go", "run", ".")
	command.Dir = dir

	ran, err := command.CombinedOutput()
	if err != nil || len(ran) > 0 {
		t.Fatalf("%v\n%s\n%s", err, ran, output.Source)
	}
}
