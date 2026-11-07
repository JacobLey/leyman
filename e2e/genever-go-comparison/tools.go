package comparison

import (
	"bytes"

	genever "github.com/JacobLey/leyman/apps/genever/go"
	"github.com/atombender/go-jsonschema/pkg/generator"
	"github.com/atombender/go-jsonschema/pkg/schemas"
	"github.com/getkin/kin-openapi/openapi3"
	"github.com/oapi-codegen/oapi-codegen/v2/pkg/codegen"
)

// Generated is a tool's Go source for a document, in package main, and the name of the type the probes decode into.
type Generated struct {
	Source  []byte
	Subject string
}

// Generate turns a document into Go source. With an error, the source is ignored.
type Generate func(document []byte) (Generated, error)

// A Tool in the comparison.
type Tool struct {
	// Name shown in the report.
	Name string
	// Module is its Go module, for its version and link.
	Module string
	// JSONSchema generates from a JSON Schema, if it reads them.
	JSONSchema Generate
	// OpenAPI generates from an OpenAPI document, if it reads them.
	OpenAPI Generate
}

// generatedPackage is the package of every tool's source, which the harness is built in.
const generatedPackage = "main"

// geneverModule is genever-go's module, whose version is its own, since it is the workspace's copy.
const geneverModule = "github.com/JacobLey/leyman/apps/genever/go"

// GeneverTool is the tool the comparison is about.
//
//nolint:gochecknoglobals // Never changed
var GeneverTool = Tool{
	Name:   "genever-go",
	Module: geneverModule,
	JSONSchema: func(document []byte) (Generated, error) {
		return geneverGenerate(document, "Subject", "Subject")
	},
	OpenAPI: func(document []byte) (Generated, error) {
		return geneverGenerate(document, "", "Note")
	},
}

// geneverGenerate generates with genever-go.
func geneverGenerate(document []byte, name, subject string) (Generated, error) {
	source, err := genever.Generate(document, genever.Options{
		Name: name, Package: generatedPackage, BaseURI: "", OpenAPI30: false, NoStrict: false, ParameterDefaults: false,
	})
	// The report names the tool
	return Generated{Source: source, Subject: subject}, err //nolint:wrapcheck // See above
}

// AlternativeTools are the most used tools for generating Go types from JSON Schema or OpenAPI.
//
//nolint:gochecknoglobals // Never changed
var AlternativeTools = []Tool{
	{
		Name:       "go-jsonschema",
		Module:     "github.com/atombender/go-jsonschema",
		JSONSchema: goJSONSchema,
		OpenAPI:    nil,
	},
	{
		Name:       "oapi-codegen",
		Module:     "github.com/oapi-codegen/oapi-codegen/v2",
		JSONSchema: nil,
		OpenAPI:    oapiCodegen,
	},
}

// goJSONSchema generates with go-jsonschema. The root type is named after the schema's file name.
func goJSONSchema(document []byte) (Generated, error) {
	schema, err := schemas.FromJSONReader(bytes.NewReader(document))

	var sources map[string][]byte

	if err == nil {
		var gen *generator.Generator

		gen, err = generator.New(generator.Config{ //nolint:exhaustruct_v5 // The tool's defaults
			DefaultPackageName: generatedPackage,
			DefaultOutputName:  "generated.go",
			Tags:               []string{"json"},
			Warner:             func(string) {},
		})
		if err == nil {
			err = gen.AddFile("subject.json", schema)
		}

		if err == nil {
			sources, err = gen.Sources()
		}
	}

	// The report names the tool
	return Generated{Source: sources["generated.go"], Subject: "SubjectJson"}, err //nolint:wrapcheck // See above
}

// oapiCodegen generates oapi-codegen's models, the types of an OpenAPI document's schemas.
func oapiCodegen(document []byte) (Generated, error) {
	spec, err := openapi3.NewLoader().LoadFromData(document)

	var source string
	if err == nil {
		source, err = codegen.Generate(spec, codegen.Configuration{ //nolint:exhaustruct_v5 // The tool's defaults
			PackageName: generatedPackage,
			Generate:    codegen.GenerateOptions{Models: true}, //nolint:exhaustruct_v5 // Only the models
		})
	}

	// The report names the tool
	return Generated{Source: []byte(source), Subject: "Note"}, err //nolint:wrapcheck // See above
}
