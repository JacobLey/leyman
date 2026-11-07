package jsonv_test

import (
	"errors"
	"math"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
)

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
