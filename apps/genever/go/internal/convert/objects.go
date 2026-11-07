package convert

import (
	"slices"

	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// propertyTypes converts each property a schema declares in `properties`.
func (c *converter) propertyTypes(schema *jsonv.Object, pointer string) (map[string]*model.Type, error) {
	value, ok := schema.Get("properties")
	if !ok {
		return map[string]*model.Type{}, nil
	}

	propertiesPointer := childPointer(pointer, "properties")

	properties, err := readObject(value, propertiesPointer)
	if err != nil {
		return nil, err
	}

	types := make(map[string]*model.Type, properties.Len())

	for _, name := range properties.Keys() {
		propertySchema, _ := properties.Get(name)

		types[name], err = c.convert(propertySchema, childPointer(propertiesPointer, name), emptyScope())
		if err != nil {
			return nil, err
		}
	}

	return types, nil
}

// declaredProperties returns a schema's `properties`, already checked to be an object, or an empty object.
func declaredProperties(schema *jsonv.Object) *jsonv.Object {
	value, _ := schema.Get("properties")
	if properties, ok := value.(*jsonv.Object); ok {
		return properties
	}

	return jsonv.NewObject()
}

// objectType is the type of a schema's objects, from its properties, additional properties and dependents.
//
//nolint:cyclop,funlen // The steps of one object type, in the order they apply
func (c *converter) objectType(schema *jsonv.Object, pointer string, sub scope) (*model.Type, error) {
	propertySchemas := declaredProperties(schema)
	requiredValue, hasRequired := schema.Get("required")

	required, err := readPropertyNames(requiredValue, hasRequired, childPointer(pointer, "required"))
	if err != nil {
		return nil, err
	}

	properties, err := c.properties(propertySchemas, pointer, required, sub)
	if err != nil {
		return nil, err
	}

	contradiction, err := objectContradiction(schema, pointer, required, sub)
	if err != nil {
		return nil, err
	}

	if contradiction != "" {
		return c.contradiction(contradiction, pointer)
	}

	index, properties, err := c.patternProperties(schema, pointer, properties)
	if err != nil {
		return nil, err
	}

	nameKeys, err := c.propertyNameKeys(schema, pointer)
	if err != nil {
		return nil, err
	}

	additional, hasAdditional := schema.Get("additionalProperties")
	unevaluated, _ := schema.Get("unevaluatedProperties")

	switch {
	case hasAdditional && additional != false:
		value, err := c.convert(additional, childPointer(pointer, "additionalProperties"), emptyScope())
		if err != nil {
			return nil, err
		}

		index, properties = additionalKeys(value, nameKeys, index, properties)
	case !hasAdditional && unevaluated != false && (len(properties) > 0 || len(index) > 0):
		// Keys no property declares are kept, as JSON Schema allows them unless additionalProperties is false. An
		// object with no properties or patterns stays the plain object type, which keeps every key already
		index, properties = additionalKeys(model.UnknownType, nameKeys, index, properties)
	}

	dependents, err := c.dependents(schema, pointer, sub)
	if err != nil {
		return nil, err
	}

	if len(properties) > 0 || len(index) > 0 {
		return model.Intersection(append([]*model.Type{model.Object(properties, index)}, dependents...)...), nil
	}

	// `propertyNames: false` allows no keys, as `additionalProperties: false` does without properties
	object := model.ObjectType
	if additional == false || len(nameKeys) == 0 {
		object = model.Object(nil, []model.Index{{Key: model.StringType, Value: model.NeverType}})
	}

	return model.Intersection(append([]*model.Type{object}, dependents...)...), nil
}

// properties lists an object's properties: those it declares, then those it requires that a parent declares.
func (c *converter) properties(
	propertySchemas *jsonv.Object, pointer string, required []string, sub scope,
) ([]model.Property, error) {
	properties := make([]model.Property, 0, propertySchemas.Len())

	for _, name := range propertySchemas.Keys() {
		propertySchema, _ := propertySchemas.Get(name)
		properties = append(properties, model.Property{
			Doc:      readDoc(propertySchema),
			Name:     name,
			Optional: !slices.Contains(required, name),
			Pointer:  childPointer(childPointer(pointer, "properties"), name),
			Type:     sub.properties[name],
		})
	}

	for _, name := range required {
		if _, ok := propertySchemas.Get(name); ok {
			continue
		}

		// Declared by a parent schema, e.g. `required` in an `allOf` member
		propertyType, ok := sub.properties[name]
		if !ok {
			message := "Required property " + quote(name) + ` is not in "properties"`
			if err := c.strictError(message, childPointer(pointer, "required")); err != nil {
				return nil, err
			}

			propertyType = model.UnknownType
		}

		properties = append(properties, model.Property{
			Doc: nil, Name: name, Optional: false, Pointer: "", Type: propertyType,
		})
	}

	return properties, nil
}

// objectContradiction says why an object schema accepts no objects, or is empty if it does.
func objectContradiction(schema *jsonv.Object, pointer string, required []string, sub scope) (string, error) {
	minProperties, err := readCount(schema, "minProperties", pointer)
	if err != nil {
		return "", err
	}

	maxProperties, err := readCount(schema, "maxProperties", pointer)
	if err != nil {
		return "", err
	}

	minProperties = max(minProperties, 0)
	unique := map[string]bool{}

	for _, name := range required {
		unique[name] = true
	}

	if maxProperties >= 0 && max(minProperties, float64(len(unique))) > maxProperties {
		return `"minProperties" or "required" need more properties than "maxProperties" allows`, nil
	}

	if name, isNever := neverRequired(required, sub); isNever {
		return "Required property " + quote(name) + " is never valid", nil
	}

	additional, _ := schema.Get("additionalProperties")
	_, hasPatterns := schema.Get("patternProperties")

	if additional == false && !hasPatterns && minProperties > float64(declaredProperties(schema).Len()) {
		return `"minProperties" is more than the properties allowed`, nil
	}

	return "", nil
}

// neverRequired returns the first required property that is never valid, if any.
func neverRequired(required []string, sub scope) (string, bool) {
	for _, name := range required {
		if propertyType, ok := sub.properties[name]; ok && propertyType.Is(model.Never) {
			return name, true
		}
	}

	return "", false
}

// additionalKeys adds the keys no property declares to an object, with the type value: as index signatures for the
// keys `propertyNames` allows, and optional properties for its literal keys.
func additionalKeys(
	value *model.Type, nameKeys []*model.Type, index []model.Index, properties []model.Property,
) ([]model.Index, []model.Property) {
	for _, key := range nameKeys {
		if key.Kind != model.KindLiteral {
			// The index holds only the keys no property or pattern declares, so its value is the additionalProperties
			// type alone
			index = append(index, model.Index{Key: key, Value: value})

			continue
		}

		name, _ := key.Literal.(string)
		if !slices.ContainsFunc(properties, func(property model.Property) bool { return property.Name == name }) {
			// A literal key can't be an index signature, so it is an optional property
			properties = append(properties, model.Property{
				Doc: nil, Name: name, Optional: true, Pointer: "", Type: value,
			})
		}
	}

	return index, properties
}

// propertyNameKeys are the keys `propertyNames` allows, as the keys of `additionalProperties`: string, templates, or
// string literals.
func (c *converter) propertyNameKeys(schema *jsonv.Object, pointer string) ([]*model.Type, error) {
	value, ok := schema.Get("propertyNames")
	if !ok {
		return []*model.Type{model.StringType}, nil
	}

	names, err := c.convert(value, childPointer(pointer, "propertyNames"), scope{
		properties: map[string]*model.Type{}, types: []jsonType{typeString}, unguarded: nil,
	})
	if err != nil {
		return nil, err
	}

	members := []*model.Type{names}
	if names.Kind == model.KindUnion {
		members = names.Members
	}

	var keys []*model.Type

	for _, member := range members {
		if key := nameKey(member); key != nil {
			keys = append(keys, key)
		}
	}

	return keys, nil
}

// nameKey is the key of a member of the `propertyNames` type, or nil if no string is one.
func nameKey(member *model.Type) *model.Type {
	_, isString := member.Literal.(string)

	switch {
	case member.Kind == model.KindTemplate || (member.Kind == model.KindLiteral && isString):
		return member
	// Any other string type (e.g. an intersection of patterns) is as wide as string
	case member.Kind == model.KindIntersection || member.Is(model.String) || member.Is(model.Unknown):
		return model.StringType
	default:
		return nil
	}
}

// patternProperties converts `patternProperties` to index signatures, and a pattern matching exactly one key to an
// optional property, added to properties.
func (c *converter) patternProperties(
	schema *jsonv.Object, pointer string, properties []model.Property,
) ([]model.Index, []model.Property, error) {
	value, ok := schema.Get("patternProperties")
	if !ok {
		return nil, properties, nil
	}

	patternPointer := childPointer(pointer, "patternProperties")

	patterns, err := readObject(value, patternPointer)
	if err != nil {
		return nil, nil, err
	}

	var index []model.Index

	for _, pattern := range patterns.Keys() {
		keyPointer := childPointer(patternPointer, pattern)

		if _, err := readPattern(pattern, keyPointer); err != nil {
			return nil, nil, err
		}

		key := patternType(pattern)
		patternSchema, _ := patterns.Get(pattern)

		propertyValue, err := c.convert(patternSchema, keyPointer, emptyScope())
		if err != nil {
			return nil, nil, err
		}

		if key.Kind == model.KindLiteral {
			name, _ := key.Literal.(string)
			properties = append(properties, model.Property{
				Doc: nil, Name: name, Optional: true, Pointer: keyPointer, Type: propertyValue,
			})
		} else {
			index = append(index, model.Index{Key: key, Value: propertyValue})
		}
	}

	return index, properties, nil
}

// dependents are the types of `dependentRequired` and `dependentSchemas` (or the older `dependencies`), to intersect
// with the object: when a property is present, other properties are required, or another schema applies.
func (c *converter) dependents(schema *jsonv.Object, pointer string, sub scope) ([]*model.Type, error) {
	var dependents []*model.Type

	objectScope := scope{properties: sub.properties, types: []jsonType{typeObject}, unguarded: sub.unguarded}

	for _, keyword := range []string{"dependentRequired", keywordDependentSchemas, keywordDependencies} {
		value, ok := schema.Get(keyword)
		if !ok {
			continue
		}

		keywordPointer := childPointer(pointer, keyword)

		entries, err := readObject(value, keywordPointer)
		if err != nil {
			return nil, err
		}

		for _, name := range entries.Keys() {
			dependent, _ := entries.Get(name)

			present, err := c.dependent(keyword, dependent, childPointer(keywordPointer, name), sub, objectScope)
			if err != nil {
				return nil, err
			}

			absent := model.Object([]model.Property{{
				Doc: nil, Name: name, Optional: true, Pointer: "", Type: model.NeverType,
			}}, nil)
			dependents = append(dependents, model.Union(absent, present))
		}
	}

	return dependents, nil
}

// dependent is the type of an object with a property that has a dependent: the schema that then applies, or the
// properties that are then required.
func (c *converter) dependent(
	keyword string, dependent jsonv.Value, pointer string, sub, objectScope scope,
) (*model.Type, error) {
	if keyword == keywordDependentSchemas || (keyword == keywordDependencies && !isArray(dependent)) {
		return c.convert(dependent, pointer, objectScope)
	}

	names, err := readPropertyNames(dependent, true, pointer)
	if err != nil {
		return nil, err
	}

	properties := make([]model.Property, len(names))

	for position, name := range names {
		propertyType, ok := sub.properties[name]
		if !ok {
			propertyType = model.UnknownType
		}

		properties[position] = model.Property{Doc: nil, Name: name, Optional: false, Pointer: "", Type: propertyType}
	}

	return model.Object(properties, nil), nil
}
