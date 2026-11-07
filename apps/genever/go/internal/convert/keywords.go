package convert

// A jsonType is a value of the JSON Schema `type` keyword.
type jsonType string

// JSON types.
const (
	typeArray   jsonType = "array"
	typeBoolean jsonType = "boolean"
	typeInteger jsonType = "integer"
	typeNull    jsonType = "null"
	typeNumber  jsonType = "number"
	typeObject  jsonType = "object"
	typeString  jsonType = "string"
)

// The keywords more than one table or step names.
const (
	keywordAdditionalItems  = "additionalItems"
	keywordOneOf            = "oneOf"
	keywordAnyOf            = "anyOf"
	keywordAllOf            = "allOf"
	keywordDependencies     = "dependencies"
	keywordDependentSchemas = "dependentSchemas"
	keywordElse             = "else"
	keywordExclusiveMaximum = "exclusiveMaximum"
	keywordExclusiveMinimum = "exclusiveMinimum"
	keywordItems            = "items"
	keywordMaxItems         = "maxItems"
	keywordMaximum          = "maximum"
	keywordMinItems         = "minItems"
	keywordMinimum          = "minimum"
	keywordPrefixItems      = "prefixItems"
	keywordThen             = "then"
)

// jsonTypes lists every JSON type, in the order errors name them.
//
//nolint:gochecknoglobals // Never changed
var jsonTypes = []jsonType{typeArray, typeBoolean, typeInteger, typeNull, typeNumber, typeObject, typeString}

// everyType is every JSON type a schema without `type` accepts. `integer` is left out, as `number` includes it.
//
//nolint:gochecknoglobals // Never changed
var everyType = []jsonType{typeArray, typeBoolean, typeNull, typeNumber, typeObject, typeString}

// typeKeywords are the keywords that only apply to values of one type, e.g. `maxLength` only constrains strings.
// `integer` shares the keywords of `number`.
//
//nolint:gochecknoglobals // Never changed
var typeKeywords = map[string]jsonType{
	"contentEncoding":       typeString,
	"contentMediaType":      typeString,
	"contentSchema":         typeString,
	"format":                typeString,
	"maxLength":             typeString,
	"minLength":             typeString,
	"pattern":               typeString,
	keywordExclusiveMaximum: typeNumber,
	keywordExclusiveMinimum: typeNumber,
	keywordMaximum:          typeNumber,
	keywordMinimum:          typeNumber,
	"multipleOf":            typeNumber,
	"additionalProperties":  typeObject,
	keywordDependencies:     typeObject,
	"dependentRequired":     typeObject,
	keywordDependentSchemas: typeObject,
	"maxProperties":         typeObject,
	"minProperties":         typeObject,
	"patternProperties":     typeObject,
	"properties":            typeObject,
	"propertyNames":         typeObject,
	"required":              typeObject,
	"unevaluatedProperties": typeObject,
	keywordAdditionalItems:  typeArray,
	"contains":              typeArray,
	keywordItems:            typeArray,
	"maxContains":           typeArray,
	keywordMaxItems:         typeArray,
	"minContains":           typeArray,
	keywordMinItems:         typeArray,
	keywordPrefixItems:      typeArray,
	"unevaluatedItems":      typeArray,
	"uniqueItems":           typeArray,
}

// genericKeywords are the keywords that apply to values of any type.
//
//nolint:gochecknoglobals // Never changed
var genericKeywords = setOf(
	"$anchor", "$comment", "$defs", "$dynamicAnchor", "$id", "$recursiveAnchor", "$ref", "$schema", "$vocabulary",
	"definitions", "default", "deprecated", "description", "examples", "readOnly", "title", "writeOnly", "const",
	"enum", "type", keywordAllOf, keywordAnyOf, keywordElse, "if", "not", keywordOneOf, keywordThen,
)

// unsupportedKeywords are keywords whose effect genever can't generate types for. They always fail, even outside
// strict mode, as ignoring them would loosen the type.
//
//nolint:gochecknoglobals // Never changed
var unsupportedKeywords = setOf("$dynamicRef", "$recursiveRef")

// openAPIKeywords are the keywords OpenAPI (3.0 and 3.1) adds to its schemas. None of them change the type.
//
//nolint:gochecknoglobals // Never changed
var openAPIKeywords = setOf("discriminator", "example", "externalDocs", "xml")

// openAPI30Keywords are the keywords only OpenAPI 3.0 has.
//
//nolint:gochecknoglobals // Never changed
var openAPI30Keywords = setOf("nullable")

func setOf(values ...string) map[string]bool {
	set := make(map[string]bool, len(values))
	for _, value := range values {
		set[value] = true
	}

	return set
}
