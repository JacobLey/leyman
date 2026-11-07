// Package model is a small model of the types a schema describes, independent of the language they are written in.
//
// It is the TypeScript genever's model of TypeScript types, with an integer keyword added, as Go has a type for
// integers. Building a model, rather than writing Go directly, lets types be simplified as they are combined: e.g.
// `(string | null) & string` is `string`, and a union of literals with their primitive is the primitive.
package model

import (
	"slices"
	"strconv"
	"strings"
)

// A Kind is what kind of type a Type is, which decides the fields it uses.
type Kind int

// Kinds of types.
const (
	// KindKeyword is a type of its own, named by Keyword.
	KindKeyword Kind = iota
	// KindObject is an object with Properties, and Index signatures for other keys.
	KindObject
	// KindTuple is an array of Elements, followed by any number of Rest items unless Rest is nil.
	KindTuple
	// KindArray is an array of Element.
	KindArray
	// KindIntersection is a value of every one of Members.
	KindIntersection
	// KindLiteral is exactly the value Literal: a bool, float64 or string.
	KindLiteral
	// KindReference is the named type Name.
	KindReference
	// KindTemplate is a string made of Parts: literal text, and any strings.
	KindTemplate
	// KindUnion is a value of any of Members.
	KindUnion
)

// A Keyword is a type without parts.
type Keyword int

// Keywords.
const (
	// Unknown is any value.
	Unknown Keyword = iota
	// Never is no value.
	Never
	// Boolean is true or false.
	Boolean
	// Null is null.
	Null
	// Number is any number.
	Number
	// Integer is a number without a fraction.
	Integer
	// String is any string.
	String
	// AnyObject is any object.
	AnyObject
)

// A Class is which kind of JSON value a type describes, if it describes only one.
type Class string

// Classes of JSON values. Two types of different classes never overlap.
const (
	ClassNone    Class = ""
	ClassArray   Class = "array"
	ClassBoolean Class = "boolean"
	ClassNull    Class = "null"
	ClassNumber  Class = "number"
	ClassObject  Class = "object"
	ClassString  Class = "string"
)

// A Type is a type. Types are never changed once built, so they may be shared.
type Type struct {
	Element    *Type
	Rest       *Type
	Literal    any
	Name       string
	Properties []Property
	Index      []Index
	Elements   []Element
	Members    []*Type
	Parts      []TemplatePart
	Kind       Kind
	Keyword    Keyword
}

// A Doc is documentation attached to a generated type or property.
type Doc struct {
	Description string
	Title       string
	// Tags are documented keywords, e.g. {Name: "minLength", Text: "3"}.
	Tags       []Tag
	Deprecated bool
}

// A Tag is a documented keyword and its value, as JSON.
type Tag struct {
	Name string
	Text string
}

// A Property is a property of an object type.
type Property struct {
	Doc *Doc
	// Type of the property's value.
	Type *Type
	Name string
	// Pointer is the JSON Pointer to the property's schema, if it has one. It is not part of the type.
	Pointer  string
	Optional bool
}

// An Index is an index signature: the type of the values of other keys, which match Key.
type Index struct {
	// Key is `string`, a template for keys matching a pattern, or a string literal.
	Key   *Type
	Value *Type
}

// An Element is an item of a tuple.
type Element struct {
	Type     *Type
	Optional bool
}

// A TemplatePart is literal text, or any string when IsString.
type TemplatePart struct {
	Text     string
	IsString bool
}

// Types of their own.
var (
	UnknownType = keyword(Unknown) //nolint:gochecknoglobals // Never changed
	NeverType   = keyword(Never)   //nolint:gochecknoglobals // Never changed
	BooleanType = keyword(Boolean) //nolint:gochecknoglobals // Never changed
	NullType    = keyword(Null)    //nolint:gochecknoglobals // Never changed
	NumberType  = keyword(Number)  //nolint:gochecknoglobals // Never changed
	IntegerType = keyword(Integer) //nolint:gochecknoglobals // Never changed
	StringType  = keyword(String)  //nolint:gochecknoglobals // Never changed
	// ObjectType is any object.
	ObjectType = keyword(AnyObject) //nolint:gochecknoglobals // Never changed
)

