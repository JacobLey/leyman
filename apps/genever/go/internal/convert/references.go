package convert

import (
	"maps"
	"slices"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// sameValueKeywords are the keywords whose subschemas apply to the same value as their schema, rather than to a
// property or item: one schema, or a collection (array or object) of them.
//
//nolint:gochecknoglobals // Never changed
var (
	sameValueKeywords           = []string{"if", keywordThen, keywordElse, "not"}
	sameValueCollectionKeywords = []string{keywordAllOf, keywordAnyOf, keywordOneOf, keywordDependentSchemas, keywordDependencies}
)

// resolve resolves a `$ref`, seeing through resource aliases.
func (c *converter) resolve(ref jsonv.Value, refPointer string) (target, error) {
	refString, ok := ref.(string)
	if !ok {
		return target{schema: nil, pointer: ""}, gerr.Invalid("$ref must be a string", refPointer)
	}

	resolved, err := c.index.resolveReference(refString, refPointer[:strings.LastIndex(refPointer, "/")])
	if err != nil {
		return resolved, err
	}

	aliases := map[string]bool{}

	for aliasRef, isAlias := resourceAlias(resolved.schema); isAlias; aliasRef, isAlias = resourceAlias(resolved.schema) {
		if aliases[resolved.pointer] {
			return resolved, gerr.Invalid("$ref "+quote(refString)+" only refers to itself", refPointer)
		}

		aliases[resolved.pointer] = true

		resolved, err = c.index.resolveReference(aliasRef, resolved.pointer)
		if err != nil {
			return resolved, err
		}
	}

	return resolved, nil
}

// sameValueReferences are the canonical JSON Pointers of every schema a schema refers to, directly or through others,
// that applies to the same value: by `$ref`s outside any property or item.
func (c *converter) sameValueReferences(referenced target) map[string]bool {
	if cached, ok := c.sameValueCache[referenced.pointer]; ok {
		return cached
	}

	found := map[string]bool{}
	c.visitSameValue(referenced.schema, referenced.pointer, found)
	c.sameValueCache[referenced.pointer] = found

	return found
}

func (c *converter) visitSameValue(value jsonv.Value, pointer string, found map[string]bool) {
	schema, isObject := value.(*jsonv.Object)
	if !isObject {
		return
	}

	for _, keyword := range sameValueKeywords {
		subschema, _ := schema.Get(keyword)
		c.visitSameValue(subschema, childPointer(pointer, keyword), found)
	}

	for _, keyword := range sameValueCollectionKeywords {
		collection, _ := schema.Get(keyword)
		keywordPointer := childPointer(pointer, keyword)

		c.visitSameValueCollection(collection, keywordPointer, found)
	}

	ref, ok := schema.Get("$ref")
	if !ok {
		return
	}

	// An invalid reference is reported when the reference itself is converted
	referenced, err := c.resolve(ref, childPointer(pointer, "$ref"))
	if err != nil || found[referenced.pointer] {
		return
	}

	found[referenced.pointer] = true
	c.visitSameValue(referenced.schema, referenced.pointer, found)
}

// visitSameValueCollection visits each schema of an array or object of them. `dependencies` values may also be
// arrays of property names, which are skipped.
func (c *converter) visitSameValueCollection(collection jsonv.Value, pointer string, found map[string]bool) {
	switch collection := collection.(type) {
	case []jsonv.Value:
		for position, subschema := range collection {
			c.visitSameValue(subschema, indexPointer(pointer, position), found)
		}
	case *jsonv.Object:
		for _, key := range collection.Keys() {
			subschema, _ := collection.Get(key)
			c.visitSameValue(subschema, childPointer(pointer, key), found)
		}
	}
}

// reference is the type of a `$ref`: usually the referenced schema's named type.
//
// A reference back to a schema it is part of, applying to the same value, is never: it can never be why a value is
// valid, and a validator would recurse forever on it. A schema that would only reach back to this one (e.g. a mutual
// `anyOf`) is inlined, as a named type can't be defined as itself outside an object or array.
func (c *converter) reference(ref jsonv.Value, refPointer string, inherited scope) (*model.Type, error) {
	referenced, err := c.resolve(ref, refPointer)
	if err != nil {
		return nil, err
	}

	if slices.Contains(inherited.unguarded, referenced.pointer) {
		refString, _ := ref.(string)
		message := "$ref " + quote(refString) +
			" refers back to a schema it is part of, without a property or item in between, so it never matches"

		if err := c.strictError(message, refPointer); err != nil {
			return nil, err
		}

		return model.NeverType, nil
	}

	reachable := c.sameValueReferences(referenced)
	if slices.ContainsFunc(inherited.unguarded, func(pointer string) bool { return reachable[pointer] }) {
		return c.convert(referenced.schema, referenced.pointer, scope{
			properties: map[string]*model.Type{},
			types:      nil,
			unguarded:  append(slices.Clip(inherited.unguarded), referenced.pointer),
		})
	}

	// The root is always named, and is the one schema whose pointer has no parent to name it after
	if name, ok := c.named[referenced.pointer]; ok {
		return model.Reference(name), nil
	}

	return model.Reference(c.register(referenced.pointer, referenceName(referenced.pointer), referenced.schema)), nil
}

// checkDiscriminator checks a `discriminator` names a property, and, in strict mode, that it can tell the schema's
// branches apart: the property is required, by the schema or by every `oneOf`/`anyOf` branch, and every `mapping`
// target exists. Its value isn't checked, as OpenAPI may infer it from a component's name. It doesn't change the type.
func (c *converter) checkDiscriminator(schema *jsonv.Object, value jsonv.Value, pointer string) error {
	discriminatorPointer := childPointer(pointer, "discriminator")

	discriminator, err := readObject(value, discriminatorPointer)
	if err != nil {
		return err
	}

	name, _ := discriminator.Get("propertyName")

	propertyName, isString := name.(string)
	if !isString {
		return gerr.Invalid("discriminator must have a propertyName", childPointer(discriminatorPointer, "propertyName"))
	}

	if !c.isDiscriminatorRequired(schema, pointer, propertyName) {
		message := "discriminator property " + quote(propertyName) +
			" must be required, by the schema or by every oneOf or anyOf branch"
		if err := c.strictError(message, discriminatorPointer); err != nil {
			return err
		}
	}

	mapping, ok := discriminator.Get("mapping")
	if !ok {
		return nil
	}

	return c.checkMapping(mapping, childPointer(discriminatorPointer, "mapping"))
}

// isDiscriminatorRequired reports whether a schema, or every one of its `oneOf` (or else `anyOf`) branches, requires
// its discriminator property.
func (c *converter) isDiscriminatorRequired(schema *jsonv.Object, pointer, propertyName string) bool {
	if c.requires(schema, pointer, propertyName, nil) {
		return true
	}

	for _, keyword := range []string{keywordOneOf, keywordAnyOf} {
		value, _ := schema.Get(keyword)

		branches, ok := value.([]jsonv.Value)
		if !ok {
			continue
		}

		keywordPointer := childPointer(pointer, keyword)

		for i, branch := range branches {
			if !c.requires(branch, indexPointer(keywordPointer, i), propertyName, nil) {
				return false
			}
		}

		return len(branches) > 0
	}

	return false
}

// checkMapping checks, in strict mode, that every target of a discriminator's `mapping` exists.
func (c *converter) checkMapping(value jsonv.Value, pointer string) error {
	mapping, err := readObject(value, pointer)
	if err != nil {
		return err
	}

	for _, key := range mapping.Keys() {
		targetPointer := childPointer(pointer, key)
		ref, _ := mapping.Get(key)

		// A mapping value is a reference, or the name of a schema in the document's components
		if name, ok := ref.(string); ok && !strings.Contains(name, "/") {
			ref = "#/components/schemas/" + name
		}

		if _, err := c.resolve(ref, childPointer(targetPointer, "$ref")); err != nil {
			message := "discriminator mapping " + quote(key) + " refers to a schema that does not exist"
			if err := c.strictError(message, targetPointer); err != nil {
				return err
			}
		}
	}

	return nil
}

// requires reports whether every value of a schema has a property, as it or a `$ref` or `allOf` requires it. seen
// holds the schemas already checked, to stop at cycles.
func (c *converter) requires(value jsonv.Value, pointer, property string, seen map[string]bool) bool {
	schema, ok := value.(*jsonv.Object)
	if !ok || seen[pointer] {
		return false
	}

	required, _ := schema.Get("required")
	if names, ok := required.([]jsonv.Value); ok && slices.Contains(names, jsonv.Value(property)) {
		return true
	}

	next := map[string]bool{pointer: true}
	maps.Copy(next, seen)

	if ref, ok := schema.Get("$ref"); ok {
		referenced, err := c.resolve(ref, childPointer(pointer, "$ref"))
		// Converting the reference reports it, rather than a misleading discriminator error
		if err != nil || c.requires(referenced.schema, referenced.pointer, property, next) {
			return true
		}
	}

	allOf, _ := schema.Get(keywordAllOf)
	members, _ := allOf.([]jsonv.Value)

	for i, member := range members {
		if c.requires(member, indexPointer(childPointer(pointer, keywordAllOf), i), property, next) {
			return true
		}
	}

	return false
}
