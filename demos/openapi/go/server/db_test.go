package server_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// schemaPath is the database package's schema.sql, which its schema-snapshot target keeps up to date with its
// migrations. It is read by path: project.json lists the package as an implicit dependency.
const schemaPath = "../../database/schema.sql"

// templateName is the database each test's is cloned from, built once per run from schema.sql.
//
//nolint:gochecknoglobals // TestMain sets it, for every test of the package
var templateName string

// uniqueName is a database name no other test, package or worktree's run uses.
func uniqueName(prefix string) string {
	var id [8]byte

	_, _ = rand.Read(id[:])

	return prefix + "_" + hex.EncodeToString(id[:])
}

// databaseURL is DATABASE_URL (the postgres sidecar, which Dagger binds under the same name) with another database.
func databaseURL(name string) string {
	parsed, err := url.Parse(os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}

	parsed.Path = "/" + name

	return parsed.String()
}

func exec(ctx context.Context, sql string) error {
	conn, err := pgx.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return fmt.Errorf("connecting: %w", err)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, sql); err != nil {
		return fmt.Errorf("%s: %w", sql, err)
	}

	return nil
}

// buildTemplate creates the template database from schema.sql, as pg-dolly does for the TypeScript server's tests.
func buildTemplate(ctx context.Context) (string, error) {
	schema, err := os.ReadFile(schemaPath)
	if err != nil {
		return "", fmt.Errorf("reading schema.sql: %w", err)
	}

	name := uniqueName("notes_go_template")
	if err := exec(ctx, "CREATE DATABASE "+name); err != nil {
		return "", err
	}

	conn, err := pgx.Connect(ctx, databaseURL(name))
	if err != nil {
		return "", fmt.Errorf("connecting to the template: %w", err)
	}
	defer conn.Close(ctx)

	// Without arguments, pgx sends the script with the simple protocol, which runs several statements
	if _, err := conn.Exec(ctx, string(schema)); err != nil {
		return "", fmt.Errorf("applying schema.sql: %w", err)
	}

	return name, nil
}

func TestMain(m *testing.M) {
	ctx := context.Background()

	name, err := buildTemplate(ctx)
	if err != nil {
		panic(err)
	}

	templateName = name
	code := m.Run()

	if err := exec(ctx, "DROP DATABASE "+templateName); err != nil {
		panic(err)
	}

	os.Exit(code)
}

// newDatabase is a database of the test's own, cloned from the template, and a pool on it. A failed test's database
// is kept, to look at.
func newDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()

	ctx := context.Background()
	name := uniqueName("notes_go")

	if err := exec(ctx, "CREATE DATABASE "+name+" TEMPLATE "+templateName); err != nil {
		t.Fatal(err)
	}

	pool, err := pgxpool.New(ctx, databaseURL(name))
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		pool.Close()

		if t.Failed() {
			t.Logf("kept database %s", name)

			return
		}

		if err := exec(ctx, "DROP DATABASE "+name); err != nil {
			t.Error(err)
		}
	})

	return pool
}