// newType is the one place a Type is built: each constructor sets the fields of its kind.
func newType(kind Kind) *Type {
	return &Type{
		Element:    nil,
		Rest:       nil,
		Literal:    nil,
		Name:       "",
		Properties: nil,
		Index:      nil,
		Elements:   nil,
		Members:    nil,
		Parts:      nil,
		Kind:       kind,
		Keyword:    Unknown,
	}
}

func keyword(name Keyword) *Type {
	t := newType(KindKeyword)
	t.Keyword = name

	return t
}

// Object returns an object type.
func Object(properties []Property, index []Index) *Type {
	t := newType(KindObject)
	t.Properties = properties
	t.Index = index

	return t
}

// Tuple returns a tuple type. A nil rest allows no more items.
func Tuple(elements []Element, rest *Type) *Type {
	t := newType(KindTuple)
	t.Elements = elements
	t.Rest = rest

	return t
}

// Array returns an array type.
func Array(element *Type) *Type {
	t := newType(KindArray)
	t.Element = element

	return t
}

// Literal returns the type of exactly one value: a bool, float64 or string.
func Literal(value any) *Type {
	t := newType(KindLiteral)
	t.Literal = value

	return t
}

// Reference returns a reference to a named type.
func Reference(name string) *Type {
	t := newType(KindReference)
	t.Name = name

	return t
}

// Template returns a template string type.
func Template(parts []TemplatePart) *Type {
	t := newType(KindTemplate)
	t.Parts = parts

	return t
}

func composite(kind Kind, members []*Type) *Type {
	t := newType(kind)
	t.Members = members

	return t
}

// Unions are distributed over intersections ((A | B) & C => (A & C) | (B & C)) to simplify them, unless that would
// create more members than this.
const maxDistributedMembers = 32

// Is reports whether a type is the keyword.
func (t *Type) Is(keyword Keyword) bool {
	return t.Kind == KindKeyword && t.Keyword == keyword
}

// Key identifies a type: two types with the same key are the same type. Pointers are left out.
func (t *Type) Key() string {
	var builder strings.Builder

	t.writeKey(&builder)

	return builder.String()
}

// Class returns which kind of JSON value a type describes, or ClassNone if unknown or mixed.
func (t *Type) Class() Class {
	switch t.Kind {
	case KindKeyword:
		return keywordClass(t.Keyword)
	case KindLiteral:
		return literalClass(t.Literal)
	case KindTemplate:
		return ClassString
	case KindArray, KindTuple:
		return ClassArray
	case KindObject:
		return ClassObject
	case KindUnion:
		return unionClass(t.Members)
	case KindIntersection, KindReference:
	}

	return ClassNone
}

func literalClass(value any) Class {
	switch value.(type) {
	case bool:
		return ClassBoolean
	case float64:
		return ClassNumber
	default:
		return ClassString
	}
}

func keywordClass(keyword Keyword) Class {
	switch keyword {
	case Boolean:
		return ClassBoolean
	case Null:
		return ClassNull
	case Number, Integer:
		return ClassNumber
	case String:
		return ClassString
	case AnyObject:
		return ClassObject
	case Unknown, Never:
	}

	return ClassNone
}

// E.g. the branches of a `oneOf` of objects, so a sibling `type: "object"` is redundant. Only objects with a required
// property, which TypeScript keeps primitives out of.
func unionClass(members []*Type) Class {
	classes := make([]Class, len(members))

	for index, member := range members {
		classes[index] = member.Class()
		if member.Kind == KindObject && !slices.ContainsFunc(member.Properties, isRequired) {
			classes[index] = ClassNone
		}
	}

	if slices.ContainsFunc(classes, func(class Class) bool { return class != classes[0] }) {
		return ClassNone
	}

	return classes[0]
}

func isRequired(property Property) bool {
	return !property.Optional
}

