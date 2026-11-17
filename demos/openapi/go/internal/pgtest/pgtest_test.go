package pgtest_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/JacobLey/leyman/demos/openapi/go/internal/pgtest"
)

func writeSchema(t *testing.T, sql string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "schema.sql")
	if err := os.WriteFile(path, []byte(sql), 0o600); err != nil {
		t.Fatal(err)
	}

	return path
}

func TestCloneHasTheSchema(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	template, err := pgtest.NewTemplate(ctx, os.Getenv("DATABASE_URL"), writeSchema(t, "CREATE TABLE a (b int); INSERT INTO a VALUES (1);"))
	if err != nil {
		t.Fatal(err)
	}

	database, err := template.Clone(ctx)
	if err != nil {
		t.Fatal(err)
	}

	conn, err := pgx.Connect(ctx, database.URL)
	if err != nil {
		t.Fatal(err)
	}

	var value int
	if err := conn.QueryRow(ctx, "SELECT b FROM a").Scan(&value); err != nil || value != 1 {
		t.Fatalf("%d %v", value, err)
	}

	_ = conn.Close(ctx)

	if err := template.Drop(ctx, database); err != nil {
		t.Fatal(err)
	}

	if err := template.Close(ctx); err != nil {
		t.Fatal(err)
	}

	// Gone with the template
	if _, err := template.Clone(ctx); err == nil {
		t.Fatal("cloned a dropped template")
	}
}

func TestTemplateErrors(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	adminURL := os.Getenv("DATABASE_URL")
	valid := writeSchema(t, "SELECT 1;")

	for name, test := range map[string]struct{ adminURL, schemaPath string }{
		"no schema":   {adminURL: adminURL, schemaPath: filepath.Join(t.TempDir(), "missing.sql")},
		"bad URL":     {adminURL: "postgres://%zz", schemaPath: valid},
		"unreachable": {adminURL: "postgres://postgres@127.0.0.1:1/postgres?connect_timeout=1", schemaPath: valid},
		"bad schema":  {adminURL: adminURL, schemaPath: writeSchema(t, "NOT SQL")},
	} {
		if _, err := pgtest.NewTemplate(ctx, test.adminURL, test.schemaPath); err == nil {
			t.Errorf("%s: built", name)
		}
	}
}
