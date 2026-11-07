package convert

import (
	"slices"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// parameterLocations are where a parameter may be, in the order the TypeScript genever reads them.
//
//nolint:gochecknoglobals // Never changed
var parameterLocations = []string{"query", "header", locationPath, "cookie"}

// inputLocations are the locations of parameters, in the order an operation's input has them.
//
//nolint:gochecknoglobals // Never changed
var inputLocations = []string{locationPath, "query", "header", "cookie"}

// locationPath is the location of path parameters, which are always required.
const locationPath = "path"

// jsonMediaType is the media type whose content an operation's input and responses have types for.
const jsonMediaType = "application/json"

// A parameter of an operation or path item.
type parameter struct {
	doc      *model.Doc
	typ      *model.Type
	name     string
	location string
	required bool
}

// located is an OpenAPI object, and the JSON Pointer to it.
type located struct {
	value   *jsonv.Object
	pointer string
}

// A body is the content of a request body or response: its JSON content's type, if it has JSON content.
type body struct {
	doc *model.Doc
	// json is the type of the `application/json` content, or nil without it.
	json    *model.Type
	pointer string
}

// An operation with an `operationId`, as its types need it.
type operation struct {
	doc *model.Doc
	// requestBody is nil without one.
	requestBody *body
	id          string
	pointer     string
	// parameters are the path item's and the operation's, each once: a later one replaces an earlier one of the same
	// name and location, where the earlier one was.
	parameters []parameter
	responses  []response
	// isBodyRequired is the request body's `required`.
	isBodyRequired bool
}

// A response of an operation, by status.
type response struct {
	body

	status string
}

// operationDoc is the documentation of an operation, parameter, header, request body or response: its `summary`,
// `description` and `deprecated`. Nil if it has none.
func operationDoc(value *jsonv.Object) *model.Doc {
	deprecated, _ := value.Get("deprecated")
	doc := &model.Doc{
		Tags:        nil,
		Deprecated:  deprecated == true,
		Description: docText(value, "description"),
		Title:       docText(value, "summary"),
	}

	if doc.Deprecated || doc.Description != "" || doc.Title != "" {
		return doc
	}

	return nil
}

// uniqueParameters are parameters with each name and location once: a later one replaces an earlier one, where the
// earlier one was.
func uniqueParameters(parameters []parameter) []parameter {
	unique := make([]parameter, 0, len(parameters))

	for _, item := range parameters {
		index := slices.IndexFunc(unique, func(existing parameter) bool {
			return existing.name == item.name && existing.location == item.location
		})
		if index >= 0 {
			unique[index] = item
		} else {
			unique = append(unique, item)
		}
	}

	return unique
}

// An operationBuilder finds the operations of a document's `paths`, converting every schema they use, as the
// TypeScript genever does to build its `Paths` and `Operations` types, so both fail on the same schemas.
type operationBuilder struct {
	conv       *converter
	ids        map[string]bool
	operations []operation
}

// build finds the operations of `paths`, in order, and fails if it, or anything in it, is invalid.
func (b *operationBuilder) build(paths jsonv.Value) error {
	pathsObject, err := readObject(paths, "#/paths")
	if err != nil {
		return err
	}

	for _, path := range pathsObject.Keys() {
		raw, _ := pathsObject.Get(path)

		item, err := b.deref(raw, childPointer("#/paths", path))
		if err != nil {
			return err
		}

		if err := b.pathItem(item); err != nil {
			return err
		}
	}

	return nil
}

// deref is an OpenAPI object, or the object its `$ref` refers to, through any number of reference objects (e.g.
// `paths.yaml#/pets`, which refers to `pets.yaml`). It fails if it is not an object, or its references only refer to
// each other.
func (b *operationBuilder) deref(value jsonv.Value, pointer string) (located, error) {
	object, err := readObject(value, pointer)
	if err != nil {
		return located{value: nil, pointer: ""}, err
	}

	current := located{value: object, pointer: pointer}
	seen := map[string]bool{}

	for ref, isReference := current.value.Get("$ref"); isReference; ref, isReference = current.value.Get("$ref") {
		if seen[current.pointer] {
			return current, gerr.Invalid("$ref only refers to itself", childPointer(pointer, "$ref"))
		}

		seen[current.pointer] = true

		found, err := b.conv.resolve(ref, childPointer(current.pointer, "$ref"))
		if err != nil {
			return current, err
		}

		object, err := readObject(found.schema, found.pointer)
		if err != nil {
			return current, err
		}

		current = located{value: object, pointer: found.pointer}
	}

	return current, nil
}

// media is the type of a media type object: its schema's, or unknown without one.
func (b *operationBuilder) media(media jsonv.Value, pointer string) (*model.Type, error) {
	object, err := readObject(media, pointer)
	if err != nil {
		return nil, err
	}

	schema, hasSchema := object.Get("schema")
	if !hasSchema {
		return model.UnknownType, nil
	}

	return b.conv.convert(schema, childPointer(pointer, "schema"), emptyScope())
}

// content converts the `content` of a request body or response, and returns its JSON content's type, or nil without
// JSON content.
func (b *operationBuilder) content(object located) (*model.Type, error) {
	content, hasContent := object.value.Get("content")
	if !hasContent {
		return nil, nil //nolint:nilnil // No content is no type, and no error
	}

	contentPointer := childPointer(object.pointer, "content")

	contentObject, err := readObject(content, contentPointer)
	if err != nil {
		return nil, err
	}

	var jsonType *model.Type

	for _, mediaType := range contentObject.Keys() {
		entry, _ := contentObject.Get(mediaType)

		converted, err := b.media(entry, childPointer(contentPointer, mediaType))
		if err != nil {
			return nil, err
		}

		if mediaType == jsonMediaType {
			jsonType = converted
		}
	}

	return jsonType, nil
}

// checkDefault follows a parameter's schema's `$ref`s to one with a `default`, as the TypeScript genever does to find
// the parameters a validator fills in, so a broken reference fails there, as it does in TypeScript.
func (b *operationBuilder) checkDefault(object located) error {
	schema, _ := object.value.Get("schema")
	schemaPointer := childPointer(object.pointer, "schema")
	seen := map[string]bool{}

	for schemaObject, isObject := schema.(*jsonv.Object); isObject && !seen[schemaPointer]; schemaObject, isObject = schema.(*jsonv.Object) {
		seen[schemaPointer] = true

		if _, hasDefault := schemaObject.Get("default"); hasDefault {
			return nil
		}

		ref, isReference := schemaObject.Get("$ref")
		if !isReference {
			return nil
		}

		found, err := b.conv.resolve(ref, childPointer(schemaPointer, "$ref"))
		if err != nil {
			return err
		}

		schema, schemaPointer = found.schema, found.pointer
	}

	return nil
}

// valueType is the type of a parameter or header: its `schema`'s, or that of its first `content` entry, or unknown
// without either.
func (b *operationBuilder) valueType(object located) (*model.Type, error) {
	if schema, hasSchema := object.value.Get("schema"); hasSchema {
		return b.conv.convert(schema, childPointer(object.pointer, "schema"), emptyScope())
	}

	content, hasContent := object.value.Get("content")
	if !hasContent {
		return model.UnknownType, nil
	}

	contentPointer := childPointer(object.pointer, "content")

	contentObject, err := readObject(content, contentPointer)
	if err != nil {
		return nil, err
	}

	keys := contentObject.Keys()
	if len(keys) == 0 {
		return model.UnknownType, nil
	}

	entry, _ := contentObject.Get(keys[0])

	return b.media(entry, childPointer(contentPointer, keys[0]))
}

// parameters are the parameters of a path item or operation, in order. It fails if `parameters` is not an array, or a
// parameter has no name or location.
func (b *operationBuilder) parameters(object located) ([]parameter, error) {
	raw, hasParameters := object.value.Get("parameters")
	if !hasParameters {
		return nil, nil
	}

	parametersPointer := childPointer(object.pointer, "parameters")

	array, isArray := raw.([]jsonv.Value)
	if !isArray {
		return nil, gerr.Invalid("parameters must be an array", parametersPointer)
	}

	parameters := make([]parameter, 0, len(array))

	for i, item := range array {
		found, err := b.deref(item, indexPointer(parametersPointer, i))
		if err != nil {
			return nil, err
		}

		read, err := b.parameter(found)
		if err != nil {
			return nil, err
		}

		parameters = append(parameters, read)
	}

	return parameters, nil
}

// parameter reads a parameter object.
func (b *operationBuilder) parameter(found located) (parameter, error) {
	name, _ := found.value.Get("name")
	location, _ := found.value.Get("in")
	nameString, isString := name.(string)
	locationString, _ := location.(string)

	if !isString || !slices.Contains(parameterLocations, locationString) {
		return parameter{}, gerr.Invalid(
			"A parameter needs a name, and \"in\" one of "+strings.Join(parameterLocations, ", "), found.pointer,
		)
	}

	if err := b.checkDefault(found); err != nil {
		return parameter{}, err
	}

	typ, err := b.valueType(found)
	if err != nil {
		return parameter{}, err
	}

	required, _ := found.value.Get("required")

	return parameter{
		doc:      operationDoc(found.value),
		typ:      typ,
		name:     nameString,
		location: locationString,
		// Path parameters are always required
		required: locationString == locationPath || required == true,
	}, nil
}

// requestBody reads the request body of an operation, or nil without one, and whether it is required.
func (b *operationBuilder) requestBody(object located) (*body, bool, error) {
	raw, hasBody := object.value.Get("requestBody")
	if !hasBody {
		return nil, false, nil
	}

	found, err := b.deref(raw, childPointer(object.pointer, "requestBody"))
	if err != nil {
		return nil, false, err
	}

	jsonType, err := b.content(found)
	if err != nil {
		return nil, false, err
	}

	required, _ := found.value.Get("required")

	return &body{doc: operationDoc(found.value), json: jsonType, pointer: found.pointer}, required == true, nil
}

// headers converts the headers of a response.
func (b *operationBuilder) headers(found located) error {
	headers, hasHeaders := found.value.Get("headers")
	if !hasHeaders {
		return nil
	}

	headersPointer := childPointer(found.pointer, "headers")

	headersObject, err := readObject(headers, headersPointer)
	if err != nil {
		return err
	}

	for _, name := range headersObject.Keys() {
		raw, _ := headersObject.Get(name)

		header, err := b.deref(raw, childPointer(headersPointer, name))
		if err != nil {
			return err
		}

		if _, err := b.valueType(header); err != nil {
			return err
		}
	}

	return nil
}

// responses reads the responses of an operation, by status, in order.
func (b *operationBuilder) responses(object located) ([]response, error) {
	raw, hasResponses := object.value.Get("responses")
	if !hasResponses {
		return nil, nil
	}

	responsesPointer := childPointer(object.pointer, "responses")

	responsesObject, err := readObject(raw, responsesPointer)
	if err != nil {
		return nil, err
	}

	responses := make([]response, 0, responsesObject.Len())

	for _, status := range responsesObject.Keys() {
		item, _ := responsesObject.Get(status)

		found, err := b.deref(item, childPointer(responsesPointer, status))
		if err != nil {
			return nil, err
		}

		if err := b.headers(found); err != nil {
			return nil, err
		}

		jsonType, err := b.content(found)
		if err != nil {
			return nil, err
		}

		responses = append(responses, response{
			body:   body{doc: operationDoc(found.value), json: jsonType, pointer: found.pointer},
			status: status,
		})
	}

	return responses, nil
}

// method reads the operation of a path item's method, if it has one, and keeps it if it has an `operationId`. It fails
// if the `operationId` is already used.
func (b *operationBuilder) method(method string, item located, pathParameters []parameter) error {
	raw, hasMethod := item.value.Get(method)
	if !hasMethod {
		return nil
	}

	pointer := childPointer(item.pointer, method)

	object, err := readObject(raw, pointer)
	if err != nil {
		return err
	}

	found := located{value: object, pointer: pointer}

	own, err := b.parameters(found)
	if err != nil {
		return err
	}

	// Responses before the request body, in the order the TypeScript genever converts them
	responses, err := b.responses(found)
	if err != nil {
		return err
	}

	requestBody, isBodyRequired, err := b.requestBody(found)
	if err != nil {
		return err
	}

	id, hasID := object.Get("operationId")

	idString, isString := id.(string)
	if !hasID || !isString {
		return nil
	}

	if b.ids[idString] {
		return gerr.Invalid("operationId "+quote(idString)+" is used by more than one operation",
			childPointer(pointer, "operationId"))
	}

	b.ids[idString] = true
	b.operations = append(b.operations, operation{
		doc:            operationDoc(object),
		requestBody:    requestBody,
		id:             idString,
		pointer:        pointer,
		parameters:     uniqueParameters(append(slices.Clip(pathParameters), own...)),
		responses:      responses,
		isBodyRequired: isBodyRequired,
	})

	return nil
}

// pathItem reads the operations of a path item.
func (b *operationBuilder) pathItem(item located) error {
	pathParameters, err := b.parameters(item)
	if err != nil {
		return err
	}

	for _, method := range methods {
		if err := b.method(method, item, pathParameters); err != nil {
			return err
		}
	}

	return nil
}

// operations finds the operations with an `operationId` in a document's `paths`, converting every schema the paths
// use. None without `paths`.
func (c *converter) operations(document jsonv.Value) ([]operation, error) {
	// An OpenAPI document is always an object
	paths, hasPaths := document.(*jsonv.Object).Get("paths") //nolint:forcetypeassert // A document's an object
	if !hasPaths {
		return nil, nil
	}

	builder := &operationBuilder{conv: c, ids: map[string]bool{}, operations: nil}
	if err := builder.build(paths); err != nil {
		return nil, err
	}

	return builder.operations, nil
}

// operationTypes are the named types of operations: for each, what a call to it sends (`<Id>Input`), and the JSON
// body of each of its responses with one (`<Id>Response<Status>`).
//
// They are what the TypeScript genever's `OperationInput` and `OperationResult` give for an operation, as Go can't key
// a type by an `operationId`.
func operationTypes(names *typeNames, operations []operation) []NamedType {
	var types []NamedType

	for _, item := range operations {
		inputName := names.reserve(item.id + " Input")
		types = append(types, NamedType{
			Doc:     operationTypeDoc(inputName+" is what a call to operation "+quote(item.id)+" sends.", item.doc),
			Type:    inputType(item),
			Name:    inputName,
			Pointer: item.pointer,
		})

		for _, each := range item.responses {
			if each.json == nil {
				continue
			}

			name := names.reserve(item.id + " Response " + each.status)
			types = append(types, NamedType{
				Doc: operationTypeDoc(
					name+" is the JSON body of operation "+quote(item.id)+"'s "+each.status+" response.", each.doc,
				),
				Type:    each.json,
				Name:    name,
				Pointer: each.pointer,
			})
		}
	}

	return types
}

// operationTypeDoc is the documentation of an operation's type: what it is, then the operation's or response's own.
func operationTypeDoc(title string, own *model.Doc) *model.Doc {
	doc := &model.Doc{Tags: nil, Deprecated: false, Description: "", Title: title}

	if own != nil {
		doc.Deprecated = own.Deprecated
		doc.Description = strings.Join(slices.DeleteFunc([]string{own.Title, own.Description}, func(text string) bool {
			return text == ""
		}), "\n\n")
	}

	return doc
}

// inputType is what a call to an operation sends: its JSON `body`, and its parameters by location, each only if it has
// them. A body or location is optional if the request body, or every parameter there, is.
func inputType(item operation) *model.Type {
	var properties []model.Property

	if item.requestBody != nil && item.requestBody.json != nil {
		properties = append(properties, model.Property{
			Doc:      item.requestBody.doc,
			Type:     item.requestBody.json,
			Name:     "body",
			Pointer:  "",
			Optional: !item.isBodyRequired,
		})
	}

	for _, location := range inputLocations {
		var (
			located    []model.Property
			isOptional = true
		)

		for _, each := range item.parameters {
			if each.location != location {
				continue
			}

			located = append(located, model.Property{
				Doc: each.doc, Type: each.typ, Name: each.name, Pointer: "", Optional: !each.required,
			})
			isOptional = isOptional && !each.required
		}

		if located != nil {
			properties = append(properties, model.Property{
				Doc: nil, Type: model.Object(located, nil), Name: location, Pointer: "", Optional: isOptional,
			})
		}
	}

	return model.Object(properties, nil)
}
