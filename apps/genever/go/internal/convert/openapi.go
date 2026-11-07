package convert

import (
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
)

// methods are the methods of a path item, each of which may hold an operation.
//
//nolint:gochecknoglobals // Never changed
var methods = []string{"get", "put", "post", "delete", "options", "head", "patch", "trace"}

// DocumentDialect reports whether an input is an OpenAPI document rather than a schema, and the dialect of its
// schemas. A JSON Schema has no `openapi` keyword, so its presence marks a document. A document that is not OpenAPI
// 3.0 or 3.1 fails with ErrUnsupported.
func DocumentDialect(input jsonv.Value) (Dialect, bool, error) {
	document, isObject := input.(*jsonv.Object)
	if !isObject {
		return Draft202012, false, nil
	}

	version, isDocument := document.Get("openapi")
	if !isDocument {
		return Draft202012, false, nil
	}

	versionString, isString := version.(string)
	if !isString {
		versionString = jsonv.Stringify(version)
	}

	switch {
	case strings.HasPrefix(versionString, "3.0."):
		return OpenAPI30, true, nil
	case strings.HasPrefix(versionString, "3.1."):
		return OpenAPI31, true, nil
	default:
		return Draft202012, true, gerr.Unsupported(
			"Only OpenAPI 3.0 and 3.1 documents are supported, found "+quote(versionString), "#/openapi",
		)
	}
}

// members are the values of an object or array, with their JSON Pointers, or none for anything else.
func members(value jsonv.Value, pointer string) []target {
	switch collection := value.(type) {
	case *jsonv.Object:
		result := make([]target, 0, collection.Len())

		for _, key := range collection.Keys() {
			member, _ := collection.Get(key)
			result = append(result, target{schema: member, pointer: childPointer(pointer, key)})
		}

		return result
	case []jsonv.Value:
		result := make([]target, 0, len(collection))

		for i, member := range collection {
			result = append(result, target{schema: member, pointer: indexPointer(pointer, i)})
		}

		return result
	default:
		return nil
	}
}

// objectKind is what an OpenAPI object is, for the schemas it holds.
type objectKind int

const (
	// kindSchema is a schema, which is its own only schema.
	kindSchema objectKind = iota
	// kindObject is a parameter, header, request body or response.
	kindObject
	// kindPathItem is a path item, with its operations.
	kindPathItem
)

// documentSchemas lists the schemas of an OpenAPI document, in its components, and its operations if includePaths:
// component schemas first. A reference object has none of its own.
func documentSchemas(document jsonv.Value, includePaths bool) []target {
	root, _ := document.(*jsonv.Object)
	components, _ := root.Get("components")
	componentsObject, _ := components.(*jsonv.Object)

	component := func(name string) []target {
		var value jsonv.Value
		if componentsObject != nil {
			value, _ = componentsObject.Get(name)
		}

		return members(value, childPointer(childPointer("#", "components"), name))
	}

	var schemas []target

	for _, schema := range component("schemas") {
		schemas = collectSchemas(schema, kindSchema, schemas)
	}

	for _, name := range []string{"parameters", "headers", "requestBodies", "responses"} {
		for _, object := range component(name) {
			schemas = collectSchemas(object, kindObject, schemas)
		}
	}

	items := component("pathItems")

	if includePaths {
		paths, _ := root.Get("paths")
		items = append(items, members(paths, "#/paths")...)
	}

	for _, item := range items {
		schemas = collectSchemas(item, kindPathItem, schemas)
	}

	return schemas
}

// collectSchemas adds the schemas of an OpenAPI object to schemas.
//
// A parameter, header, request body or response has its `schema`, the `schema` of each `content` media type, and those
// of its `headers`. A path item has those of its parameters, and of each operation's parameters, request body and
// responses.
func collectSchemas(object target, kind objectKind, schemas []target) []target {
	if kind == kindSchema {
		return append(schemas, object)
	}

	value, isObject := object.schema.(*jsonv.Object)
	if !isObject {
		return schemas
	}

	if _, isReference := value.Get("$ref"); isReference {
		return schemas
	}

	child := func(key string) target {
		member, _ := value.Get(key)

		return target{schema: member, pointer: childPointer(object.pointer, key)}
	}

	if kind == kindPathItem {
		return collectPathItem(child, schemas)
	}

	if schema := child("schema"); schema.schema != nil {
		schemas = append(schemas, schema)
	}

	for _, media := range members(child("content").schema, child("content").pointer) {
		if mediaObject, ok := media.schema.(*jsonv.Object); ok {
			if schema, hasSchema := mediaObject.Get("schema"); hasSchema {
				schemas = append(schemas, target{schema: schema, pointer: childPointer(media.pointer, "schema")})
			}
		}
	}

	for _, header := range members(child("headers").schema, child("headers").pointer) {
		schemas = collectSchemas(header, kindObject, schemas)
	}

	return schemas
}

func collectPathItem(child func(string) target, schemas []target) []target {
	for _, parameter := range members(child("parameters").schema, child("parameters").pointer) {
		schemas = collectSchemas(parameter, kindObject, schemas)
	}

	for _, method := range methods {
		operation := child(method)

		operationObject, isObject := operation.schema.(*jsonv.Object)
		if !isObject {
			continue
		}

		field := func(key string) (jsonv.Value, string) {
			value, _ := operationObject.Get(key)

			return value, childPointer(operation.pointer, key)
		}

		parameters, parametersPointer := field("parameters")
		requestBody, requestBodyPointer := field("requestBody")
		responses, responsesPointer := field("responses")

		objects := append(members(parameters, parametersPointer), target{schema: requestBody, pointer: requestBodyPointer})
		objects = append(objects, members(responses, responsesPointer)...)

		for _, object := range objects {
			schemas = collectSchemas(object, kindObject, schemas)
		}
	}

	return schemas
}
