package model_test

import (
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

func lit(value any) *model.Type {
	return model.Literal(value)
}

func prop(name string, t *model.Type, optional bool) model.Property {
	return model.Property{Doc: nil, Type: t, Name: name, Pointer: "", Optional: optional}
}

func object(properties ...model.Property) *model.Type {
	return model.Object(properties, nil)
}

func template(prefix string) *model.Type {
	return model.Template([]model.TemplatePart{{Text: prefix, IsString: false}, {Text: "", IsString: true}})
}

func expectSame(t *testing.T, got, expected *model.Type) {
	t.Helper()

	if got.Key() != expected.Key() {
		t.Errorf("got %s, expected %s", got.Key(), expected.Key())
	}
}

func TestUnion(t *testing.T) {
	t.Parallel()

	expectSame(t, model.Union(), model.NeverType)
	expectSame(t, model.Union(model.StringType), model.StringType)
	expectSame(t, model.Union(model.StringType, model.UnknownType), model.UnknownType)
	expectSame(t, model.Union(model.StringType, lit("a"), template("x")), model.StringType)
	expectSame(t, model.Union(model.IntegerType, model.NumberType, lit(1.0)), model.NumberType)
	expectSame(t, model.Union(model.NeverType, model.StringType, model.StringType), model.StringType)

	nested := model.Union(model.Union(lit("a"), lit("b")), lit("c"), model.IntegerType)
	if nested.Kind != model.KindUnion || len(nested.Members) != 4 {
		t.Fatalf("got %s", nested.Key())
	}
}

func TestIntersection(t *testing.T) {
	t.Parallel()

	expectSame(t, model.Intersection(), model.UnknownType)
	expectSame(t, model.Intersection(model.StringType, model.NeverType), model.NeverType)
	expectSame(t, model.Intersection(model.StringType, model.NumberType), model.NeverType)
	expectSame(t, model.Intersection(model.StringType, lit("a")), lit("a"))
	expectSame(t, model.Intersection(lit("a"), lit("b")), model.NeverType)
	expectSame(t, model.Intersection(model.UnknownType, model.UnknownType, model.BooleanType), model.BooleanType)
	expectSame(t, model.Intersection(model.NumberType, model.IntegerType), model.IntegerType)
	expectSame(t, model.Intersection(model.IntegerType, lit(2.0)), lit(2.0))
	expectSame(t, model.Intersection(model.IntegerType, lit(2.5)), model.NeverType)
	expectSame(t, model.Intersection(model.Union(model.StringType, model.NullType), model.StringType), model.StringType)

	both := model.Intersection(template("a"), template("b"))
	if both.Kind != model.KindIntersection {
		t.Fatalf("got %s", both.Key())
	}

	nested := model.Intersection(both, model.StringType)
	if nested.Kind != model.KindIntersection || len(nested.Members) != 2 {
		t.Fatalf("got %s", nested.Key())
	}
}

func TestIntersectionMergesObjects(t *testing.T) {
	t.Parallel()

	doc := &model.Doc{Description: "d", Title: "", Tags: nil, Deprecated: false}
	first := model.Object([]model.Property{
		{Doc: nil, Type: model.UnknownType, Name: "a", Pointer: "", Optional: true},
		prop("b", model.StringType, true),
	}, []model.Index{{Key: model.StringType, Value: model.NumberType}})
	second := model.Object([]model.Property{
		{Doc: doc, Type: model.StringType, Name: "a", Pointer: "#/a", Optional: false},
		prop("c", model.BooleanType, false),
	}, []model.Index{{Key: model.StringType, Value: model.NumberType}})

	merged := model.Intersection(first, second)
	expected := model.Object([]model.Property{
		prop("a", model.StringType, false),
		prop("b", model.StringType, true),
		prop("c", model.BooleanType, false),
	}, []model.Index{{Key: model.StringType, Value: model.NumberType}})
	expectSame(t, merged, expected)

	if merged.Properties[0].Doc != doc || merged.Properties[0].Pointer != "#/a" {
		t.Fatalf("lost the doc or pointer: %+v", merged.Properties[0])
	}
}

func TestIntersectionMergesArrays(t *testing.T) {
	t.Parallel()

	expectSame(t,
		model.Intersection(model.Array(model.UnknownType), model.Array(model.StringType)),
		model.Array(model.StringType))
	expectSame(t,
		model.Intersection(model.Array(model.Union(model.StringType, model.NullType)), model.Array(model.StringType)),
		model.Array(model.StringType))

	tuple := model.Tuple([]model.Element{{Type: model.UnknownType, Optional: false}}, model.UnknownType)
	expectSame(t,
		model.Intersection(model.Array(model.StringType), tuple),
		model.Tuple([]model.Element{{Type: model.StringType, Optional: false}}, model.StringType))

	closed := model.Tuple([]model.Element{{Type: model.UnknownType, Optional: true}}, nil)
	expectSame(t,
		model.Intersection(model.Array(model.StringType), closed),
		model.Tuple([]model.Element{{Type: model.StringType, Optional: true}}, nil))

	two := model.Intersection(tuple, closed, model.Array(model.StringType))
	if two.Kind != model.KindIntersection {
		t.Fatalf("got %s", two.Key())
	}
}

func TestIntersectionDistributes(t *testing.T) {
	t.Parallel()

	expectSame(t,
		model.Intersection(model.Union(model.StringType, model.NumberType), model.Union(model.StringType, model.NullType)),
		model.StringType)

	// Objects only repeat in each member, so aren't distributed
	objects := model.Intersection(object(prop("a", model.StringType, false)),
		model.Union(object(prop("b", model.NeverType, true)), object(prop("c", model.NumberType, false))))
	if objects.Kind != model.KindIntersection {
		t.Fatalf("got %s", objects.Key())
	}

	// Too many combinations
	prefixes := []string{"a", "b", "c", "d", "e", "f"}

	many := make([]*model.Type, 0, len(prefixes))
	for _, prefix := range prefixes {
		many = append(many, model.Union(template(prefix), model.Array(model.StringType), model.NullType))
	}

	if wide := model.Intersection(many...); wide.Kind != model.KindIntersection {
		t.Fatalf("got %s", wide.Key())
	}
}

func TestExclude(t *testing.T) {
	t.Parallel()

	expectSame(t,
		model.Exclude(model.Union(lit("a"), lit("b"), model.NullType), []*model.Type{model.NullType, lit("b")}),
		lit("a"))
	expectSame(t, model.Exclude(model.NullType, []*model.Type{model.NullType}), model.NeverType)
}

func TestClass(t *testing.T) {
	t.Parallel()

	for expected, types := range map[model.Class][]*model.Type{
		model.ClassBoolean: {model.BooleanType, lit(true)},
		model.ClassNull:    {model.NullType},
		model.ClassNumber:  {model.NumberType, model.IntegerType, lit(1.0)},
		model.ClassString:  {model.StringType, lit("a"), template("a")},
		model.ClassArray:   {model.Array(model.StringType), model.Tuple(nil, nil)},
		model.ClassObject: {
			model.ObjectType, object(),
			model.Union(object(prop("a", lit("x"), false)), object(prop("a", lit("y"), false))),
		},
		model.ClassNone: {
			model.UnknownType, model.NeverType, model.Reference("A"),
			model.Intersection(template("a"), template("b")),
			model.Union(model.StringType, model.NumberType),
			model.Union(object(prop("a", lit("x"), true)), object(prop("a", lit("y"), false))),
		},
	} {
		for _, member := range types {
			if got := member.Class(); got != expected {
				t.Errorf("%s: got %q, expected %q", member.Key(), got, expected)
			}
		}
	}
}

func TestKey(t *testing.T) {
	t.Parallel()

	distinct := []*model.Type{
		model.StringType, model.NumberType, lit("1"), lit(1.0), lit(true), model.Reference("A"), model.Reference("B"),
		template("a"), model.Template([]model.TemplatePart{{Text: "", IsString: true}, {Text: "a", IsString: false}}),
		model.Array(model.StringType), model.Tuple(nil, nil), model.Tuple(nil, model.StringType),
		model.Tuple([]model.Element{{Type: model.StringType, Optional: true}}, nil),
		model.Tuple([]model.Element{{Type: model.StringType, Optional: false}}, nil),
		object(prop("a", model.StringType, true)), object(prop("a", model.StringType, false)),
		model.Object(nil, []model.Index{{Key: model.StringType, Value: model.StringType}}),
		model.Union(lit("a"), lit("b")), model.Intersection(template("a"), template("b")),
	}

	seen := map[string]bool{}
	for _, member := range distinct {
		if seen[member.Key()] {
			t.Errorf("duplicate key %s", member.Key())
		}

		seen[member.Key()] = true
	}
}
