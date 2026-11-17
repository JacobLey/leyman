package server_test

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JacobLey/leyman/demos/openapi/go/internal/pgtest"
)

// schemaPath is the database package's schema.sql, which its schema-snapshot target keeps up to date with its
// migrations. It is read by path: project.json lists the package as an implicit dependency.
const schemaPath = "../../database/schema.sql"

// template is what each test's database is cloned from, built once per run. DATABASE_URL is the postgres sidecar,
// which Dagger binds under the same name.
//
//nolint:gochecknoglobals // TestMain owns it, for every test of the package
var template *pgtest.Template

func TestMain(m *testing.M) {
	ctx := context.Background()

	built, err := pgtest.NewTemplate(ctx, os.Getenv("DATABASE_URL"), schemaPath)
	if err != nil {
		panic(err)
	}

	template = built
	code := m.Run()

	if err := template.Close(ctx); err != nil {
		panic(err)
	}

	os.Exit(code)
}

// newDatabase is a database of the test's own, and a pool on it. A failed test's database is kept, to look at.
func newDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()

	ctx := context.Background()

	database, err := template.Clone(ctx)
	if err != nil {
		t.Fatal(err)
	}

	pool, err := pgxpool.New(ctx, database.URL)
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		pool.Close()

		if t.Failed() {
			t.Logf("kept database %s", database.Name)

			return
		}

		if err := template.Drop(ctx, database); err != nil {
			t.Error(err)
		}
	})

	return pool
}
