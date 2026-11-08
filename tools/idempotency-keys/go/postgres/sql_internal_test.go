package postgres

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// specStatements are the SQL blocks of the spec's Postgres section, each statement apart.
func specStatements(t *testing.T) []string {
	t.Helper()

	spec, err := os.ReadFile("../../SPEC.md")
	if err != nil {
		t.Fatal(err)
	}

	var statements []string

	for _, block := range regexp.MustCompile("(?s)```sql\n(.*?)```").FindAllStringSubmatch(string(spec), -1) {
		for statement := range strings.SplitSeq(strings.TrimSpace(block[1]), "\n\n") {
			statements = append(statements, statement)
		}
	}

	return statements
}

// quoted is a statement of the spec with its table quoted, as every implementation quotes it.
func quoted(statement string) string {
	return strings.ReplaceAll(statement, "idempotency_keys", `"idempotency_keys"`)
}

func TestStatementsAreTheSpecs(t *testing.T) {
	t.Parallel()

	store, err := NewStore(nil, StoreOptions{Table: ""})
	if err != nil {
		t.Fatal(err)
	}

	create, err := CreateTableSQL(StoreOptions{Table: ""})
	if err != nil {
		t.Fatal(err)
	}

	statements := specStatements(t)
	want := []string{strings.TrimSuffix(create, "\n"), store.claimSQL, store.readSQL, store.completeSQL, store.releaseSQL}

	if len(statements) != len(want) {
		t.Fatalf("the spec has %d statements: %q", len(statements), statements)
	}

	for i, statement := range statements {
		if quoted(statement) != want[i] {
			t.Errorf("got\n%s\nwant\n%s", want[i], quoted(statement))
		}
	}

	spec, _ := os.ReadFile("../../SPEC.md")
	if deleteExpired := "`deleteExpired` is `" + strings.ReplaceAll(store.expiredSQL, `"idempotency_keys"`, "idempotency_keys") + "`"; !strings.Contains(string(spec), deleteExpired) {
		t.Errorf("the spec doesn't say %s", deleteExpired)
	}
}

func TestQuoteIdentifier(t *testing.T) {
	t.Parallel()

	for name, want := range map[string]string{
		"":          `"idempotency_keys"`,
		"Keys":      `"Keys"`,
		`a"b`:       `"a""b"`,
		"ñandú":     `"ñandú"`,
		"x.y; DROP": `"x.y; DROP"`,
	} {
		if got, err := quoteIdentifier("table", name); err != nil || got != want {
			t.Errorf("%q: got %s, %v", name, got, err)
		}
	}

	// Bytes, not characters: 32 two-byte characters are 64 bytes
	if _, err := quoteIdentifier("table", strings.Repeat("ñ", 32)); err == nil {
		t.Error("accepted 64 bytes")
	}
}
