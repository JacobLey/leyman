package convert_test

import (
	"errors"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// strict are the default options.
func strict() convert.Options {
	return convert.Options{BaseURI: convert.DefaultBaseURI, Dialect: convert.Draft202012, Strict: true}
}

// lax are the default options, outside strict mode.
func lax() convert.Options {
	options := strict()
	options.Strict = false

	return options
}

// rootName names the root type of every converted schema.
const rootName = "Schema"

// convertJSON converts a schema written as JSON, and fails the test on an error that is not a *gerr.Error.
func convertJSON(t *testing.T, schema string, options convert.Options) ([]convert.NamedType, *gerr.Error) {
	t.Helper()

	value, err := jsonv.Parse([]byte(schema))
	if err != nil {
		t.Fatalf("parse %s: %v", schema, err)
	}

	types, err := convert.Convert(value, rootName, options)

	var geneverError *gerr.Error
	if err != nil && !errors.As(err, &geneverError) {
		t.Fatalf("convert %s: %v is not a *gerr.Error", schema, err)
	}

	return types, geneverError
}

// convertSchema converts a schema written as JSON, and fails the test on an error.
func convertSchema(t *testing.T, schema string, options convert.Options) []convert.NamedType {
	t.Helper()

	types, err := convertJSON(t, schema, options)
	if err != nil {
		t.Fatalf("convert %s: %v", schema, err)
	}

	return types
}

// convertError converts a schema written as JSON, and fails the test unless it errors.
func convertError(t *testing.T, schema string, options convert.Options) *gerr.Error {
	t.Helper()

	_, err := convertJSON(t, schema, options)
	if err == nil {
		t.Fatalf("convert %s: expected an error", schema)
	}

	return err
}

// expectRoot checks the root type of a schema is want.
func expectRoot(t *testing.T, schema string, options convert.Options, want *model.Type) {
	t.Helper()

	types := convertSchema(t, schema, options)
	if got := types[0].Type; got.Key() != want.Key() {
		t.Errorf("schema %s:\n got %s\nwant %s", schema, got.Key(), want.Key())
	}
}

func property(name string, optional bool, propertyType *model.Type) model.Property {
	return model.Property{Doc: nil, Name: name, Optional: optional, Pointer: "", Type: propertyType}
}

func element(optional bool, elementType *model.Type) model.Element {
	return model.Element{Optional: optional, Type: elementType}
}

func index(key, value *model.Type) model.Index {
	return model.Index{Key: key, Value: value}
}

func object(properties ...model.Property) *model.Type {
	return model.Object(properties, nil)
}

// open is an object that keeps the keys it doesn't declare, as an object schema without additionalProperties does.
func open(properties ...model.Property) *model.Type {
	return model.Object(properties, []model.Index{index(model.StringType, model.UnknownType)})
}
