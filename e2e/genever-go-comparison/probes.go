package comparison

// A Probe is one JSON value decoded into a tool's type. Go has no union or literal types, so what a type says shows in
// what it holds: a value it accepts must decode, and encode back to the same JSON (so `null` stays apart from an
// absent property, and a union keeps its branch), and a value of the wrong shape must fail to decode. Constraints a Go
// type can't hold, such as `pattern`, are a validator's job, so no probe checks them.
type Probe struct {
	// Feature is what the probe is about, the row it is grouped under in the report.
	Feature string `json:"feature"`
	// Description is what it checks.
	Description string `json:"description"`
	// Value is the JSON decoded.
	Value string `json:"-"`
	// Rejects is whether decoding must fail.
	Rejects bool `json:"-"`
}

// accepts is a probe of a value that must decode, and encode back unchanged.
func accepts(feature, description, value string) Probe {
	return Probe{Feature: feature, Description: "holds " + description, Value: value, Rejects: false}
}

// rejects is a probe of a value of the wrong shape, which must fail to decode.
func rejects(feature, description, value string) Probe {
	return Probe{Feature: feature, Description: "rejects " + description, Value: value, Rejects: true}
}

// jsonSchemaProbes are probes of the type generated from the shared JSON Schema.
//
//nolint:gochecknoglobals // Never changed
var jsonSchemaProbes = []Probe{
	accepts("Nullable", "a string", `{"nullable": "a"}`),
	accepts("Nullable", "null, apart from absent", `{"nullable": null}`),
	rejects("Nullable", "a number", `{"nullable": 1}`),

	accepts("Mixed enum", "a string member", `{"mixed": "a"}`),
	accepts("Mixed enum", "a number member", `{"mixed": 42}`),
	accepts("Mixed enum", "null", `{"mixed": null}`),

	accepts("Tuple", "two numbers", `{"point": [1, 2]}`),
	rejects("Tuple", "a string member", `{"point": ["a", 2]}`),

	accepts("oneOf objects", "one branch", `{"shape": {"kind": "circle", "radius": 1}}`),
	accepts("oneOf objects", "the other branch", `{"shape": {"kind": "square", "side": 2}}`),
	rejects("oneOf objects", "a branch with a property of the wrong type", `{"shape": {"kind": "circle", "radius": "a"}}`),

	accepts("Recursion", "a nested value", `{"tree": {"value": 1, "children": [{"value": 2, "children": [{"value": 3}]}]}}`),
	rejects("Recursion", "a wrong value three levels down",
		`{"tree": {"value": 1, "children": [{"value": 2, "children": [{"value": "a"}]}]}}`),

	accepts("patternProperties", "a matching key", `{"headers": {"x-a": "b"}}`),
	rejects("patternProperties", "a value of the wrong type", `{"headers": {"x-a": 1}}`),

	accepts("Properties", "a string property", `{"id": "usr_1"}`),
	accepts("Properties", "an object's properties", `{"billing": {"card": "a", "address": "b"}}`),
	rejects("Properties", "a property of the wrong type", `{"billing": {"card": 1}}`),
}

// openAPIProbes are probes of the type generated for the shared OpenAPI document's request body, its `Note` component.
//
//nolint:gochecknoglobals // Never changed
var openAPIProbes = []Probe{
	accepts("Request body", "a valid body", `{"id": "note_1"}`),
	rejects("Request body", "a property of the wrong type", `{"id": 1}`),

	accepts("Tuple", "two numbers", `{"id": "note_1", "position": [1, 2]}`),
	rejects("Tuple", "a string member", `{"id": "note_1", "position": ["a", 2]}`),

	accepts("Mixed enum", "a string member", `{"id": "note_1", "status": "open"}`),
	accepts("Mixed enum", "a number member", `{"id": "note_1", "status": 1}`),
	accepts("Mixed enum", "null, apart from absent", `{"id": "note_1", "status": null}`),
}
