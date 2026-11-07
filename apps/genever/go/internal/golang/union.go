package golang

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// A variant of a union: a Go type holding some of its values.
type variant struct {
	goType string
	// class of the JSON values it holds, or ClassNone for values of any class.
	class model.Class
	// tags are the discriminator values of an object variant, of the property tagProperty.
	tags        []any
	tagProperty string
	// required and known are the property names of an object variant, and closed if it has no other properties.
	required []string
	known    []string
	closed   bool
}

// Kinds of JSON values, as geneverKind returns them, by class.
//
//nolint:gochecknoglobals // Never changed
var kinds = []struct {
	class model.Class
	kind  byte
}{
	{model.ClassNull, 'n'},
	{model.ClassBoolean, 'b'},
	{model.ClassNumber, 'f'},
	{model.ClassString, 's'},
	{model.ClassArray, 'a'},
	{model.ClassObject, 'o'},
}

func members(typ *model.Type) []*model.Type {
	if typ.Kind == model.KindUnion {
		return typ.Members
	}

	return []*model.Type{typ}
}

// declareUnion writes a union as a struct holding one of its variants, behind an interface only they implement, and
// reads its JSON into the variant whose class it is: an object into the variant its discriminator names, or else the
// one whose required properties it has. A union of only strings is an enum: a string type with a constant for each.
func (g *generator) declareUnion(name string, doc *model.Doc, typ *model.Type) {
	all := members(typ)
	if !slices.ContainsFunc(all, func(member *model.Type) bool { return !isEnum(member) }) {
		g.declareEnum(name, doc, "string", all)

		return
	}

	write := g.reserveDecl()
	iface := g.names.reserve(name + "Variant")
	marker := "is" + iface
	variants := g.variants(name, marker, all)

	var decl strings.Builder

	if comment := docComment(doc); comment != "" {
		decl.WriteString(comment + "//\n")
	}

	variantNames := make([]string, len(variants))
	for i, item := range variants {
		variantNames[i] = item.goType
	}

	fmt.Fprintf(&decl, "// %s holds one of: %s.\ntype %s struct {\n\tValue %s\n}\n\n",
		name, strings.Join(variantNames, ", "), name, iface)
	fmt.Fprintf(&decl, "// %s is a variant of %s.\ntype %s interface {\n\t%s()\n}\n\n", iface, name, iface, marker)
	fmt.Fprintf(&decl, "// MarshalJSON writes the variant.\nfunc (s %s) MarshalJSON() ([]byte, error) {\n"+
		"\treturn %s.Marshal(s.Value)\n}\n\n", name, g.json())
	decl.WriteString(g.unionUnmarshal(name, variants))
	write(decl.String())
}

// variants makes a variant of each member, and of the literals of each class together.
func (g *generator) variants(union, marker string, all []*model.Type) []variant {
	tagProperty, tags := g.discriminator(all)

	var (
		result   []variant
		literals = map[model.Class][]*model.Type{}
	)

	for position, member := range all {
		if member.Kind == model.KindLiteral {
			class := member.Class()
			if literals[class] == nil {
				// Placeholder, filled in once every literal of the class is known
				result = append(result, variant{goType: "", class: class, tags: nil, tagProperty: "", required: nil, known: nil, closed: false})
			}

			literals[class] = append(literals[class], member)

			continue
		}

		hint := union + g.variantSuffix(member)
		if tags != nil && tags[position] != nil {
			hint = union + Identifier(fmt.Sprint(tags[position][0]), "Value")
		}

		item := g.variantOf(member, hint, marker)
		if tags != nil {
			item.tags, item.tagProperty = tags[position], tagProperty
		}

		result = append(result, item)
	}

	for i, item := range result {
		if item.goType == "" {
			result[i].goType = g.literalVariant(union, marker, item.class, literals[item.class])
		}
	}

	return result
}

func (g *generator) variantSuffix(member *model.Type) string {
	switch member.Class() {
	case model.ClassString:
		return "String"
	case model.ClassNumber:
		if member.Is(model.Integer) {
			return "Integer"
		}

		return "Number"
	case model.ClassBoolean:
		return "Boolean"
	case model.ClassArray:
		return "Array"
	case model.ClassObject:
		return "Object"
	case model.ClassNull, model.ClassNone:
	}

	if g.isObjectish(member) {
		return "Object"
	}

	return "Value"
}

// variantOf makes a member of a union a variant: a type of the file with the union's marker method.
func (g *generator) variantOf(member *model.Type, hint, marker string) variant {
	result := variant{goType: "", class: g.memberClass(member), tags: nil, tagProperty: "", required: nil, known: nil, closed: false}

	if result.class == model.ClassObject {
		properties, index := g.shape(member)
		result.closed = len(index) == 0 || g.indexValue(index).Is(model.Never)

		for _, property := range properties {
			result.known = append(result.known, property.Name)
			if !property.Optional {
				result.required = append(result.required, property.Name)
			}
		}
	}

	if member.Kind == model.KindReference && g.aliases[member.Name] {
		result.goType = g.wrap(g.names.reserve(hint), member.Name)
	} else {
		goType := g.goType(member, hint)
		// A named type of the document that isn't an alias is defined, even if not declared yet
		if !g.defined[goType] && g.named[goType] == nil {
			wrapper := g.names.reserve(hint)
			g.defined[wrapper] = true
			g.decls = append(g.decls, fmt.Sprintf("type %s %s", wrapper, goType))
			goType = wrapper
		}

		result.goType = goType
	}

	g.markers[result.goType] = append(g.markers[result.goType], marker)

	return result
}

