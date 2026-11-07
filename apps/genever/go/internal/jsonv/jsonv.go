// Package jsonv decodes JSON into values that keep the order of object keys, as JavaScript's JSON.parse does.
//
// genever reads keywords, properties and definitions in the order a schema writes them: it decides the order of
// generated fields and types, and which of several mistakes is reported. A map would lose it.
package jsonv

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
)

// A Value is a decoded JSON value: nil, bool, float64, string, []Value or *Object.
type Value = any

// An Object is a JSON object, with its keys in the order they were first written.
type Object struct {
	values map[string]Value
	keys   []string
}

// NewObject returns an empty object.
func NewObject() *Object {
	return &Object{values: map[string]Value{}, keys: nil}
}

// Set sets a key's value. A new key goes last, and an existing one keeps its place, as in JavaScript.
func (o *Object) Set(key string, value Value) {
	if _, ok := o.values[key]; !ok {
		o.keys = append(o.keys, key)
	}

	o.values[key] = value
}

// Get returns a key's value, and whether the object has the key.
func (o *Object) Get(key string) (any, bool) {
	value, ok := o.values[key]

	return value, ok
}

// Keys returns the object's keys, in order.
func (o *Object) Keys() []string {
	return o.keys
}

// Len returns the number of keys.
func (o *Object) Len() int {
	return len(o.keys)
}

// ErrSyntax is wrapped by every error Parse returns.
var ErrSyntax = errors.New("invalid JSON")

// Parse decodes one JSON document. A duplicate key keeps its first place and its last value, as JSON.parse does, and a
// number too large for a float64 is infinite.
func Parse(data []byte) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()

	value, err := parseValue(decoder)
	if err != nil {
		return nil, err
	}

	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("%w: more than one value", ErrSyntax)
	}

	return value, nil
}

func parseValue(decoder *json.Decoder) (any, error) {
	token, err := decoder.Token()
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrSyntax, err)
	}

	switch token := token.(type) {
	case json.Delim:
		if token == '[' {
			return parseArray(decoder)
		}

		return parseObject(decoder)
	case json.Number:
		// Out of range is an infinity, which JSON.parse gives too
		number, _ := strconv.ParseFloat(token.String(), 64)

		return number, nil
	default:
		// nil, a bool or a string
		return token, nil
	}
}

func parseArray(decoder *json.Decoder) ([]Value, error) {
	values := []Value{}

	for decoder.More() {
		value, err := parseValue(decoder)
		if err != nil {
			return nil, err
		}

		values = append(values, value)
	}

	// The closing bracket: the decoder already rejected anything else
	_, _ = decoder.Token()

	return values, nil
}

func parseObject(decoder *json.Decoder) (*Object, error) {
	object := NewObject()

	for decoder.More() {
		// A key: the decoder already rejected anything else
		key, _ := decoder.Token()

		value, err := parseValue(decoder)
		if err != nil {
			return nil, err
		}

		keyString, _ := key.(string)
		object.Set(keyString, value)
	}

	_, _ = decoder.Token()

	return object, nil
}

// Stringify encodes a value as JavaScript's JSON.stringify does without indentation, for messages and documentation
// that should read the same as genever's. A non-finite number is null, as in JavaScript.
func Stringify(value Value) string {
	var builder strings.Builder

	stringify(&builder, value)

	return builder.String()
}

func stringify(builder *strings.Builder, value Value) {
	switch value := value.(type) {
	case bool:
		builder.WriteString(strconv.FormatBool(value))
	case float64:
		builder.WriteString(FormatNumber(value))
	case string:
		builder.WriteString(Quote(value))
	case []Value:
		stringifyArray(builder, value)
	case *Object:
		stringifyObject(builder, value)
	default:
		builder.WriteString("null")
	}
}

func stringifyArray(builder *strings.Builder, values []Value) {
	builder.WriteByte('[')

	for i, element := range values {
		if i > 0 {
			builder.WriteByte(',')
		}

		stringify(builder, element)
	}

	builder.WriteByte(']')
}

func stringifyObject(builder *strings.Builder, object *Object) {
	builder.WriteByte('{')

	for i, key := range object.keys {
		if i > 0 {
			builder.WriteByte(',')
		}

		builder.WriteString(Quote(key))
		builder.WriteByte(':')
		stringify(builder, object.values[key])
	}

	builder.WriteByte('}')
}

// Quote encodes a string as JSON.stringify does: only `"`, `\` and control characters are escaped, and lone
// surrogates can't occur in a Go string.
func Quote(text string) string {
	var builder strings.Builder

	builder.WriteByte('"')

	for _, char := range text {
		switch char {
		case '"', '\\':
			builder.WriteByte('\\')
			builder.WriteRune(char)
		case '\b':
			builder.WriteString(`\b`)
		case '\f':
			builder.WriteString(`\f`)
		case '\n':
			builder.WriteString(`\n`)
		case '\r':
			builder.WriteString(`\r`)
		case '\t':
			builder.WriteString(`\t`)
		default:
			if char < ' ' {
				fmt.Fprintf(&builder, `\u%04x`, char)
			} else {
				builder.WriteRune(char)
			}
		}
	}

	builder.WriteByte('"')

	return builder.String()
}

// Range of magnitudes JavaScript writes without an exponent.
const (
	smallestPlain = 1e-6
	largestPlain  = 1e21
)

// FormatNumber writes a number as JavaScript's Number.prototype.toString does: the shortest digits that read back
// as the same number, with an exponent only below 1e-6 or from 1e21.
func FormatNumber(number float64) string {
	if math.IsNaN(number) || math.IsInf(number, 0) {
		return "null"
	}

	if number == 0 {
		// Also -0, which JavaScript writes as 0
		return "0"
	}

	magnitude := math.Abs(number)
	if magnitude >= smallestPlain && magnitude < largestPlain {
		return strconv.FormatFloat(number, 'f', -1, 64)
	}

	// Go writes `1e-07` and `1e+21`, JavaScript `1e-7` and `1e+21`
	mantissa, exponent, _ := strings.Cut(strconv.FormatFloat(number, 'e', -1, 64), "e")
	sign, digits := exponent[:1], strings.TrimLeft(exponent[1:], "0")

	return mantissa + "e" + sign + digits
}

// Equal reports whether two values are the same JSON value: objects with the same keys and values, in any order.
func Equal(left, right Value) bool {
	switch left := left.(type) {
	case []Value:
		other, ok := right.([]Value)

		return ok && equalArrays(left, other)
	case *Object:
		other, ok := right.(*Object)

		return ok && equalObjects(left, other)
	default:
		return left == right
	}
}

func equalArrays(left, right []Value) bool {
	if len(left) != len(right) {
		return false
	}

	for i := range left {
		if !Equal(left[i], right[i]) {
			return false
		}
	}

	return true
}

func equalObjects(left, right *Object) bool {
	if left.Len() != right.Len() {
		return false
	}

	for key, value := range left.values {
		other, ok := right.values[key]
		if !ok || !Equal(value, other) {
			return false
		}
	}

	return true
}
