package dynamodb

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// TestExpressionsAreTheSpecs checks the store's expressions against the plain code blocks of the spec's DynamoDB
// section, in order: the claim's condition, the token condition, complete's update and renew's update.
func TestExpressionsAreTheSpecs(t *testing.T) {
	t.Parallel()

	spec, err := os.ReadFile("../../SPEC.md")
	if err != nil {
		t.Fatal(err)
	}

	text := string(spec)
	section := text[strings.Index(text, "### DynamoDB"):strings.Index(text, "## Notifiers")]

	blocks := regexp.MustCompile("(?ms)^```\n(.*?)\n```$").FindAllStringSubmatch(section, -1)

	expressions := make([]string, 0, len(blocks))
	for _, block := range blocks {
		expressions = append(expressions, block[1])
	}

	want := []string{claimCondition, holdsTokenCondition, completeUpdate, renewUpdate}
	if len(expressions) != len(want) {
		t.Fatalf("the spec has %d expressions: %q", len(expressions), expressions)
	}

	for i, expression := range expressions {
		if expression != want[i] {
			t.Errorf("got\n%s\nwant\n%s", want[i], expression)
		}
	}
}