// wrap declares a struct holding a value of a type that can't have the union's methods, such as an alias.
func (g *generator) wrap(name, inner string) string {
	g.defined[name] = true
	encoding := g.json()
	g.decls = append(g.decls, fmt.Sprintf(`// %[1]s holds a %[2]s.
type %[1]s struct {
	Value %[2]s
}

// MarshalJSON writes the value.
func (s %[1]s) MarshalJSON() ([]byte, error) {
	return %[3]s.Marshal(s.Value)
}

// UnmarshalJSON reads the value.
func (s *%[1]s) UnmarshalJSON(data []byte) error {
	return %[3]s.Unmarshal(data, &s.Value)
}`, name, inner, encoding))

	return name
}

// memberClass is the class of a union member's values, or ClassNone if it holds more than one.
func (g *generator) memberClass(member *model.Type) model.Class {
	if g.includesNull(member) {
		return model.ClassNone
	}

	resolved := g.resolve(member)
	if g.isObjectish(resolved) {
		return model.ClassObject
	}

	return resolved.Class()
}

// literalVariant makes a variant of the literals of a class: an enum of strings or numbers, or a boolean.
func (g *generator) literalVariant(union, marker string, class model.Class, literals []*model.Type) string {
	var name string

	switch class {
	case model.ClassString:
		name = g.names.reserve(union + "String")
		g.declareEnum(name, nil, goString, literals)
	case model.ClassNumber:
		name = g.names.reserve(union + "Number")
		g.declareEnum(name, nil, goFloat, literals)
	// Literals are strings, numbers or booleans
	case model.ClassBoolean, model.ClassNone, model.ClassNull, model.ClassArray, model.ClassObject:
		name = g.names.reserve(union + "Boolean")
		g.defined[name] = true
		g.decls = append(g.decls, fmt.Sprintf("type %s %s", name, goBool))
	}

	g.markers[name] = append(g.markers[name], marker)

	return name
}

// declareEnum writes a type with a constant for each literal.
func (g *generator) declareEnum(name string, doc *model.Doc, base string, literals []*model.Type) {
	g.defined[name] = true

	var decl strings.Builder

	decl.WriteString(docComment(doc))
	fmt.Fprintf(&decl, "type %s %s\n\nconst (\n", name, base)

	for _, literal := range literals {
		constant := g.names.reserve(name + constantSuffix(literal.Literal))
		fmt.Fprintf(&decl, "\t%s %s = %s\n", constant, name, goLiteral(literal.Literal))
	}

	decl.WriteString(")")
	g.decls = append(g.decls, decl.String())
}

func constantSuffix(value any) string {
	if number, ok := value.(float64); ok {
		replacer := strings.NewReplacer("-", "Minus", ".", "Point", "+", "", "e", "E")

		return replacer.Replace(jsonv.FormatNumber(number))
	}

	text, _ := value.(string)

	return Identifier(text, "Empty")
}

// goLiteral writes a literal value as a Go constant expression.
func goLiteral(value any) string {
	switch value := value.(type) {
	case float64:
		return jsonv.FormatNumber(value)
	case bool:
		return strconv.FormatBool(value)
	default:
		text, _ := value.(string)

		return strconv.Quote(text)
	}
}

// discriminator finds a property every object member of a union requires, with literal values that tell them apart.
// It returns the property and each member's values, or no tags if there is no such property.
func (g *generator) discriminator(all []*model.Type) (string, [][]any) {
	var objects []int

	for i, member := range all {
		if g.memberClass(member) == model.ClassObject {
			objects = append(objects, i)
		}
	}

	if len(objects) < 2 { //nolint:mnd // A discriminator tells at least two apart
		return "", nil
	}

	first, _ := g.shape(all[objects[0]])
	for _, candidate := range first {
		if tags := g.tagsOf(all, objects, candidate.Name); tags != nil {
			return candidate.Name, tags
		}
	}

	return "", nil
}

// tagsOf returns each object member's literal values of a property, or nil if one doesn't require it with literal
// values, or two share a value.
func (g *generator) tagsOf(all []*model.Type, objects []int, name string) [][]any {
	tags := make([][]any, len(all))
	seen := map[string]bool{}

	for _, position := range objects {
		properties, _ := g.shape(all[position])
		index := slices.IndexFunc(properties, func(property model.Property) bool { return property.Name == name })

		if index < 0 || properties[index].Optional {
			return nil
		}

		for _, value := range members(g.resolve(properties[index].Type)) {
			if value.Kind != model.KindLiteral || seen[goLiteral(value.Literal)] {
				return nil
			}

			seen[goLiteral(value.Literal)] = true
			tags[position] = append(tags[position], value.Literal)
		}
	}

	return tags
}

