package convert

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"go.yaml.in/yaml/v3"
)

// ErrYAML is text that is not a YAML document JSON can hold: a syntax error, more than one document, a tag outside
// the core schema, a key that isn't a scalar, a duplicate key, or a merge key (`<<`) that can't be merged. Its message
// says where.
var ErrYAML = errors.New("invalid YAML")

const (
	tagNull  = "!!null"
	tagBool  = "!!bool"
	tagInt   = "!!int"
	tagFloat = "!!float"
	tagStr   = "!!str"
	tagMerge = "!!merge"
)

// The scalars of the YAML 1.2 core schema, which other spellings (e.g. YAML 1.1's `0b1` or `1_000`) aren't.
var (
	coreInt   = regexp.MustCompile(`^(?:[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+)$`)
	coreFloat = regexp.MustCompile(`^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$`)
	// .inf and .nan, which JSON has no number for.
	coreSpecialFloat = regexp.MustCompile(`^(?:[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$`)
)

// ParseYAML parses a YAML 1.2 document, with only the values JSON has.
//
// Aliases are expanded, and merge keys (`<<`) merged. An alias inside the schema it names, a recursive schema, becomes
// a `$ref` to that schema. Text that isn't a YAML document JSON can hold fails with ErrYAML, and a number JSON has no
// equivalent for (`.inf`, `.nan`), or an alias inside a value that isn't a schema, fails as an invalid schema.
func ParseYAML(data []byte) (any, error) {
	decoder := yaml.NewDecoder(bytes.NewReader(data))

	var document yaml.Node

	err := decoder.Decode(&document)
	if errors.Is(err, io.EOF) {
		// No document is an empty one, which is null
		return nil, nil //nolint:nilnil // JSON null
	}

	if err != nil {
		return nil, yamlError(strings.TrimPrefix(err.Error(), "yaml: "))
	}

	var next yaml.Node
	if err := decoder.Decode(&next); !errors.Is(err, io.EOF) {
		return nil, yamlError("more than one document")
	}

	root := document.Content[0]
	if err := checkNode(root, nil); err != nil {
		return nil, err
	}

	tree := &yamlTree{ancestors: map[*yaml.Node]location{}}

	return tree.copy(root, location{isSchema: true, pointer: "#", resource: "#"})
}

func yamlError(message string) error {
	return fmt.Errorf("%w: %s", ErrYAML, message)
}

func nodeError(node *yaml.Node, problem string) error {
	return yamlError(fmt.Sprintf("%s at line %d, column %d", problem, node.Line, node.Column))
}

// checkNode checks a node, and the nodes inside it, can be read as JSON. ancestors are the collections it is inside.
func checkNode(node *yaml.Node, ancestors []*yaml.Node) error {
	switch node.Kind {
	case yaml.ScalarNode:
		if !slices.Contains([]string{tagNull, tagBool, tagInt, tagFloat, tagStr}, node.Tag) {
			return nodeError(node, "Tag "+node.Tag+" has no JSON equivalent")
		}
	case yaml.MappingNode:
		return checkMapping(node, ancestors)
	case yaml.SequenceNode:
		if node.Tag != "!!seq" {
			return nodeError(node, "Tag "+node.Tag+" has no JSON equivalent")
		}

		for _, item := range node.Content {
			if err := checkNode(item, slices.Concat(ancestors, []*yaml.Node{node})); err != nil {
				return err
			}
		}
	case yaml.AliasNode, yaml.DocumentNode:
		// An alias is checked where its anchor is, and a document is only ever the root's parent
	}

	return nil
}

func checkMapping(node *yaml.Node, ancestors []*yaml.Node) error {
	if node.Tag != "!!map" {
		return nodeError(node, "Tag "+node.Tag+" has no JSON equivalent")
	}

	inside := slices.Concat(ancestors, []*yaml.Node{node})
	keys := map[string]bool{}

	for i := 0; i < len(node.Content); i += 2 {
		key, value := node.Content[i], node.Content[i+1]

		if key.Kind != yaml.ScalarNode {
			return nodeError(key, "Key is not a string")
		}

		if key.Tag == tagMerge {
			if err := checkMerge(key, value, inside); err != nil {
				return err
			}

			continue
		}

		if keys[key.Value] {
			return nodeError(key, "Map keys must be unique")
		}

		keys[key.Value] = true

		if err := checkNode(value, inside); err != nil {
			return err
		}
	}

	return nil
}

