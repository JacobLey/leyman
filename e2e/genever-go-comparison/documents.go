package comparison

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"path/filepath"
)

// DefaultDocumentsDir holds the documents every tool gets, written as JSON by the TypeScript comparison
// (`e2e/genever-comparison`), so both comparisons give their tools the same documents.
const DefaultDocumentsDir = "../genever-comparison/out"

// readDocument reads one of the shared documents.
func readDocument(dir, name string) ([]byte, error) {
	document, err := os.ReadFile(filepath.Join(dir, name)) //nolint:gosec // One of the shared documents
	if err != nil {
		return nil, fmt.Errorf("read the shared document: %w", err)
	}

	return document, nil
}

// keywordRef is a reference's keyword, which the large documents repeat.
const keywordRef = "$ref"

// File modes of what the comparison writes.
const (
	dirMode  = 0o750
	fileMode = 0o600
)

// thingSchema is a definition of the large documents: an object of a few properties, as in the TypeScript comparison.
const thingSchema = `{
	"type": "object",
	"properties": {
		"id": {"type": "string", "pattern": "^id_"},
		"count": {"type": "integer"},
		"status": {"enum": ["a", "b", "c"]},
		"tags": {"type": "array", "items": {"type": "string"}}
	},
	"required": ["id"],
	"additionalProperties": false
}`

// thing is a new copy of thingSchema, with extra properties.
func thing(extra map[string]any) map[string]any {
	var schema map[string]any

	// A JSON object, whose properties are one too
	_ = json.Unmarshal([]byte(thingSchema), &schema)
	properties, _ := schema["properties"].(map[string]any)
	maps.Copy(properties, extra)

	return schema
}

// encode writes a document built in Go as JSON, which never fails for maps of JSON values.
func encode(document map[string]any) []byte {
	encoded, _ := json.Marshal(document) //nolint:errchkjson // Only JSON values

	return encoded
}

// largeJSONSchema is a JSON Schema of many definitions, each used by a root property, to time generating from
// something the size of a real API's schemas. The same as the TypeScript comparison's.
func largeJSONSchema(count int) []byte {
	properties := map[string]any{}
	defs := map[string]any{"Shared": thing(nil)}

	for index := range count {
		name := fmt.Sprintf("Def%d", index)
		properties[name] = map[string]any{keywordRef: "#/$defs/" + name}
		defs[name] = thing(map[string]any{"shared": map[string]any{keywordRef: "#/$defs/Shared"}})
	}

	return encode(map[string]any{
		"$schema":              "https://json-schema.org/draft/2020-12/schema",
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": false,
		"$defs":                defs,
	})
}

// largeOpenAPIDocument is an OpenAPI document with one path per schema, as a large API would have. The same as the
// TypeScript comparison's.
func largeOpenAPIDocument(count int) []byte {
	paths := map[string]any{}
	schemas := map[string]any{}

	for index := range count {
		name := fmt.Sprintf("Thing%d", index)
		schemas[name] = thing(nil)
		paths["/"+name+"/{id}"] = map[string]any{"get": map[string]any{
			"operationId": "get" + name,
			"parameters": []any{
				map[string]any{"name": "id", "in": "path", "required": true, "schema": map[string]any{"type": "string"}},
			},
			"responses": map[string]any{"200": map[string]any{
				"description": "Found",
				"content": map[string]any{"application/json": map[string]any{
					"schema": map[string]any{keywordRef: "#/components/schemas/" + name},
				}},
			}},
		}}
	}

	return encode(map[string]any{
		"openapi":    "3.1.0",
		"info":       map[string]any{"title": "Large", "version": "1.0.0"},
		"paths":      paths,
		"components": map[string]any{"schemas": schemas},
	})
}