// unionUnmarshal reads a value into the first variant of its kind that holds it.
func (g *generator) unionUnmarshal(name string, variants []variant) string {
	var body strings.Builder

	fmt.Fprintf(&body, "// UnmarshalJSON reads a value into the variant that holds it.\n"+
		"func (s *%s) UnmarshalJSON(data []byte) error {\n\tswitch %s(data) {\n", name, g.use(helperKind))

	for _, kind := range kinds {
		var candidates []variant

		for _, item := range variants {
			if item.class == kind.class || item.class == model.ClassNone {
				candidates = append(candidates, item)
			}
		}

		if len(candidates) == 0 {
			continue
		}

		fmt.Fprintf(&body, "\tcase '%c':\n", kind.kind)
		body.WriteString(g.decodeCandidates(kind.class, candidates))
	}

	fmt.Fprintf(&body, "\t}\n\treturn %s(%q)\n}", g.use(helperNoMatch), name)

	return body.String()
}

// decodeCandidates reads a value of a class into one of the variants that may hold it. An object goes to the object
// variant it fits, if any, before the variants of any class are tried in order.
func (g *generator) decodeCandidates(class model.Class, candidates []variant) string {
	if len(candidates) == 1 {
		return g.decodeInto(candidates[0].goType, true)
	}

	var (
		body    strings.Builder
		objects []variant
		others  []variant
	)

	for _, item := range candidates {
		if class == model.ClassObject && item.class == model.ClassObject {
			objects = append(objects, item)
		} else {
			others = append(others, item)
		}
	}

	if len(objects) > 0 {
		body.WriteString(g.decodeObject(objects))
	}

	for _, item := range others {
		body.WriteString(g.decodeInto(item.goType, false))
	}

	return body.String()
}

// decodeInto reads the value into a variant. When it is the only candidate, its error is returned, otherwise the next
// candidate is tried.
func (g *generator) decodeInto(goType string, isOnly bool) string {
	if isOnly {
		return fmt.Sprintf("\t\tvar value %s\n\t\tif err := %s.Unmarshal(data, &value); err != nil {\n\t\t\treturn err\n"+
			"\t\t}\n\t\ts.Value = value\n\t\treturn nil\n", goType, g.json())
	}

	return fmt.Sprintf("\t\t{\n\t\t\tvar value %s\n\t\t\tif err := %s.Unmarshal(data, &value); err == nil {\n"+
		"\t\t\t\ts.Value = value\n\t\t\t\treturn nil\n\t\t\t}\n\t\t}\n", goType, g.json())
}

// decodeObject reads an object into the variant its discriminator names, or else the one whose properties it has.
func (g *generator) decodeObject(candidates []variant) string {
	var body strings.Builder

	encoding := g.json()
	fmt.Fprintf(&body, "\t\tvar keys map[string]%[1]s.RawMessage\n\t\tif err := %[1]s.Unmarshal(data, &keys); err != nil {\n"+
		"\t\t\treturn err\n\t\t}\n", encoding)

	if candidates[0].tags != nil {
		tagProperty := candidates[0].tagProperty
		fmt.Fprintf(&body, "\t\tvar tag any\n\t\t_ = %s.Unmarshal(keys[%q], &tag)\n\t\tswitch tag {\n", encoding, tagProperty)

		for _, item := range candidates {
			values := make([]string, len(item.tags))
			for i, tag := range item.tags {
				values[i] = taggedLiteral(tag)
			}

			fmt.Fprintf(&body, "\t\tcase %s:\n%s", strings.Join(values, ", "), indent(g.decodeInto(item.goType, true)))
		}

		body.WriteString("\t\t}\n")

		return body.String()
	}

	fmt.Fprintf(&body, "\t\tswitch %s(keys", g.use(helperPick))

	for _, item := range candidates {
		fmt.Fprintf(&body, ", geneverVariant{required: %s, known: %s, closed: %t}",
			stringSlice(item.required), stringSlice(item.known), item.closed)
	}

	body.WriteString(") {\n")

	for i, item := range candidates {
		fmt.Fprintf(&body, "\t\tcase %d:\n%s", i, indent(g.decodeInto(item.goType, true)))
	}

	body.WriteString("\t\t}\n")

	return body.String()
}

func stringSlice(items []string) string {
	quoted := make([]string, len(items))
	for i, item := range items {
		quoted[i] = strconv.Quote(item)
	}

	return "[]string{" + strings.Join(quoted, ", ") + "}"
}

// taggedLiteral writes a discriminator value as it decodes into `any`: numbers are float64.
func taggedLiteral(value any) string {
	if number, ok := value.(float64); ok {
		return "float64(" + jsonv.FormatNumber(number) + ")"
	}

	return goLiteral(value)
}