// Whether a type allows every value of its class, e.g. `string` or `unknown[]`. Not integer, which is narrower than
// number.
func (t *Type) isClassTop() bool {
	if t.Kind == KindKeyword {
		return t.Keyword != Integer && t.Class() != ClassNone
	}

	return t.Kind == KindArray && t.Element.Is(Unknown)
}

func (t *Type) writeKey(builder *strings.Builder) {
	builder.WriteString(strconv.Itoa(int(t.Kind)))
	builder.WriteByte('(')

	switch t.Kind {
	case KindKeyword:
		builder.WriteString(strconv.Itoa(int(t.Keyword)))
	case KindObject:
		t.writeObjectKey(builder)
	case KindTuple:
		t.writeTupleKey(builder)
	case KindArray:
		t.Element.writeKey(builder)
	case KindIntersection, KindUnion:
		for _, member := range t.Members {
			member.writeKey(builder)
		}
	case KindLiteral:
		builder.WriteString(literalKey(t.Literal))
	case KindReference:
		builder.WriteString(strconv.Quote(t.Name))
	case KindTemplate:
		t.writeTemplateKey(builder)
	}

	builder.WriteByte(')')
}

func (t *Type) writeTemplateKey(builder *strings.Builder) {
	for _, part := range t.Parts {
		builder.WriteString(strconv.FormatBool(part.IsString))
		builder.WriteString(strconv.Quote(part.Text))
	}
}

func (t *Type) writeObjectKey(builder *strings.Builder) {
	for _, property := range t.Properties {
		builder.WriteString(strconv.Quote(property.Name))
		builder.WriteString(strconv.FormatBool(property.Optional))
		property.Type.writeKey(builder)
	}

	builder.WriteByte('|')

	for _, index := range t.Index {
		index.Key.writeKey(builder)
		index.Value.writeKey(builder)
	}
}

func (t *Type) writeTupleKey(builder *strings.Builder) {
	for _, element := range t.Elements {
		builder.WriteString(strconv.FormatBool(element.Optional))
		element.Type.writeKey(builder)
	}

	if t.Rest != nil {
		builder.WriteByte('|')
		t.Rest.writeKey(builder)
	}
}

func literalKey(value any) string {
	switch value := value.(type) {
	case bool:
		return strconv.FormatBool(value)
	case float64:
		return strconv.FormatFloat(value, 'g', -1, 64)
	default:
		text, _ := value.(string)

		return strconv.Quote(text)
	}
}

// Union creates a union of types. Nested unions are flattened, duplicates removed, and literals (and integer) dropped
// when their primitive is also a member.
func Union(members ...*Type) *Type {
	flat := flatten(KindUnion, members)
	if slices.ContainsFunc(flat, func(member *Type) bool { return member.Is(Unknown) }) {
		return UnknownType
	}

	primitives := map[Class]bool{}

	for _, member := range flat {
		if member.Kind == KindKeyword && member.Keyword != Integer {
			primitives[member.Class()] = true
		}
	}

	seen := map[string]bool{}
	result := []*Type{}

	for _, member := range flat {
		key := member.Key()
		if member.Is(Never) || seen[key] || isSubsumed(member, primitives) {
			continue
		}

		seen[key] = true

		result = append(result, member)
	}

	return combine(KindUnion, result, NeverType)
}

// isSubsumed reports whether a member of a union is redundant next to one of the primitives: a literal or template
// next to its own, or integer next to number.
func isSubsumed(member *Type, primitives map[Class]bool) bool {
	if member.Is(Integer) {
		return primitives[ClassNumber]
	}

	return (member.Kind == KindLiteral || member.Kind == KindTemplate) && primitives[member.Class()]
}

// flatten lists the members of nested types of a kind as members of their own.
func flatten(kind Kind, members []*Type) []*Type {
	var flat []*Type

	for _, member := range members {
		if member.Kind == kind {
			flat = append(flat, member.Members...)
		} else {
			flat = append(flat, member)
		}
	}

	return flat
}

// combine returns the type of members: empty if there are none, the only one, or a type of kind made of them.
func combine(kind Kind, members []*Type, empty *Type) *Type {
	switch len(members) {
	case 0:
		return empty
	case 1:
		return members[0]
	default:
		return composite(kind, members)
	}
}

