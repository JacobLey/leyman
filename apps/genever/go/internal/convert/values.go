package convert

import (
	"math"
	"slices"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// A rangeBound is the lowest (or highest) value of a number range, and whether it is excluded.
type rangeBound struct {
	value     float64
	exclusive bool
	present   bool
}

// tighterBound is the tighter of two bounds: direction is 1 for a lower bound (the larger value is tighter), -1 for an
// upper bound.
func tighterBound(first, second rangeBound, direction float64) rangeBound {
	switch {
	case !first.present:
		return second
	case !second.present:
		return first
	case first.value == second.value:
		return rangeBound{value: first.value, exclusive: first.exclusive || second.exclusive, present: true}
	case (first.value-second.value)*direction > 0:
		return first
	default:
		return second
	}
}

// numberBound is the bound of a number range, from its inclusive keyword (`minimum`) and its exclusive one
// (`exclusiveMinimum`, which is a boolean in OpenAPI 3.0 and draft-04).
func numberBound(inclusive, exclusive bound, direction float64) rangeBound {
	return tighterBound(
		rangeBound{value: inclusive.value, exclusive: exclusive.isBoolean && exclusive.boolean, present: inclusive.isNumber},
		rangeBound{value: exclusive.value, exclusive: true, present: exclusive.isNumber},
		direction,
	)
}

// number is the type of a schema's numbers, or integers.
func (c *converter) number(schema *jsonv.Object, pointer string, valueType jsonType) (*model.Type, error) {
	// OpenAPI 3.0 and draft-04 mark `minimum` and `maximum` exclusive with booleans
	isBooleanAllowed := c.options.Dialect == OpenAPI30 || c.index.isDraft04(pointer)
	bounds := map[string]bound{}

	for _, keyword := range []string{keywordMinimum, keywordExclusiveMinimum, keywordMaximum, keywordExclusiveMaximum} {
		read, err := readBound(schema, keyword, pointer, isBooleanAllowed && strings.HasPrefix(keyword, "exclusive"))
		if err != nil {
			return nil, err
		}

		bounds[keyword] = read
	}

	numberType := model.NumberType
	if valueType == typeInteger {
		numberType = model.IntegerType
	}

	lower := numberBound(bounds[keywordMinimum], bounds[keywordExclusiveMinimum], 1)
	upper := numberBound(bounds[keywordMaximum], bounds[keywordExclusiveMaximum], -1)

	if lower.present && upper.present && isRangeEmpty(lower, upper, valueType == typeInteger) {
		return c.contradiction("The minimum and maximum allow no "+string(valueType), pointer)
	}

	return numberType, nil
}

// isRangeEmpty reports whether no number, or no integer, is within both bounds.
func isRangeEmpty(lower, upper rangeBound, isInteger bool) bool {
	if !isInteger {
		return lower.value > upper.value || (lower.value == upper.value && (lower.exclusive || upper.exclusive))
	}

	// The integers nearest to each bound, within it
	lowest := math.Ceil(lower.value)
	if lower.exclusive {
		lowest = math.Floor(lower.value) + 1
	}

	highest := math.Floor(upper.value)
	if upper.exclusive {
		highest = math.Ceil(upper.value) - 1
	}

	return lowest > highest
}

// arrayCounts are an array schema's counts, -1 when absent.
type arrayCounts struct {
	minItems, maxItems, minContains, maxContains float64
}

// readArrayCounts reads `minItems`, `maxItems`, `minContains` and `maxContains`.
func readArrayCounts(schema *jsonv.Object, pointer string) (arrayCounts, error) {
	var counts [4]float64

	for position, keyword := range []string{keywordMinItems, keywordMaxItems, "minContains", "maxContains"} {
		count, err := readCount(schema, keyword, pointer)
		if err != nil {
			return arrayCounts{}, err //nolint:exhaustruct // Unused with an error
		}

		counts[position] = count
	}

	return arrayCounts{
		minItems: max(counts[0], 0), maxItems: counts[1], minContains: counts[2], maxContains: counts[3],
	}, nil
}

// array is the type of a schema's arrays: a tuple for `prefixItems` (or draft 7's array of `items`), or an array.
func (c *converter) array(schema *jsonv.Object, pointer string) (*model.Type, error) {
	counts, err := readArrayCounts(schema, pointer)
	if err != nil {
		return nil, err
	}

	if contradiction := countContradiction(schema, counts); contradiction != "" {
		return c.contradiction(contradiction, pointer)
	}

	prefixKeyword, prefix, rest, err := c.arrayItems(schema, pointer)
	if err != nil {
		return nil, err
	}

	prefixLength := float64(len(prefix))
	isRestNever := rest.Is(model.Never)

	if isRestNever && counts.minItems > prefixLength {
		return c.contradiction(
			`"minItems" is greater than the number of "prefixItems", and "items" is false`, pointer,
		)
	}

	isTruncated, err := c.isTruncated(counts, prefixLength, prefixKeyword, pointer)
	if err != nil {
		return nil, err
	}

	if len(prefix) == 0 {
		if isRestNever {
			return model.Tuple(nil, nil), nil
		}

		return model.Array(rest), nil
	}

	return tuple(prefix, rest, counts, isTruncated), nil
}

// isTruncated reports whether `maxItems` leaves out some prefix items, which fails in strict mode.
func (c *converter) isTruncated(counts arrayCounts, prefixLength float64, prefixKeyword, pointer string) (bool, error) {
	if counts.maxItems < 0 || counts.maxItems >= prefixLength {
		return false, nil
	}

	message := `"maxItems" is less than the number of "` + prefixKeyword + `", so the last are never valid`

	return true, c.strictError(message, pointer)
}

// countContradiction says why an array schema's counts allow no array, or is empty if they allow some.
func countContradiction(schema *jsonv.Object, counts arrayCounts) string {
	if counts.maxItems >= 0 && counts.minItems > counts.maxItems {
		return `"minItems" is greater than "maxItems"`
	}

	// `minContains` and `maxContains` only apply with `contains`
	minContains := counts.minContains
	if minContains < 0 {
		minContains = 1
	}

	if _, hasContains := schema.Get("contains"); hasContains && counts.maxContains >= 0 &&
		minContains > counts.maxContains {
		return `"minContains" is greater than "maxContains"`
	}

	return ""
}

// tuple is the type of arrays with prefix items. Items beyond `maxItems` can't be present, and prefix items beyond
// `minItems` may be missing.
func tuple(prefix []*model.Type, rest *model.Type, counts arrayCounts, isTruncated bool) *model.Type {
	if isTruncated {
		prefix = prefix[:int(counts.maxItems)]
	}

	elements := make([]model.Element, len(prefix))
	for position, item := range prefix {
		elements[position] = model.Element{Optional: float64(position) >= counts.minItems, Type: item}
	}

	if rest.Is(model.Never) || isTruncated {
		rest = nil
	}

	return model.Tuple(elements, rest)
}

// arrayItems converts the items of an array schema: 2020-12 `prefixItems` and `items`, or the older array of `items`
// and `additionalItems`. It returns the prefix keyword, the prefix items, and the rest.
func (c *converter) arrayItems(schema *jsonv.Object, pointer string) (string, []*model.Type, *model.Type, error) {
	prefixKeyword, restKeyword := keywordPrefixItems, keywordItems
	if items, _ := schema.Get(keywordItems); isArray(items) {
		prefixKeyword, restKeyword = keywordItems, keywordAdditionalItems
	}

	var prefix []*model.Type

	if value, ok := schema.Get(prefixKeyword); ok {
		items, err := c.convertItems(value, childPointer(pointer, prefixKeyword))
		if err != nil {
			return "", nil, nil, err
		}

		prefix = items
	}

	rest := model.UnknownType

	if value, ok := schema.Get(restKeyword); ok {
		converted, err := c.convert(value, childPointer(pointer, restKeyword), emptyScope())
		if err != nil {
			return "", nil, nil, err
		}

		rest = converted
	}

	return prefixKeyword, prefix, rest, nil
}

// convertItems converts each schema of a non-empty array of item schemas, each applied to its own item.
func (c *converter) convertItems(value jsonv.Value, pointer string) ([]*model.Type, error) {
	array, err := readSchemaArray(value, pointer)
	if err != nil {
		return nil, err
	}

	items := make([]*model.Type, len(array))

	for i, item := range array {
		items[i], err = c.convert(item, indexPointer(pointer, i), emptyScope())
		if err != nil {
			return nil, err
		}
	}

	return items, nil
}

func isArray(value jsonv.Value) bool {
	_, ok := value.([]jsonv.Value)

	return ok
}

// typeOfValue is the most specific JSON type of a value of `enum` or `const`.
func typeOfValue(value jsonv.Value) jsonType {
	switch value := value.(type) {
	case nil:
		return typeNull
	case []jsonv.Value:
		return typeArray
	case float64:
		// JSON Schema integers include those too large to be exact, e.g. `1e20`
		if !math.IsInf(value, 0) && value == math.Trunc(value) {
			return typeInteger
		}

		return typeNumber
	case bool:
		return typeBoolean
	case string:
		return typeString
	default:
		return typeObject
	}
}

// isApplicable reports whether a keyword of a type (e.g. `maxLength` of strings) applies to a JSON type. Number
// keywords apply to integers too.
func isApplicable(family, valueType jsonType) bool {
	return valueType == family || (valueType == typeInteger && family == typeNumber)
}

// types checks every keyword of a schema is known and applies to its types, and returns its types, or nil for any.
func (c *converter) types(schema *jsonv.Object, pointer string, inherited scope) ([]jsonType, error) {
	types, err := readTypes(schema, pointer)
	if err != nil {
		return nil, err
	}

	if types == nil {
		types = inherited.types
	}

	hasFamily := false

	for _, keyword := range schema.Keys() {
		keywordPointer := childPointer(pointer, keyword)
		if unsupportedKeywords[keyword] {
			return nil, gerr.Unsupported(quote(keyword)+" is not supported", keywordPointer)
		}

		if family, ok := typeKeywords[keyword]; ok {
			hasFamily = true

			err = c.checkFamily(keyword, family, types, keywordPointer)
		} else if !c.isKnownKeyword(keyword, pointer) {
			err = c.strictError("Unknown keyword "+quote(keyword), keywordPointer)
		}

		if err != nil {
			return nil, err
		}
	}

	// A schema without a type accepts every type. Its keywords constrain only their own, so (outside strict mode,
	// which requires a type) list every type for them to apply to
	if types == nil && hasFamily {
		return everyType, nil
	}

	return types, nil
}

// isKnownKeyword reports whether a keyword that applies to every type is known, in the schema's dialect.
func (c *converter) isKnownKeyword(keyword, pointer string) bool {
	dialect := c.options.Dialect

	return strings.HasPrefix(keyword, "x-") ||
		// Draft-04 names a schema's resource with `id`
		(keyword == "id" && c.index.isDraft04(pointer)) ||
		genericKeywords[keyword] ||
		// Also in plain JSON Schema: Juniper emits it for discriminated `oneOf`s, and Ajv supports it
		keyword == "discriminator" ||
		(dialect != Draft202012 && openAPIKeywords[keyword]) ||
		(dialect == OpenAPI30 && openAPI30Keywords[keyword])
}

// checkFamily checks, in strict mode, that a type keyword applies to one of the schema's types.
func (c *converter) checkFamily(keyword string, family jsonType, types []jsonType, pointer string) error {
	expected := quote(keyword) + " only applies to type " + quote(string(family))
	if types == nil {
		return c.strictError(expected+", but the schema has no type", pointer)
	}

	if slices.ContainsFunc(types, func(valueType jsonType) bool { return isApplicable(family, valueType) }) {
		return nil
	}

	actual := make([]string, len(types))
	for i, valueType := range types {
		actual[i] = quote(string(valueType))
	}

	return c.strictError(expected+", not "+strings.Join(actual, ", "), pointer)
}

// checkValues checks, in strict mode, that every `enum` and `const` value is of the schema's types.
func (c *converter) checkValues(schema *jsonv.Object, pointer string, types []jsonType) error {
	if types == nil {
		return nil
	}

	var values []jsonv.Value

	if enum, ok := schema.Get("enum"); ok {
		values, _ = enum.([]jsonv.Value)
	}

	if constant, ok := schema.Get("const"); ok {
		values = append(slices.Clip(values), constant)
	}

	for _, value := range values {
		valueType := typeOfValue(value)
		if !slices.ContainsFunc(types, func(t jsonType) bool { return isApplicable(t, valueType) }) {
			message := jsonv.Stringify(value) + " is never valid, as it is not of the schema's type"
			if err := c.strictError(message, pointer); err != nil {
				return err
			}
		}
	}

	return nil
}