// checkMerge checks a merge key's value is a map, or a sequence of maps, any of which can be aliases of a map the
// merge key isn't inside.
func checkMerge(key, value *yaml.Node, ancestors []*yaml.Node) error {
	resolved, err := mergeSource(value, ancestors)
	if err != nil {
		return err
	}

	sources := []*yaml.Node{value}
	if resolved.Kind == yaml.SequenceNode {
		sources = resolved.Content
	}

	for _, source := range sources {
		resolvedSource, err := mergeSource(source, ancestors)
		if err != nil {
			return err
		}

		if resolvedSource.Kind != yaml.MappingNode {
			problem := source
			if source.Kind == yaml.ScalarNode && source.Tag == tagNull && source.Value == "" {
				// An empty value is where its key is
				problem = key
			}

			return nodeError(problem, "Merge key can only merge a map or a sequence of maps")
		}
	}

	return checkNode(value, ancestors)
}

// mergeSource is the node a merge key's value, or a member of it, stands for.
func mergeSource(source *yaml.Node, ancestors []*yaml.Node) (*yaml.Node, error) {
	if source.Kind != yaml.AliasNode {
		return source, nil
	}

	if slices.Contains(ancestors, source.Alias) {
		return nil, nodeError(source, fmt.Sprintf("Merge key's alias *%s is inside the map &%[1]s it merges", source.Value))
	}

	return source.Alias, nil
}

// A location is where a value is in the document.
type location struct {
	// pointer is the JSON Pointer to the value.
	pointer string
	// resource is the JSON Pointer to the schema resource the value is in: the nearest schema with an `$id`, or the
	// root.
	resource string
	// isSchema is whether the value is a schema, rather than a keyword's value.
	isSchema bool
}

func (l location) child(key string, isSchema bool) location {
	return location{pointer: childPointer(l.pointer, key), resource: l.resource, isSchema: isSchema}
}

// A yamlTree copies a YAML document as JSON.
type yamlTree struct {
	// ancestors are the collections the node being copied is inside, and where each is.
	ancestors map[*yaml.Node]location
}

func (t *yamlTree) copy(node *yaml.Node, where location) (any, error) {
	if node.Kind == yaml.AliasNode {
		if ancestor, ok := t.ancestors[node.Alias]; ok {
			return aliasReference(ancestor, where)
		}

		return t.copy(node.Alias, where)
	}

	switch node.Kind {
	case yaml.MappingNode:
		return t.copyMapping(node, where)
	case yaml.SequenceNode:
		t.ancestors[node] = where
		defer delete(t.ancestors, node)

		items := make([]jsonv.Value, 0, len(node.Content))

		for i, item := range node.Content {
			copied, err := t.copy(item, where.child(strconv.Itoa(i), false))
			if err != nil {
				return nil, err
			}

			items = append(items, copied)
		}

		return items, nil
	case yaml.ScalarNode, yaml.AliasNode, yaml.DocumentNode:
		// An alias is resolved above, and a document is only ever the root's parent
	}

	return scalarValue(node, where.pointer)
}

// aliasReference is a `$ref` to the schema an alias names, in place of the alias inside it.
func aliasReference(target, where location) (any, error) {
	if !target.isSchema || !where.isSchema {
		return nil, gerr.Invalid("YAML alias contains itself, but only a schema can be recursive", where.pointer)
	}

	if target.resource != where.resource {
		return nil, gerr.Unsupported("YAML alias contains itself, with an $id in between", where.pointer)
	}

	ref := jsonv.NewObject()
	// Pointers are already in their URI fragment form
	ref.Set("$ref", "#"+strings.TrimPrefix(target.pointer, target.resource))

	return ref, nil
}