// Merge object types of an intersection into one object type. A key in both is required if required in either, and
// its type is the intersection of both.
// appendIndex adds the index signatures not already in index.
func appendIndex(index, signatures []Index) []Index {
	for _, signature := range signatures {
		if !slices.ContainsFunc(index, func(other Index) bool {
			return other.Key.Key() == signature.Key.Key() && other.Value.Key() == signature.Value.Key()
		}) {
			index = append(index, signature)
		}
	}

	return index
}

func mergeObjects(objects []*Type) *Type {
	var (
		names []string
		index []Index
	)

	properties := map[string]Property{}

	for _, object := range objects {
		for _, property := range object.Properties {
			existing, ok := properties[property.Name]
			if !ok {
				names = append(names, property.Name)
				properties[property.Name] = property

				continue
			}

			merged := Property{
				Doc:      existing.Doc,
				Name:     property.Name,
				Optional: existing.Optional && property.Optional,
				// The first pointer either has
				Pointer: existing.Pointer,
				Type:    Intersection(existing.Type, property.Type),
			}
			if merged.Doc == nil {
				merged.Doc = property.Doc
			}

			if merged.Pointer == "" {
				merged.Pointer = property.Pointer
			}

			properties[property.Name] = merged
		}

		index = appendIndex(index, object.Index)
	}

	merged := make([]Property, len(names))
	for i, name := range names {
		merged[i] = properties[name]
	}

	return Object(merged, index)
}

// Merge the arrays of an intersection (and at most one tuple) into one, intersecting their items, e.g.
// `string[] & [unknown, ...unknown[]]` => `[string, ...string[]]`. Two tuples are left as an intersection.
func mergeArrays(members []*Type) []*Type {
	isArray := func(member *Type) bool { return member.Kind == KindArray }
	isTuple := func(member *Type) bool { return member.Kind == KindTuple }
	arrays := slices.DeleteFunc(slices.Clone(members), func(member *Type) bool { return !isArray(member) })
	tuples := slices.DeleteFunc(slices.Clone(members), func(member *Type) bool { return !isTuple(member) })

	if len(arrays) == 0 || len(tuples) > 1 || (len(tuples) == 0 && len(arrays) == 1) {
		return members
	}

	others := slices.DeleteFunc(slices.Clone(members), func(member *Type) bool {
		return isArray(member) || isTuple(member)
	})

	elements := make([]*Type, len(arrays))
	for index, array := range arrays {
		elements[index] = array.Element
	}

	element := Intersection(elements...)
	if len(tuples) == 0 {
		return append(others, Array(element))
	}

	return append(others, intersectTuple(tuples[0], element))
}

// intersectTuple intersects each item of a tuple with the item type of an array.
func intersectTuple(tuple, element *Type) *Type {
	elements := make([]Element, len(tuple.Elements))

	for index, item := range tuple.Elements {
		elements[index] = Element{Optional: item.Optional, Type: Intersection(item.Type, element)}
	}

	var rest *Type
	if tuple.Rest != nil {
		rest = Intersection(tuple.Rest, element)
	}

	return Tuple(elements, rest)
}

