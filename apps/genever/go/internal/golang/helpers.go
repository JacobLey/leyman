package golang

// A helper is code a generated file includes when its types use it, so the file has no dependency on genever.
type helper struct {
	// imports the helper's code uses.
	imports []string
	code    string
}

// Go names the generator writes in more than one place.
const (
	goString   = "string"
	goBool     = "bool"
	goFloat    = "float64"
	importJSON = "encoding/json"
)

// Helper names, as types and functions of the generated package.
const (
	helperOptional = "Optional"
	helperNull     = "Null"
	helperNever    = "Never"
	helperKind     = "geneverKind"
	helperExtra    = "geneverExtra"
	helperWith     = "geneverWithExtra"
	helperPick     = "geneverPick"
	helperTuple    = "geneverTuple"
	helperNoMatch  = "geneverNoMatch"
)

//nolint:gochecknoglobals // Never changed, and only read to write files
var helpers = map[string]helper{
	helperOptional: {
		imports: []string{importJSON},
		code: `// Optional is a property that may be absent: Set is false when it is. A field of this type is tagged ` +
			"`omitzero`" + `, so an absent property is left out, and a present one is written even if it is null.
type Optional[T any] struct {
	Value T
	Set   bool
}

// OptionalOf returns a present Optional of a value.
func OptionalOf[T any](value T) Optional[T] {
	return Optional[T]{Value: value, Set: true}
}

// IsZero reports whether the property is absent.
func (o Optional[T]) IsZero() bool {
	return !o.Set
}

// MarshalJSON writes the value.
func (o Optional[T]) MarshalJSON() ([]byte, error) {
	return json.Marshal(o.Value)
}

// UnmarshalJSON reads the value of a present property.
func (o *Optional[T]) UnmarshalJSON(data []byte) error {
	o.Set = true
	return json.Unmarshal(data, &o.Value)
}`,
	},
	helperNull: {
		imports: []string{"errors"},
		code: `// Null is the value null.
type Null struct{}

// MarshalJSON writes null.
func (Null) MarshalJSON() ([]byte, error) {
	return []byte("null"), nil
}

// UnmarshalJSON reads null, and nothing else.
func (*Null) UnmarshalJSON(data []byte) error {
	if string(data) != "null" {
		return errors.New("genever: expected null")
	}
	return nil
}`,
	},
	helperNever: {
		imports: []string{"errors"},
		code: `// Never is a value the schema never accepts: it can't be written or read.
type Never struct{}

// MarshalJSON always fails.
func (Never) MarshalJSON() ([]byte, error) {
	return nil, errors.New("genever: the schema accepts no value here")
}

// UnmarshalJSON always fails.
func (*Never) UnmarshalJSON([]byte) error {
	return errors.New("genever: the schema accepts no value here")
}`,
	},
	helperKind: {
		imports: []string{"bytes"},
		code: `// geneverKind returns the kind of a JSON value by its first byte: n(ull), b(oolean), f (a number), s(tring),
// a(rray) or o(bject).
func geneverKind(data []byte) byte {
	data = bytes.TrimLeft(data, " \t\r\n")
	if len(data) == 0 {
		return 0
	}
	switch data[0] {
	case 'n':
		return 'n'
	case 't', 'f':
		return 'b'
	case '"':
		return 's'
	case '[':
		return 'a'
	case '{':
		return 'o'
	}
	return 'f'
}`,
	},
	helperExtra: {
		imports: []string{importJSON},
		code: `// geneverExtra reads the properties of an object other than the known ones.
func geneverExtra[V any](data []byte, known ...string) (map[string]V, error) {
	var all map[string]json.RawMessage
	if err := json.Unmarshal(data, &all); err != nil {
		return nil, err
	}
	for _, key := range known {
		delete(all, key)
	}
	if len(all) == 0 {
		return nil, nil
	}
	extra := make(map[string]V, len(all))
	for key, raw := range all {
		var value V
		if err := json.Unmarshal(raw, &value); err != nil {
			return nil, err
		}
		extra[key] = value
	}
	return extra, nil
}`,
	},
	helperWith: {
		imports: []string{importJSON},
		code: `// geneverWithExtra adds other properties to an object's JSON.
func geneverWithExtra[V any](object []byte, extra map[string]V) ([]byte, error) {
	if len(extra) == 0 {
		return object, nil
	}
	more, err := json.Marshal(extra)
	if err != nil {
		return nil, err
	}
	if len(object) == 2 {
		return more, nil
	}
	return append(append(object[:len(object)-1:len(object)-1], ','), more[1:]...), nil
}`,
	},
	helperPick: {
		imports: nil,
		code: `// geneverVariant is what geneverPick knows of an object variant of a union: the keys it requires and declares, and
// whether it has no other properties.
type geneverVariant struct {
	required []string
	known    []string
	closed   bool
}

// geneverPick chooses the variant of a union of objects for an object's keys: of those with every key they require,
// and every key of the object if closed, the one declaring the most of the keys. It returns -1 if none can hold it.
func geneverPick[V any](keys map[string]V, variants ...geneverVariant) int {
	best, bestCount := -1, -1
	for i, variant := range variants {
		count := 0
		for _, key := range variant.known {
			if _, ok := keys[key]; ok {
				count++
			}
		}
		if variant.closed && count < len(keys) {
			continue
		}
		hasRequired := true
		for _, key := range variant.required {
			if _, ok := keys[key]; !ok {
				hasRequired = false
			}
		}
		if hasRequired && count > bestCount {
			best, bestCount = i, count
		}
	}
	return best
}`,
	},
	helperTuple: {
		imports: []string{importJSON, "fmt"},
		code: `// geneverTuple reads a JSON array of at least min items, and at most max unless max is negative.
func geneverTuple(data []byte, min, max int) ([]json.RawMessage, error) {
	var items []json.RawMessage
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}
	if len(items) < min || (max >= 0 && len(items) > max) {
		return nil, fmt.Errorf("genever: %d items, where the tuple has %d to %d", len(items), min, max)
	}
	return items, nil
}`,
	},
	helperNoMatch: {
		imports: []string{"fmt"},
		code: `// geneverNoMatch is the error of a union no variant of which can hold a value.
func geneverNoMatch(union string) error {
	return fmt.Errorf("genever: no variant of %s holds the value", union)
}`,
	},
}
