package golang

import (
	"go/ast"
	"go/parser"
	"go/token"
)

// A Name is a type's or field's name in generated source, and the JSON Pointer to what it is generated from.
type Name struct {
	Name    string
	Pointer string
	// Offset is the name's byte offset in the source.
	Offset int
}

// fieldKey is a field of a struct, by their names.
type fieldKey struct {
	owner, field string
}

// sourceNames are the names in formatted source of the types and fields generated from part of a document: the named
// types, and the fields of properties under `properties`, in the order they are in the source.
func sourceNames(source []byte, types map[string]string, fields map[fieldKey]string) []Name {
	files := token.NewFileSet()

	// The source was just formatted by go/format, which parses it
	file, _ := parser.ParseFile(files, "", source, parser.SkipObjectResolution)

	var names []Name

	add := func(ident *ast.Ident, pointer string) {
		if pointer != "" {
			names = append(names, Name{Name: ident.Name, Pointer: pointer, Offset: files.Position(ident.Pos()).Offset})
		}
	}

	for _, decl := range file.Decls {
		general, isGeneral := decl.(*ast.GenDecl)
		if !isGeneral || general.Tok != token.TYPE {
			continue
		}

		for _, spec := range general.Specs {
			// A type declaration only has type specs
			typeSpec, _ := spec.(*ast.TypeSpec)
			add(typeSpec.Name, types[typeSpec.Name.Name])

			structType, isStruct := typeSpec.Type.(*ast.StructType)
			if !isStruct {
				continue
			}

			for _, field := range structType.Fields.List {
				for _, ident := range field.Names {
					add(ident, fields[fieldKey{owner: typeSpec.Name.Name, field: ident.Name}])
				}
			}
		}
	}

	return names
}
