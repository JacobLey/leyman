package convert

import (
	"math"
	"slices"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// readObject reads a value that must be a JSON object.
func readObject(value jsonv.Value, pointer string) (*jsonv.Object, error) {
	object, ok := value.(*jsonv.Object)
	if !ok {
		return nil, gerr.Invalid("Must be an object", pointer)
	}

	return object, nil
}

// readSchemaArray reads a value that must be a non-empty array of schemas.
func readSchemaArray(value jsonv.Value, pointer string) ([]jsonv.Value, error) {
	array, ok := value.([]jsonv.Value)
	if !ok || len(array) == 0 {
		return nil, gerr.Invalid("Must be a non-empty array of schemas", pointer)
	}

	return array, nil
}

// readPropertyNames reads a value that must be an array of strings, such as `required`. Absent is empty.
func readPropertyNames(value jsonv.Value, isPresent bool, pointer string) ([]string, error) {
	if !isPresent {
		return nil, nil
	}

	array, ok := value.([]jsonv.Value)
	if !ok {
		return nil, gerr.Invalid("Must be an array of strings", pointer)
	}

	names := make([]string, len(array))

	for position, element := range array {
		name, isString := element.(string)
		if !isString {
			return nil, gerr.Invalid("Must be an array of strings", pointer)
		}

		names[position] = name
	}

	return names, nil
}

// readCount reads a keyword that must be a non-negative integer, such as `minLength`. Absent is -1.
func readCount(schema *jsonv.Object, keyword, pointer string) (float64, error) {
	value, ok := schema.Get(keyword)
	if !ok {
		return -1, nil
	}

	// Any size, not only safe integers: Juniper writes an unlimited count as `1e308`
	number, isNumber := value.(float64)
	if !isNumber || number < 0 || math.Mod(number, 1) != 0 {
		return 0, gerr.Invalid("Must be a non-negative integer", childPointer(pointer, keyword))
	}

	return number, nil
}

// A bound is the value of a number bound keyword: absent, a number, or (OpenAPI 3.0 and draft-04 exclusive bounds) a
// boolean.
type bound struct {
	value     float64
	isNumber  bool
	isBoolean bool
	boolean   bool
}

// readBound reads a number bound keyword, which may be a boolean when isBooleanAllowed.
func readBound(schema *jsonv.Object, keyword, pointer string, isBooleanAllowed bool) (bound, error) {
	value, ok := schema.Get(keyword)
	if !ok {
		return bound{value: 0, isNumber: false, isBoolean: false, boolean: false}, nil
	}

	if boolean, isBoolean := value.(bool); isBoolean && isBooleanAllowed {
		return bound{value: 0, isNumber: false, isBoolean: true, boolean: boolean}, nil
	}

	if number, isNumber := value.(float64); isNumber && !math.IsInf(number, 0) {
		return bound{value: number, isNumber: true, isBoolean: false, boolean: false}, nil
	}

	message := "Must be a number"
	if isBooleanAllowed {
		message = "Must be a number or boolean"
	}

	return bound{}, gerr.Invalid(message, childPointer(pointer, keyword)) //nolint:exhaustruct // Unused with an error
}

// readTypes reads the `type` keyword: one type, or an array of them. Absent is nil.
func readTypes(schema *jsonv.Object, pointer string) ([]jsonType, error) {
	value, ok := schema.Get("type")
	if !ok {
		return nil, nil
	}

	values, isArray := value.([]jsonv.Value)
	if !isArray {
		values = []jsonv.Value{value}
	}

	types := make([]jsonType, len(values))

	for position, element := range values {
		name, _ := element.(string)
		if !slices.Contains(jsonTypes, jsonType(name)) {
			types = nil

			break
		}

		types[position] = jsonType(name)
	}

	if len(types) == 0 {
		names := make([]string, len(jsonTypes))
		for i, name := range jsonTypes {
			names[i] = string(name)
		}

		return nil, gerr.Invalid(
			"type must be one of, or an array of, "+strings.Join(names, ", "), childPointer(pointer, "type"),
		)
	}

	return types, nil
}

// documentedKeywords are the keywords documented as tags, in the order they are written.
//
//nolint:gochecknoglobals // Never changed
var documentedKeywords = []string{
	"format", "minLength", "maxLength", "pattern", keywordMinimum, keywordExclusiveMinimum, keywordMaximum, keywordExclusiveMaximum,
	"multipleOf", keywordMinItems, keywordMaxItems, "uniqueItems", "minProperties", "maxProperties", "default",
}

// docText is a schema's text for documentation: empty unless it's a non-empty string.
func docText(schema *jsonv.Object, keyword string) string {
	value, _ := schema.Get(keyword)
	text, _ := value.(string)

	return text
}

// exampleTags are the tags of a schema's `examples`, then of OpenAPI's single `example`.
func exampleTags(schema *jsonv.Object) []model.Tag {
	var examples []jsonv.Value

	if value, ok := schema.Get("examples"); ok {
		examples, _ = value.([]jsonv.Value)
	}

	if example, ok := schema.Get("example"); ok {
		examples = append(slices.Clip(examples), example)
	}

	tags := make([]model.Tag, len(examples))
	for position, example := range examples {
		tags[position] = model.Tag{Name: "example", Text: jsonv.Stringify(example)}
	}

	return tags
}

// readDoc reads the documentation of a schema: its title, description, deprecation, and documented keywords. Nil if
// it has none.
func readDoc(value jsonv.Value) *model.Doc {
	schema, ok := value.(*jsonv.Object)
	if !ok {
		return nil
	}

	tags := []model.Tag{}

	for _, keyword := range documentedKeywords {
		if keywordValue, ok := schema.Get(keyword); ok {
			tags = append(tags, model.Tag{Name: keyword, Text: jsonv.Stringify(keywordValue)})
		}
	}

	tags = append(tags, exampleTags(schema)...)

	deprecated, _ := schema.Get("deprecated")
	doc := &model.Doc{
		Tags:        tags,
		Deprecated:  deprecated == true,
		Description: docText(schema, "description"),
		Title:       docText(schema, "title"),
	}

	if doc.Deprecated || doc.Description != "" || doc.Title != "" || len(tags) > 0 {
		return doc
	}

	return nil
}

// jsonLiteral is the type of exactly one JSON value, as `enum` and `const` allow.
func jsonLiteral(value jsonv.Value) *model.Type {
	switch value := value.(type) {
	case nil:
		return model.NullType
	case []jsonv.Value:
		elements := make([]model.Element, len(value))
		for i, element := range value {
			elements[i] = model.Element{Optional: false, Type: jsonLiteral(element)}
		}

		return model.Tuple(elements, nil)
	case *jsonv.Object:
		properties := make([]model.Property, value.Len())

		for i, name := range value.Keys() {
			property, _ := value.Get(name)
			properties[i] = model.Property{
				Doc: nil, Name: name, Optional: false, Pointer: "", Type: jsonLiteral(property),
			}
		}

		return model.Object(properties, nil)
	default:
		return model.Literal(value)
	}
}
