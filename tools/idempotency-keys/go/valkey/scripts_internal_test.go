package valkey

import (
	"encoding/json"
	"os"
	"testing"
)

func TestScriptsAreTheVectors(t *testing.T) {
	t.Parallel()

	data, err := os.ReadFile("../../test-vectors/data/test-vectors.json")
	if err != nil {
		t.Fatal(err)
	}

	var vectors struct {
		ValkeyScripts map[string]string `json:"valkeyScripts"`
	}
	if err := json.Unmarshal(data, &vectors); err != nil {
		t.Fatal(err)
	}

	for name, script := range map[string]string{"claim": claimScript, "complete": completeScript, "release": releaseScript} {
		if vectors.ValkeyScripts[name] != script {
			t.Errorf("the %s script isn't the vectors'", name)
		}
	}

	if len(vectors.ValkeyScripts) != 3 {
		t.Errorf("the vectors have %d scripts", len(vectors.ValkeyScripts))
	}
}
