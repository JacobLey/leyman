package convert

import (
	"cmp"
	"maps"
	"slices"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// A scope is the context a subschema inherits from the schema it is applied with, e.g. the members of `allOf`.
type scope struct {
	// properties are the types of the properties declared by this schema and its parents, for keywords that name a
	// property without declaring it, e.g. `required` in a `then`.
	properties map[string]*model.Type
	// types are the types of the parent schema, or nil for any. Type specific keywords without a `type` of their own
	// apply to these.
	types []jsonType
	// unguarded are the canonical JSON Pointers of the referenced schemas this one is part of, without a property or
	// item in between, so it applies to the same value: the named type being converted, and any schema inlined into
	// it. A `$ref` back to one of them never matches anything a terminating validator could accept.
	unguarded []string
}

// emptyScope is the scope of a schema applied to a property or item, which inherits nothing.
func emptyScope() scope {
	return scope{properties: map[string]*model.Type{}, types: nil, unguarded: nil}
}

// pendingType is a schema to generate as a named type.
type pendingType struct {
	schema  jsonv.Value
	name    string
	pointer string
}

// A converter converts one document.
type converter struct {
	root    jsonv.Value
	names   *typeNames
	named   map[string]string
	pending []pendingType
	// sameValueCache holds the result of sameValueReferences, by the referenced schema's pointer.
	sameValueCache map[string]map[string]bool
	index          documentIndex
	options        Options
}

// Convert converts a JSON Schema document. The root schema, every definition (`$defs`/`definitions`) at the root of
// the document, and any other schema targeted by a `$ref`, becomes a named type, and everything else is inlined. It
// returns the root (named rootName) first, then the rest sorted by name, by byte. The error is a *gerr.Error.
func Convert(root jsonv.Value, rootName string, options Options) ([]NamedType, error) {
	index, err := indexFiles(root, []target{{schema: root, pointer: "#"}}, options.Files, options.BaseURI, false)
	if err != nil {
		return nil, err
	}

	conv := &converter{
		root:           root,
		names:          newTypeNames(),
		named:          map[string]string{},
		pending:        nil,
		sameValueCache: map[string]map[string]bool{},
		index:          index,
		options:        options,
	}
	conv.register("#", rootName, root)

	for _, container := range []string{keywordDefs, "definitions"} {
		if err := conv.registerContainer(container); err != nil {
			return nil, err
		}
	}

	types, err := conv.convertPending()
	if err != nil {
		return nil, err
	}

	slices.SortFunc(types[1:], func(a, b NamedType) int {
		return cmp.Compare(a.Name, b.Name)
	})

	return types, nil
}

// Document converts an OpenAPI document. Each of its `components.schemas`, and any other schema targeted by a
// `$ref`, becomes a named type, sorted by name, by byte. Then each operation with an `operationId` has a type for what
// a call to it sends, and one for each JSON response body, in the order of `paths`. The error is a *gerr.Error.
func Document(document jsonv.Value, options Options) ([]NamedType, error) {
	conv := &converter{
		root:           document,
		names:          newTypeNames(),
		named:          map[string]string{},
		pending:        nil,
		sameValueCache: map[string]map[string]bool{},
		index:          documentIndex{}, //nolint:exhaustruct_v5 // Set once the components are found valid
		options:        options,
	}

	components, err := conv.child(document, "#", "components")
	if err != nil {
		return nil, err
	}

	if components != nil {
		if err := conv.registerSchemas(components, "#/components", "schemas"); err != nil {
			return nil, err
		}
	}

	// A document is not a schema, but each of its components is
	conv.index, err = indexFiles(document, documentSchemas(document, true), options.Files, options.BaseURI, false)
	if err != nil {
		return nil, err
	}

	// Operations before the pending schemas, in the order the TypeScript genever converts them
	operations, err := conv.operations(document)
	if err != nil {
		return nil, err
	}

	types, err := conv.convertPending()
	if err != nil {
		return nil, err
	}

	slices.SortFunc(types, func(a, b NamedType) int {
		return cmp.Compare(a.Name, b.Name)
	})

	return append(types, operationTypes(conv.names, operations)...), nil
}

// dialectOf is the dialect of the schema at a JSON Pointer: the document's, or that of the file it is in.
func (c *converter) dialectOf(pointer string) Dialect {
	if strings.HasPrefix(pointer, "#") {
		return c.options.Dialect
	}

	uri, _, _ := strings.Cut(pointer, "#")

	return c.options.Files[uri].dialect
}

// child reads a key of an object that, if present, must be an object, and returns it, or nil if absent.
func (c *converter) child(parent jsonv.Value, pointer, key string) (*jsonv.Object, error) {
	value, isPresent := parent.(*jsonv.Object).Get(key) //nolint:forcetypeassert // Only called on objects
	if !isPresent {
		return nil, nil //nolint:nilnil // Absent
	}

	return readObject(value, childPointer(pointer, key))
}

// convertPending converts every named schema, including those found while converting.
func (c *converter) convertPending() ([]NamedType, error) {
	var types []NamedType

	// Converting may register more schemas, so the loop runs until none is left
	for len(types) < len(c.pending) {
		pending := c.pending[len(types)]
		named := scope{properties: map[string]*model.Type{}, types: nil, unguarded: []string{pending.pointer}}

		converted, err := c.convert(pending.schema, pending.pointer, named)
		if err != nil {
			return nil, err
		}

		types = append(types, NamedType{
			Doc: readDoc(pending.schema), Name: pending.name, Pointer: pending.pointer, Type: converted,
		})
	}

	return types, nil
}

// groupKeywords are the keywords of a schema that only groups definitions, such as a bundled file of shared `$defs`.
//
//nolint:gochecknoglobals // Never changed
var groupKeywords = setOf("$comment", "$defs", "$id", "$schema", "definitions", "description", "title")

// isDefinitionGroup reports whether a schema only groups other definitions, and so is not a type of its own. Its
// definitions are still types when referenced, and it is too if referenced itself.
func isDefinitionGroup(value jsonv.Value) bool {
	schema, ok := value.(*jsonv.Object)
	if !ok {
		return false
	}

	_, hasDefs := schema.Get("$defs")
	_, hasDefinitions := schema.Get("definitions")

	return (hasDefs || hasDefinitions) && !slices.ContainsFunc(schema.Keys(), func(keyword string) bool {
		return !groupKeywords[keyword]
	})
}

// resourceAlias returns the `$ref` of a schema that only gives another URI to a resource, with an `$id` and a `$ref`
// (e.g. a file whose own `$id` is not where it was loaded from). References see through it, so it is not a type of
// its own.
func resourceAlias(value jsonv.Value) (string, bool) {
	schema, ok := value.(*jsonv.Object)
	if !ok || schema.Len() != 2 {
		return "", false
	}

	id, _ := schema.Get("$id")
	ref, _ := schema.Get("$ref")
	_, isID := id.(string)
	refString, isRef := ref.(string)

	return refString, isID && isRef
}

// registerContainer names every schema of a container at the root of the document, such as `$defs`, so each is
// generated even if it is not referenced.
func (c *converter) registerContainer(key string) error {
	root, isObject := c.root.(*jsonv.Object)
	if !isObject {
		return nil
	}

	return c.registerSchemas(root, "#", key)
}

// registerSchemas names every schema of a container, a key of parent, if present.
func (c *converter) registerSchemas(parent *jsonv.Object, parentPointer, key string) error {
	container, err := c.child(parent, parentPointer, key)
	if err != nil || container == nil {
		return err
	}

	pointer := childPointer(parentPointer, key)

	for _, name := range container.Keys() {
		schema, _ := container.Get(name)
		if _, isAlias := resourceAlias(schema); !isDefinitionGroup(schema) && !isAlias {
			c.register(childPointer(pointer, name), name, schema)
		}
	}

	return nil
}

// register names a schema, not yet named, to generate as a named type, and returns its name.
func (c *converter) register(pointer, name string, schema jsonv.Value) string {
	reserved := c.names.reserve(name)
	c.named[pointer] = reserved
	c.pending = append(c.pending, pendingType{name: reserved, pointer: pointer, schema: schema})

	return reserved
}

// strictError returns a strict mode error, or nil outside strict mode.
func (c *converter) strictError(message, pointer string) error {
	if c.options.Strict {
		return gerr.Strict(message, pointer)
	}

	return nil
}

// contradiction is the type of a schema no value can match, because it contradicts itself. It fails in strict mode.
func (c *converter) contradiction(message, pointer string) (*model.Type, error) {
	if err := c.strictError(message+", so no value is valid", pointer); err != nil {
		return nil, err
	}

	return model.NeverType, nil
}

// referenceName is the name of the type of a referenced schema: a definition (in any `$defs` or `definitions`) is
// named after its key, and anything else after its whole path.
func referenceName(pointer string) string {
	parent := pointer[:strings.LastIndex(pointer, "/")]
	isDefinition := strings.HasSuffix(parent, "/$defs") || strings.HasSuffix(parent, "/definitions") ||
		strings.HasSuffix(parent, "#/components/schemas")

	start := strings.Index(pointer, "#") + len("#/")
	if isDefinition {
		start = len(parent) + 1
	}

	segments := strings.Split(pointer[start:], "/")
	for i, segment := range segments {
		segments[i] = unescapeSegment(segment)
	}

	return strings.Join(segments, " ")
}

// convert converts a schema at a JSON Pointer, in a scope.
func (c *converter) convert(value jsonv.Value, pointer string, inherited scope) (*model.Type, error) {
	switch value {
	case true:
		return model.UnknownType, nil
	case false:
		return model.NeverType, nil
	}

	schema, err := readObject(value, pointer)
	if err != nil {
		return nil, err
	}

	types, err := c.check(schema, pointer, inherited)
	if err != nil {
		return nil, err
	}

	own, err := c.propertyTypes(schema, pointer)
	if err != nil {
		return nil, err
	}

	properties := make(map[string]*model.Type, len(inherited.properties)+len(own))
	maps.Copy(properties, inherited.properties)
	maps.Copy(properties, own)

	sub := scope{properties: properties, types: types, unguarded: inherited.unguarded}

	converted, err := c.combine(schema, pointer, types, sub, inherited)
	if err != nil {
		return nil, err
	}

	if notValue, ok := schema.Get("not"); ok {
		converted, err = c.not(converted, notValue, childPointer(pointer, "not"), sub)
		if err != nil {
			return nil, err
		}
	}

	return c.nullable(schema, pointer, converted)
}

// check checks a schema's keywords, values and discriminator, and returns its types, or nil for any.
func (c *converter) check(schema *jsonv.Object, pointer string, inherited scope) ([]jsonType, error) {
	types, err := c.types(schema, pointer, inherited)
	if err != nil {
		return nil, err
	}

	if err := c.checkValues(schema, pointer, types); err != nil {
		return nil, err
	}

	if discriminator, ok := schema.Get("discriminator"); ok {
		if err := c.checkDiscriminator(schema, discriminator, pointer); err != nil {
			return nil, err
		}
	}

	return types, nil
}

// combine intersects the parts of a schema's type: its own type keywords, values, compositions and reference.
func (c *converter) combine(
	schema *jsonv.Object, pointer string, types []jsonType, sub, inherited scope,
) (*model.Type, error) {
	// Without type specific keywords, a subschema adds nothing to the types it inherits
	_, hasType := schema.Get("type")
	isTyped := hasType || slices.ContainsFunc(schema.Keys(), func(keyword string) bool {
		_, ok := typeKeywords[keyword]

		return ok
	})

	parts := []*model.Type{model.UnknownType}

	if isTyped && types != nil {
		members := make([]*model.Type, len(types))

		for position, valueType := range types {
			typed, err := c.typed(schema, pointer, valueType, sub)
			if err != nil {
				return nil, err
			}

			members[position] = typed
		}

		parts[0] = model.Union(members...)
	}

	values, err := valueTypes(schema, pointer)
	if err != nil {
		return nil, err
	}

	compositions, err := c.compositions(schema, pointer, sub)
	if err != nil {
		return nil, err
	}

	parts = append(parts, values...)
	parts = append(parts, compositions...)

	if ref, ok := schema.Get("$ref"); ok {
		referenced, err := c.reference(ref, childPointer(pointer, "$ref"), inherited)
		if err != nil {
			return nil, err
		}

		parts = append(parts, referenced)
	}

	return model.Intersection(parts...), nil
}

// valueTypes are the types of `enum` and `const`.
func valueTypes(schema *jsonv.Object, pointer string) ([]*model.Type, error) {
	var values []*model.Type

	if enum, ok := schema.Get("enum"); ok {
		array, isArray := enum.([]jsonv.Value)
		if !isArray {
			return nil, gerr.Invalid("enum must be an array", childPointer(pointer, "enum"))
		}

		literals := make([]*model.Type, len(array))
		for i, element := range array {
			literals[i] = jsonLiteral(element)
		}

		values = append(values, model.Union(literals...))
	}

	if constant, ok := schema.Get("const"); ok {
		values = append(values, jsonLiteral(constant))
	}

	return values, nil
}

// compositions are the types of `allOf`, `anyOf`, `oneOf` and `if`/`then`/`else`, to intersect with the schema's.
func (c *converter) compositions(schema *jsonv.Object, pointer string, sub scope) ([]*model.Type, error) {
	var types []*model.Type

	for _, keyword := range []string{keywordAllOf, keywordAnyOf, keywordOneOf} {
		value, ok := schema.Get(keyword)
		if !ok {
			continue
		}

		members, err := c.convertAll(value, childPointer(pointer, keyword), sub)
		if err != nil {
			return nil, err
		}

		if keyword == keywordAllOf {
			types = append(types, members...)
		} else {
			types = append(types, model.Union(members...))
		}
	}

	conditional, err := c.conditional(schema, pointer, sub)
	if err != nil {
		return nil, err
	}

	return append(types, conditional), nil
}

// convertAll converts each schema of a non-empty array of them.
func (c *converter) convertAll(value jsonv.Value, pointer string, sub scope) ([]*model.Type, error) {
	array, err := readSchemaArray(value, pointer)
	if err != nil {
		return nil, err
	}

	members := make([]*model.Type, len(array))

	for i, member := range array {
		members[i], err = c.convert(member, indexPointer(pointer, i), sub)
		if err != nil {
			return nil, err
		}
	}

	return members, nil
}

// conditional is the type of `if`/`then`/`else`: values matching `if` must match `then`, others must match `else`.
// Unknown without an `if`.
func (c *converter) conditional(schema *jsonv.Object, pointer string, sub scope) (*model.Type, error) {
	if _, ok := schema.Get("if"); !ok {
		for _, keyword := range []string{keywordThen, keywordElse} {
			if _, ok := schema.Get(keyword); ok {
				err := c.strictError(quote(keyword)+" has no effect without \"if\"", childPointer(pointer, keyword))
				if err != nil {
					return nil, err
				}
			}
		}

		return model.UnknownType, nil
	}

	keywords := []string{"if", keywordThen, keywordElse}
	branches := make([]*model.Type, 0, len(keywords))

	for _, keyword := range keywords {
		value, ok := schema.Get(keyword)
		if !ok {
			branches = append(branches, model.UnknownType)

			continue
		}

		branch, err := c.convert(value, childPointer(pointer, keyword), sub)
		if err != nil {
			return nil, err
		}

		branches = append(branches, branch)
	}

	return model.Union(model.Intersection(branches[0], branches[1]), branches[2]), nil
}

// not narrows a type by `not`. Only exact matches can be removed: `not: {}` makes the type never, and a `not` of null
// or literal values removes them from a union. Any other `not` is checked, but leaves the type as it is.
func (c *converter) not(converted *model.Type, value jsonv.Value, pointer string, sub scope) (*model.Type, error) {
	notType, err := c.convert(value, pointer, sub)
	if err != nil {
		return nil, err
	}

	if notType.Is(model.Unknown) {
		return model.NeverType, nil
	}

	excluded := []*model.Type{notType}
	if notType.Kind == model.KindUnion {
		excluded = notType.Members
	}

	for _, member := range excluded {
		if member.Kind != model.KindLiteral && !member.Is(model.Null) {
			return converted, nil
		}
	}

	return model.Exclude(converted, excluded), nil
}

// nullable applies OpenAPI 3.0 `nullable`.
func (c *converter) nullable(schema *jsonv.Object, pointer string, converted *model.Type) (*model.Type, error) {
	value, ok := schema.Get("nullable")
	if c.dialectOf(pointer) != OpenAPI30 || !ok {
		return converted, nil
	}

	nullable, isBoolean := value.(bool)
	if !isBoolean {
		return nil, gerr.Invalid("nullable must be a boolean", childPointer(pointer, "nullable"))
	}

	if nullable {
		return model.Union(converted, model.NullType), nil
	}

	return converted, nil
}

// typed is the type of a schema's values of one JSON type, constrained by that type's keywords.
func (c *converter) typed(schema *jsonv.Object, pointer string, valueType jsonType, sub scope) (*model.Type, error) {
	//nolint:exhaustive // The default is null, the only type left
	switch valueType {
	case typeString:
		return c.string(schema, pointer)
	case typeNumber, typeInteger:
		return c.number(schema, pointer, valueType)
	case typeArray:
		return c.array(schema, pointer)
	case typeObject:
		return c.objectType(schema, pointer, sub)
	case typeBoolean:
		return model.BooleanType, nil
	default:
		return model.NullType, nil
	}
}

// string is the type of a schema's strings.
func (c *converter) string(schema *jsonv.Object, pointer string) (*model.Type, error) {
	minLength, err := readCount(schema, "minLength", pointer)
	if err != nil {
		return nil, err
	}

	maxLength, err := readCount(schema, "maxLength", pointer)
	if err != nil {
		return nil, err
	}

	if maxLength >= 0 && minLength > maxLength {
		return c.contradiction(`"minLength" is greater than "maxLength"`, pointer)
	}

	value, ok := schema.Get("pattern")
	if !ok {
		return model.StringType, nil
	}

	pattern, err := readPattern(value, childPointer(pointer, "pattern"))
	if err != nil {
		return nil, err
	}

	return patternType(pattern), nil
}
