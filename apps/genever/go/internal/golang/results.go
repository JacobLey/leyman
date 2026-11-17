package golang

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// noContent is the type of the field of a code's response without JSON content: there is no body to hold, only
// whether it is the one set, and an empty struct can't be mistaken for one.
const noContent = "struct{}"

// declareResult writes an operation's result: a struct with a pointer field per documented response, tagged with its
// status, and the methods a server and a client use it through, so neither needs reflection. A range's or default's
// field is a struct of the status with the body, as its status could be any of several, and a server needs it to
// answer and a client to tell which it got.
func (g *generator) declareResult(name string, doc *model.Doc, result *convert.Result) {
	var decl strings.Builder

	decl.WriteString(docComment(doc))
	fmt.Fprintf(&decl, "type %s struct {\n", name)

	for _, field := range result.Fields {
		goType := noContent

		switch {
		case field.Wrapper != "":
			goType = field.Wrapper
		case field.Body != "":
			goType = field.Body
		}

		decl.WriteString(indent(docComment(field.Doc)))
		fmt.Fprintf(&decl, "\t%s *%s `status:%q`\n", field.Name, goType, field.Status)
	}

	decl.WriteString("}")

	for _, field := range result.Fields {
		if field.Wrapper != "" {
			decl.WriteString("\n\n" + wrapperDecl(name, field))
		}
	}

	decl.WriteString("\n\n" + g.responseMethod(name, result))
	decl.WriteString("\n\n" + g.unmarshalResponseMethod(name, result))

	g.decls = append(g.decls, decl.String())
}

// wrapperDecl is the struct of a range's or default's response: its status, and its JSON body if it has one.
func wrapperDecl(result string, field convert.ResultField) string {
	statuses := "from 100 to 599"
	if field.Status != "default" {
		statuses = "from " + field.Status[:1] + "00 to " + field.Status[:1] + "99"
	}

	var decl strings.Builder

	fmt.Fprintf(&decl, "// %s is the %s response of %s.\ntype %s struct {\n", field.Wrapper, field.Status, result,
		field.Wrapper)
	fmt.Fprintf(&decl, "\t// Status is the status answered with: %s, and not one another field of %s documents.\n"+
		"\tStatus int\n", statuses, result)

	if field.Body != "" {
		fmt.Fprintf(&decl, "\t// Body is its JSON body.\n\tBody %s\n", field.Body)
	}

	decl.WriteString("}")

	return decl.String()
}

// statusKeys are the statuses of a result's fields, as Go arguments to geneverStatusKey.
func statusKeys(result *convert.Result) string {
	keys := make([]string, len(result.Fields))
	for index, field := range result.Fields {
		keys[index] = strconv.Quote(field.Status)
	}

	return strings.Join(keys, ", ")
}

// responseMethod is a result's Response method, which a server answers through.
func (g *generator) responseMethod(name string, result *convert.Result) string {
	var method strings.Builder

	fmt.Fprintf(&method, `// Response is the status and body of the one response r sets, the body nil for one without JSON content. ok is
// false when r sets no response or more than one, or a range's or default's Status is not one its field documents.
func (r %s) Response() (status int, body any, ok bool) {
	key, set := "", 0
`, name)

	for _, field := range result.Fields {
		status, value := field.Status, "nil"

		switch {
		case field.Wrapper != "":
			status = "r." + field.Name + ".Status"
			if field.Body != "" {
				value = "r." + field.Name + ".Body"
			}
		case field.Body != "":
			value = "*r." + field.Name
		}

		fmt.Fprintf(&method, "\tif r.%s != nil {\n\t\tstatus, body, key, set = %s, %s, %q, set+1\n\t}\n",
			field.Name, status, value, field.Status)
	}

	fmt.Fprintf(&method, `	if set != 1 || %s(status, %s) != key {
		return 0, nil, false
	}
	return status, body, true
}`, g.use(helperStatus), statusKeys(result))

	return method.String()
}

// unmarshalResponseMethod is a result's UnmarshalResponse method, which a client reads a response through.
func (g *generator) unmarshalResponseMethod(name string, result *convert.Result) string {
	var method strings.Builder

	fmt.Fprintf(&method, `// UnmarshalResponse sets r to the response of status, reading its JSON body from data, and leaving every other field
// unset. The data of a response without JSON content isn't read. It returns false, leaving r as it was, when no field
// documents status, or data doesn't decode.
func (r *%s) UnmarshalResponse(status int, data []byte) (bool, error) {
	switch %s(status, %s) {
`, name, g.use(helperStatus), statusKeys(result))

	for _, field := range result.Fields {
		fmt.Fprintf(&method, "\tcase %q:\n", field.Status)

		value := "&struct{}{}"

		if field.Body != "" {
			fmt.Fprintf(&method, "\t\tvar body %s\n\t\tif err := %s.Unmarshal(data, &body); err != nil {\n"+
				"\t\t\treturn false, err\n\t\t}\n", field.Body, g.json())

			value = "&body"
		}

		if field.Wrapper != "" {
			value = "&" + field.Wrapper + "{Status: status}"
			if field.Body != "" {
				value = "&" + field.Wrapper + "{Status: status, Body: body}"
			}
		}

		fmt.Fprintf(&method, "\t\t*r = %s{%s: %s}\n", name, field.Name, value)
	}

	method.WriteString("\tdefault:\n\t\treturn false, nil\n\t}\n\treturn true, nil\n}")

	return method.String()
}