func (t *yamlTree) copyMapping(node *yaml.Node, where location) (any, error) {
	// A schema with an `$id` is a resource of its own, unless the `$id` names a plain anchor (draft 7)
	if id, ok := mappingValue(node, "$id"); ok && where.isSchema && id.Kind == yaml.ScalarNode && id.Tag == tagStr &&
		!strings.HasPrefix(id.Value, "#") {
		where.resource = where.pointer
	}

	t.ancestors[node] = where
	defer delete(t.ancestors, node)

	return t.copyEntries(mappingEntries(node), func(key string, value *yaml.Node) (any, error) {
		return t.copyEntry(key, value, where)
	})
}

// A mappingEntry is a key of a map, and its value.
type mappingEntry struct {
	value *yaml.Node
	key   string
}

// mappingEntries are the keys of a map and their values, in order, with its merge keys merged: a merged key the map
// doesn't have yet is added, the first map's first, and a key of the map's own replaces a merged one's value.
func mappingEntries(node *yaml.Node) []mappingEntry {
	var entries []mappingEntry

	positions := map[string]int{}
	add := func(key string, value *yaml.Node, replaces bool) {
		if position, ok := positions[key]; ok {
			if replaces {
				entries[position].value = value
			}

			return
		}

		positions[key] = len(entries)
		entries = append(entries, mappingEntry{value: value, key: key})
	}

	for i := 0; i < len(node.Content); i += 2 {
		key, value := node.Content[i], node.Content[i+1]

		if key.Tag != tagMerge {
			add(key.Value, value, true)

			continue
		}

		sources := []*yaml.Node{resolveAlias(value)}
		if sources[0].Kind == yaml.SequenceNode {
			sources = sources[0].Content
		}

		for _, source := range sources {
			resolved := resolveAlias(source)
			for j := 0; j < len(resolved.Content); j += 2 {
				add(resolved.Content[j].Value, resolved.Content[j+1], false)
			}
		}
	}

	return entries
}

// copyEntries copies the values of a map's entries in the order of SortedKeys, which decides which of several
// mistakes is reported, into an object with the keys in the map's order.
func (t *yamlTree) copyEntries(
	entries []mappingEntry, copyValue func(string, *yaml.Node) (any, error),
) (*jsonv.Object, error) {
	keys := make([]string, len(entries))
	values := make(map[string]*yaml.Node, len(entries))

	for i, entry := range entries {
		keys[i] = entry.key
		values[entry.key] = entry.value
	}

	copied := make(map[string]any, len(entries))

	for _, key := range slices.SortedFunc(slices.Values(keys), jsonv.CompareCodeUnits) {
		value, err := copyValue(key, values[key])
		if err != nil {
			return nil, err
		}

		copied[key] = value
	}

	object := jsonv.NewObject()
	for _, key := range keys {
		object.Set(key, copied[key])
	}

	return object, nil
}

// copyEntry copies a map's value: a schema, a collection of schemas, or another value.
func (t *yamlTree) copyEntry(key string, value *yaml.Node, where location) (any, error) {
	if !where.isSchema {
		return t.copy(value, where.child(key, false))
	}

	if slices.Contains(schemaKeywords, key) {
		return t.copy(value, where.child(key, true))
	}

	if slices.Contains(schemaMapKeywords, key) ||
		(slices.Contains(schemaArrayKeywords, key) && resolveAlias(value).Kind == yaml.SequenceNode) {
		return t.copyCollection(value, where.child(key, false))
	}

	return t.copy(value, where.child(key, false))
}