// Intersect types none of which are unions.
//
//nolint:cyclop,funlen // The steps of one simplification, which only make sense together
func intersectFlat(members []*Type) *Type {
	classes := map[Class]bool{}

	for _, member := range members {
		if member.Is(Never) {
			return NeverType
		}

		if class := member.Class(); class != ClassNone {
			classes[class] = true
		}
	}

	if len(classes) > 1 {
		return NeverType
	}

	seen := map[string]bool{}

	var objects, literals, others []*Type

	for _, member := range members {
		key := member.Key()
		if member.Is(Unknown) || seen[key] {
			continue
		}

		seen[key] = true

		switch member.Kind {
		case KindObject:
			objects = append(objects, member)
		case KindLiteral:
			literals = append(literals, member)
		case KindKeyword, KindTuple, KindArray, KindIntersection, KindReference, KindTemplate, KindUnion:
			others = append(others, member)
		}
	}

	if len(literals) > 1 {
		// Literals are only equal if they are the same key
		return NeverType
	}

	if len(literals) == 1 {
		// Integer is redundant next to an integer literal, and contradicts any other
		var err bool

		others, err = dropInteger(others, literals[0])
		if err {
			return NeverType
		}
	}

	var kept []*Type
	if len(objects) > 0 {
		kept = append(kept, mergeObjects(objects))
	}

	kept = append(kept, literals...)
	kept = append(kept, others...)

	// A type that allows every value of its class (e.g. `string` or `unknown[]`) is redundant next to a narrower type
	// of the same class, e.g. `string & 'a'`
	var narrowed []*Type

	for _, member := range kept {
		if !member.isClassTop() || !slices.ContainsFunc(kept, func(other *Type) bool {
			return other != member && other.Class() == member.Class()
		}) {
			narrowed = append(narrowed, member)
		}
	}

	narrowed = mergeArrays(narrowed)

	switch len(narrowed) {
	case 0:
		return UnknownType
	case 1:
		return narrowed[0]
	default:
		return composite(KindIntersection, narrowed)
	}
}

// dropInteger removes integer from the members of an intersection with a literal, and reports a contradiction when
// the literal is a number with a fraction.
func dropInteger(members []*Type, literal *Type) ([]*Type, bool) {
	if !slices.ContainsFunc(members, func(member *Type) bool { return member.Is(Integer) }) {
		return members, false
	}

	number, isNumber := literal.Literal.(float64)
	if isNumber && number != float64(int64(number)) {
		return nil, true
	}

	return slices.DeleteFunc(members, func(member *Type) bool { return member.Is(Integer) }), false
}

// Intersection creates an intersection of types. Nested intersections are flattened, unknown dropped, and unions
// distributed when small enough, so impossible combinations reduce to never.
func Intersection(members ...*Type) *Type {
	flat := flatten(KindIntersection, members)
	unions := slices.DeleteFunc(slices.Clone(flat), func(member *Type) bool { return member.Kind != KindUnion })
	nonUnions := slices.DeleteFunc(slices.Clone(flat), func(member *Type) bool { return member.Kind == KindUnion })

	// Only primitives and arrays reduce when distributed, e.g. `(string | null) & string` => `string`. Objects would
	// only be repeated in each member, e.g. `{ a: string } & ({ b?: never } | { c: number })`
	canReduce := slices.ContainsFunc(nonUnions, reduces)
	combinations := 1

	for _, member := range unions {
		combinations *= len(member.Members)
		canReduce = canReduce || slices.ContainsFunc(member.Members, reduces)
	}

	// A single union only distributes over the other members, which never grows the type
	if !canReduce || len(unions) == 0 || (len(unions) > 1 && combinations > maxDistributedMembers) {
		return intersectFlat(flat)
	}

	return Union(distribute(nonUnions, unions)...)
}

// distribute intersects each combination of one member of every union with the other members.
func distribute(nonUnions, unions []*Type) []*Type {
	distributed := [][]*Type{nonUnions}

	for _, member := range unions {
		var next [][]*Type

		for _, combination := range distributed {
			for _, option := range member.Members {
				next = append(next, append(slices.Clip(combination), option))
			}
		}

		distributed = next
	}

	intersections := make([]*Type, len(distributed))
	for index, combination := range distributed {
		intersections[index] = Intersection(combination...)
	}

	return intersections
}

func reduces(member *Type) bool {
	class := member.Class()

	return class != ClassNone && class != ClassObject
}

// Exclude removes members of a union that are exactly one of excluded. Used for `not`, where only an exact match can
// be removed safely.
func Exclude(union *Type, excluded []*Type) *Type {
	keys := map[string]bool{}
	for _, member := range excluded {
		keys[member.Key()] = true
	}

	members := []*Type{union}
	if union.Kind == KindUnion {
		members = union.Members
	}

	var kept []*Type

	for _, member := range members {
		if !keys[member.Key()] {
			kept = append(kept, member)
		}
	}

	return Union(kept...)
}
