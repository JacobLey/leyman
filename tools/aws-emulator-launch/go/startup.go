package awsemulator

import (
	"encoding/json"
	"strings"
)

// startupMessage is the message of the line AWS Emulator logs once it serves requests, since 1.0.290. Its other
// fields are documented in the CLI reference: https://docs.aws.amazon.com/emulator/latest/userguide/cli-reference.html
const startupMessage = "emulator server information"

// startupLine is what the startup line gives.
type startupLine struct {
	Message     string `json:"message"`
	EndpointURL string `json:"endpoint_url"` //nolint:tagliatelle // The emulator's name
	ConfigFile  string `json:"config_file"`  //nolint:tagliatelle // The emulator's name
	CAFile      string `json:"ca_file"`      //nolint:tagliatelle // The emulator's name
}

// noStartupLine is the startupLine of any other line.
var noStartupLine = startupLine{Message: "", EndpointURL: "", ConfigFile: "", CAFile: ""} //nolint:gochecknoglobals // A constant

// parseStartupLine reads one line of the emulator's output. It logs JSON lines, whose fields are under "fields", and a
// few lines of plain text, which are ignored like every other line.
func parseStartupLine(line []byte) (startupLine, bool) {
	var entry struct {
		Fields startupLine `json:"fields"`
	}

	if json.Unmarshal(line, &entry) != nil {
		return noStartupLine, false
	}

	fields := entry.Fields
	ok := fields.Message == startupMessage && fields.EndpointURL != "" && fields.ConfigFile != "" &&
		fields.CAFile != ""

	return fields, ok
}

// parseINI reads the key = value lines of an AWS config or credentials file, as the emulator writes them: one
// profile, [default]. Indented lines continue a nested value (such as s3 =), so they are skipped, and the first value
// of a key wins.
func parseINI(data []byte) map[string]string {
	values := map[string]string{}

	for line := range strings.Lines(string(data)) {
		if strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t") {
			continue
		}

		key, value, found := strings.Cut(line, "=")
		key = strings.TrimSpace(key)

		if _, seen := values[key]; found && key != "" && !seen {
			values[key] = strings.TrimSpace(value)
		}
	}

	return values
}
