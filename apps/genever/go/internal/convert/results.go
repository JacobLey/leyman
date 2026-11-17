package convert

import (
	"cmp"
	"slices"
	"strconv"

	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// A Result is an operation's `<Id>Result`: what a handler answers with, or a client gets back. It has a field for each
// response the operation documents, of which one is set.
type Result struct {
	// Fields are in status order: each range after the codes in it, and `default` last.
	Fields []ResultField
}

// A ResultField is the field of one documented response in an operation's result.
type ResultField struct {
	// Doc is the response's own documentation, if it has any.
	Doc *model.Doc
	// Name is the field's: the reason phrase of the status (`NotFound`), `Status<Code>` for a status without one,
	// `Status<Range>` for a range (`Status4XX`), or `Default`. Unique within the result, as each status is.
	Name string
	// Status is the response's key in `responses`: a code, such as `404`, a range, such as `4XX`, or `default`.
	Status string
	// Body is the named type of the response's JSON body, or "" without JSON content.
	Body string
	// Wrapper, for a range or `default`, is the named type holding a response's status with its body, as the status
	// could be any of several. It is "" for a code.
	Wrapper string
	// Pointer is the JSON Pointer to the response.
	Pointer string
}

// The keys of `responses` a result has a field for, other than codes: a range of codes (`4XX`, uppercase as the OpenAPI
// specification writes it, https://spec.openapis.org/oas/v3.1.1.html#patterned-fields-0) or every other code.
const (
	rangeSuffix = "XX"
	keyDefault  = "default"
)

// The codes a status may be, as RFC 9110 §15 defines them: https://www.rfc-editor.org/rfc/rfc9110#section-15.
const (
	minStatus = 100
	maxStatus = 599
)

// reasonPhrases are the field names of statuses with a reason phrase in the IANA HTTP Status Code Registry
// (https://www.iana.org/assignments/http-status-codes), in Go identifier form: RFC 9110 §15's own
// (https://www.rfc-editor.org/rfc/rfc9110#section-15), such as `ContentTooLarge` for 413, rather than those of earlier
// RFCs net/http's StatusText keeps, and those of the other RFCs registered there, such as `TooManyRequests` for 429.
// Unused (306, 418), obsoleted (510) and temporary registrations are left out, so those statuses are `Status<Code>`.
// The table is fixed, so a registration never renames a field.
//
//nolint:gochecknoglobals // Never changed
var reasonPhrases = map[int]string{
	100: "Continue", 101: "SwitchingProtocols", 102: "Processing", 103: "EarlyHints",
	200: "OK", 201: "Created", 202: "Accepted", 203: "NonAuthoritativeInformation", 204: "NoContent",
	205: "ResetContent", 206: "PartialContent", 207: "MultiStatus", 208: "AlreadyReported", 226: "IMUsed",
	300: "MultipleChoices", 301: "MovedPermanently", 302: "Found", 303: "SeeOther", 304: "NotModified",
	305: "UseProxy", 307: "TemporaryRedirect", 308: "PermanentRedirect",
	400: "BadRequest", 401: "Unauthorized", 402: "PaymentRequired", 403: "Forbidden", 404: "NotFound",
	405: "MethodNotAllowed", 406: "NotAcceptable", 407: "ProxyAuthenticationRequired", 408: "RequestTimeout",
	409: "Conflict", 410: "Gone", 411: "LengthRequired", 412: "PreconditionFailed", 413: "ContentTooLarge",
	414: "URITooLong", 415: "UnsupportedMediaType", 416: "RangeNotSatisfiable", 417: "ExpectationFailed",
	421: "MisdirectedRequest", 422: "UnprocessableContent", 423: "Locked", 424: "FailedDependency",
	425: "TooEarly", 426: "UpgradeRequired", 428: "PreconditionRequired", 429: "TooManyRequests",
	431: "RequestHeaderFieldsTooLarge", 451: "UnavailableForLegalReasons",
	500: "InternalServerError", 501: "NotImplemented", 502: "BadGateway", 503: "ServiceUnavailable",
	504: "GatewayTimeout", 505: "HTTPVersionNotSupported", 506: "VariantAlsoNegotiates",
	507: "InsufficientStorage", 508: "LoopDetected", 511: "NetworkAuthenticationRequired",
}

// statusField is the field name of a key of `responses`, as ResultField.Name describes it, and where it goes in status
// order: a code at twice itself, a range just after its last code (`4XX` after `499`), and default after them all, so
// no two keys share a place and the order never depends on the sort. It is false for a key that is no status, such as
// `600`, `0404`, `4xx` or an `x-` extension: no response can have it, so it has no field.
func statusField(key string) (string, int, bool) {
	switch {
	case key == keyDefault:
		return "Default", (maxStatus + 1) * 2, true //nolint:mnd // After the last range
	case len(key) != 3: //nolint:mnd // Codes and ranges are three characters, so `0404` and `+42` are neither
		return "", 0, false
	case key[1:] == rangeSuffix && key[0] >= '1' && key[0] <= '5':
		return "Status" + key, (int(key[0]-'0')*100+99)*2 + 1, true //nolint:mnd // Just after the range's last code
	}

	code, err := strconv.Atoi(key)
	if err != nil || code < minStatus || code > maxStatus {
		return "", 0, false
	}

	if phrase, hasPhrase := reasonPhrases[code]; hasPhrase {
		return phrase, code * 2, true //nolint:mnd // Room for the ranges between codes
	}

	return "Status" + key, code * 2, true //nolint:mnd // Room for the ranges between codes
}

// resultType is the `<Id>Result` of an operation, with bodies the names of its responses' JSON bodies, as responseTypes
// returns them.
func resultType(names *typeNames, item operation, bodies []string) NamedType {
	name := names.reserve(item.baseName() + " Result")

	type ordered struct {
		field ResultField
		order int
	}

	var fields []ordered

	for index, each := range item.responses {
		fieldName, order, isStatus := statusField(each.status)
		if !isStatus {
			continue
		}

		fields = append(fields, ordered{field: ResultField{
			Doc:     each.doc,
			Name:    fieldName,
			Status:  each.status,
			Body:    bodies[index],
			Wrapper: "",
			Pointer: each.pointer,
		}, order: order})
	}

	slices.SortFunc(fields, func(a, b ordered) int {
		return cmp.Compare(a.order, b.order)
	})

	result := &Result{Fields: make([]ResultField, len(fields))}

	for index, each := range fields {
		// Named in field order, so the order of `responses` doesn't decide a wrapper's name
		if _, err := strconv.Atoi(each.field.Status); err != nil {
			each.field.Wrapper = names.reserve(item.baseName() + " Result " + each.field.Status)
		}

		result.Fields[index] = each.field
	}

	return NamedType{
		Doc: operationTypeDoc(
			name+" is a response of operation "+quote(item.label())+
				": exactly one field is set, that of the status answered with.",
			item.doc,
		),
		Type:    nil,
		Result:  result,
		Name:    name,
		Pointer: item.pointer,
	}
}
