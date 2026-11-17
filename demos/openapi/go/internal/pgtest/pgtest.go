// Package pgtest gives each test a Postgres database of its own, cloned from a template built once from a schema
// file, as pg-dolly does for the TypeScript server's tests. Cloning a template is much faster than applying the schema
// for every test.
package pgtest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"

	"github.com/jackc/pgx/v5"
)

// Template is a database built from a schema file, which each test's database is cloned from.
type Template struct {
	adminURL string
	name     string
}

// Database is a database cloned from a template.
type Database struct {
	Name string
	// URL connects to it, as the admin URL does to its database.
	URL string
}

// uniqueName is a database name no other test, package or worktree's run uses.
func uniqueName(prefix string) string {
	var id [8]byte

	_, _ = rand.Read(id[:])

	return prefix + "_" + hex.EncodeToString(id[:])
}

// withDatabase is a connection URL with another database.
func withDatabase(connURL, name string) (string, error) {
	parsed, err := url.Parse(connURL)
	if err != nil {
		return "", fmt.Errorf("pgtest: %w", err)
	}

	parsed.Path = "/" + name

	return parsed.String(), nil
}

// exec runs SQL on a connection of its own. Without arguments pgx sends it with the simple protocol, so a script of
// several statements runs whole.
func exec(ctx context.Context, connURL, sql string) error {
	conn, err := pgx.Connect(ctx, connURL)
	if err != nil {
		return fmt.Errorf("pgtest: connecting: %w", err)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, sql); err != nil {
		return fmt.Errorf("pgtest: %w", err)
	}

	return nil
}

// NewTemplate builds a template database from a schema file (e.g. one pg_dump wrote), connecting with adminURL,
// whose user may create databases.
func NewTemplate(ctx context.Context, adminURL, schemaPath string) (*Template, error) {
	schema, err := os.ReadFile(schemaPath) //nolint:gosec // A schema file the tests name
	if err != nil {
		return nil, fmt.Errorf("pgtest: %w", err)
	}

	name := uniqueName("pgtest_template")

	templateURL, err := withDatabase(adminURL, name)
	if err != nil {
		return nil, err
	}

	if err := exec(ctx, adminURL, "CREATE DATABASE "+name); err != nil {
		return nil, err
	}

	template := &Template{adminURL: adminURL, name: name}
	if err := exec(ctx, templateURL, string(schema)); err != nil {
		_ = template.Close(ctx)

		return nil, err
	}

	return template, nil
}

// Clone creates a database from the template.
func (t *Template) Clone(ctx context.Context) (Database, error) {
	name := uniqueName("pgtest")
	if err := exec(ctx, t.adminURL, "CREATE DATABASE "+name+" TEMPLATE "+t.name); err != nil {
		return Database{}, err
	}

	connURL, _ := withDatabase(t.adminURL, name) // Parsed when the template was built

	return Database{Name: name, URL: connURL}, nil
}

// Drop drops a database cloned from the template. Close every connection to it first.
func (t *Template) Drop(ctx context.Context, database Database) error {
	return exec(ctx, t.adminURL, "DROP DATABASE "+database.Name)
}

// Close drops the template.
func (t *Template) Close(ctx context.Context) error {
	return exec(ctx, t.adminURL, "DROP DATABASE "+t.name)
}