// copyCollection copies a keyword's array or map of schemas.
func (t *yamlTree) copyCollection(node *yaml.Node, where location) (any, error) {
	resolved := resolveAlias(node)
	if _, inside := t.ancestors[resolved]; inside ||
		(resolved.Kind != yaml.SequenceNode && resolved.Kind != yaml.MappingNode) {
		// Not a collection (which the schema is invalid for), or one inside itself
		return t.copy(node, where)
	}

	t.ancestors[resolved] = where
	defer delete(t.ancestors, resolved)

	if resolved.Kind == yaml.SequenceNode {
		items := make([]jsonv.Value, 0, len(resolved.Content))

		for i, item := range resolved.Content {
			copied, err := t.copy(item, where.child(strconv.Itoa(i), true))
			if err != nil {
				return nil, err
			}

			items = append(items, copied)
		}

		return items, nil
	}

	var entries []mappingEntry
	for i := 0; i < len(resolved.Content); i += 2 {
		entries = append(entries, mappingEntry{value: resolved.Content[i+1], key: resolved.Content[i].Value})
	}

	return t.copyEntries(entries, func(key string, value *yaml.Node) (any, error) {
		return t.copy(value, where.child(key, true))
	})
}

func resolveAlias(node *yaml.Node) *yaml.Node {
	if node.Kind == yaml.AliasNode {
		return node.Alias
	}

	return node
}

// mappingValue is the value of a key of a map.
func mappingValue(node *yaml.Node, key string) (*yaml.Node, bool) {
	for i := 0; i < len(node.Content); i += 2 {
		if node.Content[i].Value == key && node.Content[i].Tag != tagMerge {
			return resolveAlias(node.Content[i+1]), true
		}
	}

	return nil, false
}

// scalarValue is the JSON value of a scalar, as the YAML 1.2 core schema resolves it: a plain scalar by its text, and
// one with a tag by that tag. A spelling outside the core schema is a string.
func scalarValue(node *yaml.Node, pointer string) (any, error) {
	text := node.Value

	tag := node.Tag
	if node.Style == 0 {
		tag = coreTag(text)
	}

	if tag == tagNull {
		return nil, nil //nolint:nilnil // JSON null
	}

	if value, isBool := coreBool(text); tag == tagBool && isBool {
		return value, nil
	}

	number, isNumber := coreNumber(text, tag)
	if !isNumber {
		return text, nil
	}

	if math.IsInf(number, 0) || math.IsNaN(number) {
		return nil, gerr.Invalid("YAML number "+text+" has no JSON equivalent", pointer)
	}

	return number, nil
}

// coreTag is the tag the core schema gives a plain scalar.
func coreTag(text string) string {
	_, isBool := coreBool(text)

	switch {
	case slices.Contains([]string{"", "~", "null", "Null", "NULL"}, text):
		return tagNull
	case isBool:
		return tagBool
	case coreInt.MatchString(text):
		return tagInt
	case coreFloat.MatchString(text) || coreSpecialFloat.MatchString(text):
		return tagFloat
	default:
		return tagStr
	}
}

// coreBool is the value of a boolean of the core schema, and whether text is one.
func coreBool(text string) (bool, bool) {
	switch text {
	case "true", "True", "TRUE":
		return true, true
	case "false", "False", "FALSE":
		return false, true
	default:
		return false, false
	}
}

// coreNumber is the value of a number of the core schema with a tag, and whether text is one. `.inf` and `.nan` are
// NaN.
func coreNumber(text, tag string) (float64, bool) {
	switch {
	case tag == tagInt && coreInt.MatchString(text):
		return coreIntValue(text), true
	case tag == tagFloat && coreFloat.MatchString(text):
		number, _ := strconv.ParseFloat(text, 64)

		return number, true
	case tag == tagFloat && coreSpecialFloat.MatchString(text):
		return math.NaN(), true
	default:
		return 0, false
	}
}

// coreIntValue is the value of an integer of the core schema: decimal, octal (`0o`), or hexadecimal (`0x`).
func coreIntValue(text string) float64 {
	digits, base := text, 10

	switch {
	case strings.HasPrefix(text, "0x"):
		digits, base = text[2:], 16
	case strings.HasPrefix(text, "0o"):
		digits, base = text[2:], 8
	}

	value, _ := new(big.Int).SetString(strings.TrimPrefix(digits, "+"), base)
	number, _ := new(big.Float).SetInt(value).Float64()

	return number
}
