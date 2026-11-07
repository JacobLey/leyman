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

// An objectReference is a reference object: an OpenAPI object that is only a `$ref` to one elsewhere.
type objectReference struct {
	ref jsonv.Value
	// pointer is the JSON Pointer to the reference object.
	pointer string
	// kind is what it refers to: a path item, or another object with schemas.
	kind objectKind
}

// openAPIParts are the schemas of OpenAPI objects, and the reference objects among them, which have none of their own.
type openAPIParts struct {
	schemas    []target
	references []objectReference
}

// documentParts lists the schemas of an OpenAPI document, in its components, and its operations if includePaths, and
// the reference objects in it: component schemas first.
func documentParts(document jsonv.Value, includePaths bool) openAPIParts {
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

	parts := &openAPIParts{schemas: nil, references: nil}

	for _, schema := range component("schemas") {
		parts.collect(schema, kindSchema)
	}

	for _, name := range []string{"parameters", "headers", "requestBodies", "responses"} {
		for _, object := range component(name) {
			parts.collect(object, kindObject)
		}
	}

	items := component("pathItems")

	if includePaths {
		paths, _ := root.Get("paths")
		items = append(items, members(paths, "#/paths")...)
	}

	for _, item := range items {
		parts.collect(item, kindPathItem)
	}

	return *parts
}

// objectParts lists the schemas of an OpenAPI object, and the reference objects in it. A schema is its own only schema.
func objectParts(object target, kind objectKind) openAPIParts {
	parts := &openAPIParts{schemas: nil, references: nil}
	parts.collect(object, kind)

	return *parts
}

// collect adds the schemas of an OpenAPI object, or the object itself if it is a schema, and its reference objects.
//
// A parameter, header, request body or response has its `schema`, the `schema` of each `content` media type, and those
// of its `headers`. A path item has those of its parameters, and of each operation's parameters, request body and
// responses.
func (p *openAPIParts) collect(object target, kind objectKind) {
	if kind == kindSchema {
		if object.schema != nil {
			p.schemas = append(p.schemas, object)
		}

		return
	}

	value, isObject := object.schema.(*jsonv.Object)
	if !isObject {
		return
	}

	if ref, isReference := value.Get("$ref"); isReference {
		p.references = append(p.references, objectReference{ref: ref, pointer: object.pointer, kind: kind})

		return
	}

	child := func(key string) target {
		member, _ := value.Get(key)

		return target{schema: member, pointer: childPointer(object.pointer, key)}
	}

	if kind == kindPathItem {
		p.collectPathItem(child)

		return
	}

	p.collect(child("schema"), kindSchema)

	for _, media := range members(child("content").schema, child("content").pointer) {
		if mediaObject, ok := media.schema.(*jsonv.Object); ok {
			schema, _ := mediaObject.Get("schema")
			p.collect(target{schema: schema, pointer: childPointer(media.pointer, "schema")}, kindSchema)
		}
	}

	for _, header := range members(child("headers").schema, child("headers").pointer) {
		p.collect(header, kindObject)
	}
}

func (p *openAPIParts) collectPathItem(child func(string) target) {
	for _, parameter := range members(child("parameters").schema, child("parameters").pointer) {
		p.collect(parameter, kindObject)
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
			p.collect(object, kindObject)
		}
	}
}
