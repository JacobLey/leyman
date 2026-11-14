package jsonv_test

import (
	"errors"
	"math"
	"slices"
	"strings"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
)

// SortedKeys sorts by UTF-16 code unit: not as written, nor by byte or code point, which put U+FF5E before U+1F600.
func TestSortedKeys(t *testing.T) {
	t.Parallel()

	value, err := jsonv.Parse([]byte(`{"b": 1, "9": 1, "10": 1, "\uff5e": 1, "\ud83d\ude00": 1, "1": 1}`))
	if err != nil {
		t.Fatal(err)
	}

	expected := []string{"1", "10", "9", "b", "\U0001F600", "\uFF5E"}
	if keys := value.(*jsonv.Object).SortedKeys(); !slices.Equal(keys, expected) { //nolint:forcetypeassert // An object
		t.Errorf("got %q, expected %q", keys, expected)
	}

	if keys := value.(*jsonv.Object).Keys(); keys[0] != "1" { //nolint:forcetypeassert // An object
		t.Errorf("got %q", keys)
	}
}

// Keys are in the order of JavaScript's Object.keys: array indices (canonical, up to 2^32 - 2) first by value, then the
// others as first written.
func TestKeysInJavaScriptOrder(t *testing.T) {
	t.Parallel()

	value, err := jsonv.Parse([]byte(`{"b": 1, "2": 1, "": 1, "01": 1, "1": 1, "4294967295": 1, "4294967294": 1,
		"99999999999999999999": 1, "-1": 1, "1.0": 1, "a": 1, "0": 1, "2": 2}`))
	if err != nil {
		t.Fatal(err)
	}

	expected := []string{
		"0", "1", "2", "4294967294", "b", "", "01", "4294967295", "99999999999999999999", "-1", "1.0", "a",
	}
	if keys := value.(*jsonv.Object).Keys(); !slices.Equal(keys, expected) { //nolint:forcetypeassert // An object
		t.Errorf("got %q, expected %q", keys, expected)
	}
}

func TestParseKeepsKeyOrder(t *testing.T) {
	t.Parallel()

	value, err := jsonv.Parse([]byte(`{"b": 1, "a": [true, null, "x"], "c": {"z": {}, "y": []}, "b": 2}`))
	if err != nil {
		t.Fatal(err)
	}

	object, ok := value.(*jsonv.Object)
	if !ok {
		t.Fatalf("not an object: %#v", value)
	}

	if got := jsonv.Stringify(object); got != `{"b":2,"a":[true,null,"x"],"c":{"z":{},"y":[]}}` {
		t.Fatalf("got %s", got)
	}

	if keys := object.Keys(); len(keys) != 3 || keys[0] != "b" {
		t.Fatalf("got keys %v", keys)
	}

	if object.Len() != 3 {
		t.Fatalf("got %d keys", object.Len())
	}

	if _, ok := object.Get("missing"); ok {
		t.Fatal("found a missing key")
	}
}

func TestParseNumbers(t *testing.T) {
	t.Parallel()

	value, err := jsonv.Parse([]byte(`[1e400, -0, 0.5]`))
	if err != nil {
		t.Fatal(err)
	}

	values, _ := value.([]jsonv.Value)
	if values[0] != math.Inf(1) || values[2] != 0.5 {
		t.Fatalf("got %v", values)
	}
}

func TestParseErrors(t *testing.T) {
	t.Parallel()

	for _, input := range []string{``, `{`, `[`, `[1`, `{"a": 1`, `{"a": 1]`, `[1,`, `{"a": }`, `1 2`, `[}`} {
		if _, err := jsonv.Parse([]byte(input)); !errors.Is(err, jsonv.ErrSyntax) {
			t.Errorf("%q: got %v", input, err)
		}
	}
}

func TestFormatNumber(t *testing.T) {
	t.Parallel()

	for number, expected := range map[float64]string{
		0:                    "0",
		math.Copysign(0, -1): "0",
		1:                    "1",
		-1.5:                 "-1.5",
		1e21:                 "1e+21",
		1.5e-7:               "1.5e-7",
		1e-7:                 "1e-7",
		1e-6:                 "0.000001",
		123456789:            "123456789",
		5e-324:               "5e-324",
		1e300:                "1e+300",
		math.Inf(1):          "null",
		math.NaN():           "null",
	} {
		if got := jsonv.FormatNumber(number); got != expected {
			t.Errorf("%v: got %s, expected %s", number, got, expected)
		}
	}
}

func TestStringify(t *testing.T) {
	t.Parallel()

	object := jsonv.NewObject()
	object.Set("k", "a\"\\\b\f\n\r\t\x01é")
	object.Set("n", nil)
	object.Set("k", "a\"\\\b\f\n\r\t\x01é")

	if got := jsonv.Stringify(object); got != `{"k":"a\"\\\b\f\n\r\t\u0001é","n":null}` {
		t.Fatalf("got %s", got)
	}

	if got := jsonv.Stringify([]jsonv.Value{1.0, false, struct{}{}}); got != `[1,false,null]` {
		t.Fatalf("got %s", got)
	}
}

func TestEqual(t *testing.T) {
	t.Parallel()

	parse := func(text string) jsonv.Value {
		value, err := jsonv.Parse([]byte(text))
		if err != nil {
			t.Fatal(err)
		}

		return value
	}

	for _, pair := range [][2]string{
		{`{"a": 1, "b": [1, {"c": null}]}`, `{"b": [1, {"c": null}], "a": 1}`},
		{`"x"`, `"x"`},
	} {
		if !jsonv.Equal(parse(pair[0]), parse(pair[1])) {
			t.Errorf("%s != %s", pair[0], pair[1])
		}
	}

	const one, list = `{"a": 1}`, `[1]`

	for _, pair := range [][2]string{
		{one, `{"a": 2}`},
		{one, `{"b": 1}`},
		{one, `{"a": 1, "b": 1}`},
		{one, list},
		{list, `[1, 2]`},
		{list, `[2]`},
		{list, `{}`},
		{`1`, `"1"`},
	} {
		if jsonv.Equal(parse(pair[0]), parse(pair[1])) {
			t.Errorf("%s == %s", pair[0], pair[1])
		}
	}
}

// A lone surrogate fails, rather than becoming U+FFFD and merging keys that differ only there. Pairs, and text that
// only looks like an escape, are read.
func TestLoneSurrogates(t *testing.T) {
	t.Parallel()

	for input, escape := range map[string]string{
		`{"\ud800": 1, "\udc00": 2}`: `\ud800`,
		`["ok", "a\uDFFF"]`:          `\uDFFF`,
		`"\ud83d\ud83d\ude00"`:       `\ud83d`,
		`"\ud800\n"`:                 `\ud800`,
		`"\ud800\u0041"`:             `\ud800`,
		`"\ud800"`:                   `\ud800`,
	} {
		_, err := jsonv.Parse([]byte(input))
		if !errors.Is(err, jsonv.ErrSyntax) || !strings.Contains(err.Error(), "lone surrogate "+escape) {
			t.Errorf("%s: got %v", input, err)
		}
	}

	for input, expected := range map[string]string{
		`"\ud83d\ude00\u0041"`: "\U0001F600A",
		`"\\ud800"`:            `\ud800`,
		`"\"\ud83d\udE00"`:     "\"\U0001F600",
	} {
		value, err := jsonv.Parse([]byte(input))
		if err != nil || value != expected {
			t.Errorf("%s: got %q, %v", input, value, err)
		}
	}
}
