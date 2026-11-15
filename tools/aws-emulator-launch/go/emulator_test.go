package awsemulator_test

import (
	"context"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"testing"

	awsemulator "github.com/JacobLey/leyman/tools/aws-emulator-launch/go"
)

// status sends a request to the installed emulator, through its client, and returns the response's status.
func status(t *testing.T, emulator *awsemulator.Emulator, request *http.Request) int {
	t.Helper()

	response, err := emulator.HTTPClient().Do(request)
	if err != nil {
		t.Fatal(err)
	}

	_ = response.Body.Close()

	return response.StatusCode
}

func TestTheInstalledEmulator(t *testing.T) {
	t.Parallel()

	emulator := launch(t, awsemulator.Options{}) //nolint:exhaustruct_v5 // Every default
	t.Cleanup(emulator.Stop)

	t.Run("serves its health check over HTTPS, trusting its certificate authority", func(t *testing.T) {
		t.Parallel()

		request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, emulator.Endpoint+"/__admin/health", nil)
		if err != nil {
			t.Fatal(err)
		}

		if got := status(t, emulator, request); got != http.StatusOK {
			t.Errorf("got %d", got)
		}
	})

	t.Run("refuses an unsigned request, since authentication is on", func(t *testing.T) {
		t.Parallel()

		request, err := http.NewRequestWithContext(t.Context(), http.MethodPost, emulator.Endpoint, strings.NewReader("{}"))
		if err != nil {
			t.Fatal(err)
		}

		request.Header.Set("Content-Type", "application/x-amz-json-1.0")
		request.Header.Set("X-Amz-Target", "DynamoDB_20120810.ListTables")

		if got := status(t, emulator, request); got != http.StatusForbidden {
			t.Errorf("got %d", got)
		}
	})

	t.Run("reads the region of its config", func(t *testing.T) {
		t.Parallel()

		if emulator.Region != "us-east-1" {
			t.Errorf("got %s", emulator.Region)
		}
	})
}

func TestTheInstalledEmulatorDeletesItsFilesOnceStopped(t *testing.T) {
	t.Parallel()

	emulator, err := awsemulator.Launch(context.Background(), awsemulator.Options{}) //nolint:exhaustruct_v5 // Every default
	if err != nil {
		t.Fatal(err)
	}

	emulator.Stop()

	if _, err := os.Stat(emulator.CAFile); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("got %v", err)
	}
}
