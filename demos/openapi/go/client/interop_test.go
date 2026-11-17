//go:build interop

// The client against a notes server it doesn't start: whichever NOTES_INTEROP_URL points to. The TypeScript server's
// tests run it (`go test -tags interop -run '^TestInterop' ./client/...`) against the TypeScript and the Go server, so
// the Go client is shown to work with both, through the one document. The tag keeps it out of a plain `go test`, which
// has no server to call. TestMain still builds its template database, so DATABASE_URL is needed too.

package client_test

import (
	"context"
	"crypto/rand"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/JacobLey/leyman/demos/openapi/go/client"
	"github.com/JacobLey/leyman/demos/openapi/go/notes"
)

// interopEnv reads a variable the caller sets, failing without it, as a test without its service does.
func interopEnv(t *testing.T, name string) string {
	t.Helper()

	value := os.Getenv(name)
	if value == "" {
		t.Fatalf("%s is not set: run it against a server, as the TypeScript server's tests do", name)
	}

	return value
}

// interopClient calls the server under test with a token: NOTES_INTEROP_TOKEN's user's, NOTES_INTEROP_OTHER_TOKEN's,
// or none for "".
func interopClient(t *testing.T, tokenVariable string) *client.Client {
	t.Helper()

	var token client.TokenSource
	if tokenVariable != "" {
		token = client.StaticToken(interopEnv(t, tokenVariable))
	}

	return newClient(t, client.Options{HTTPClient: nil, Token: token, BaseURL: interopEnv(t, "NOTES_INTEROP_URL")})
}

// interopNote adds a note whose title is prefix and then text unique to this call, so a test can find it among other
// tests' notes on the same server.
func interopNote(t *testing.T, notesClient *client.Client, prefix string) notes.Note {
	t.Helper()

	created, err := notesClient.CreateNote(context.Background(), notes.CreateNoteInput{
		Body:   notes.NewNote{Title: prefix + rand.Text(), Body: "A sheep"},
		Header: nil,
	})
	if err != nil || created.Created == nil {
		t.Fatalf("created %+v %v", created, err)
	}

	return *created.Created
}

// isCode is whether an error response came, with code.
func isCode(response *notes.ApiError, code string) bool {
	return response != nil && response.Code == code
}

func TestInteropCreateNote(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := interopClient(t, "NOTES_INTEROP_TOKEN")
	key := rand.Text()
	dolly := notes.CreateNoteInput{
		Body:   notes.NewNote{Title: "Dolly", Body: "A sheep"},
		Header: &notes.CreateNoteInputHeader{IdempotencyKey: &key},
	}

	created, err := notesClient.CreateNote(ctx, dolly)
	if err != nil || created.Created == nil || created.Created.Title != "Dolly" {
		t.Fatalf("created %+v %v", created, err)
	}

	retried, err := notesClient.CreateNote(ctx, dolly)
	if err != nil || retried.Created == nil || *retried.Created != *created.Created {
		t.Fatalf("retried %+v %v", retried, err)
	}
}

func TestInteropCreateNoteReusedKey(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := interopClient(t, "NOTES_INTEROP_TOKEN")
	key := rand.Text()
	header := &notes.CreateNoteInputHeader{IdempotencyKey: &key}

	if _, err := notesClient.CreateNote(ctx, notes.CreateNoteInput{Body: notes.NewNote{Title: "Dolly", Body: ""}, Header: header}); err != nil {
		t.Fatal(err)
	}

	reused, err := notesClient.CreateNote(ctx, notes.CreateNoteInput{Body: notes.NewNote{Title: "Polly", Body: ""}, Header: header})
	if err != nil || !isCode(reused.UnprocessableContent, "idempotency_key_reused") {
		t.Fatalf("reused %+v %v", reused, err)
	}
}

func TestInteropCreateNoteRefused(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := interopClient(t, "NOTES_INTEROP_TOKEN")

	for name, note := range map[string]notes.NewNote{
		"empty title": {Title: "", Body: "A sheep"},
		"NUL":         {Title: "Dolly", Body: "A\x00sheep"},
	} {
		invalid, err := notesClient.CreateNote(ctx, notes.CreateNoteInput{Body: note, Header: nil})
		if err != nil || !isCode(invalid.BadRequest, "invalid_request") {
			t.Errorf("%s: %+v %v", name, invalid, err)
		}
	}

	large, err := notesClient.CreateNote(ctx, notes.CreateNoteInput{
		Body:   notes.NewNote{Title: "Dolly", Body: strings.Repeat("A sheep", 20_000)},
		Header: nil,
	})
	if err != nil || large.ContentTooLarge == nil {
		t.Errorf("large %+v %v", large, err)
	}

	anonymous, err := interopClient(t, "").CreateNote(ctx, notes.CreateNoteInput{
		Body:   notes.NewNote{Title: "Dolly", Body: "A sheep"},
		Header: nil,
	})
	if err != nil || anonymous.Unauthorized == nil {
		t.Errorf("anonymous %+v %v", anonymous, err)
	}
}

func TestInteropGetNote(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := interopClient(t, "NOTES_INTEROP_TOKEN")
	note := interopNote(t, notesClient, "Dolly ")

	got, err := notesClient.GetNote(ctx, notes.GetNoteInput{Path: notes.GetNoteInputPath{NoteID: note.ID}})
	if err != nil || got.OK == nil || *got.OK != note {
		t.Fatalf("got %+v %v", got, err)
	}

	// Another user's note is as missing as one that doesn't exist
	theirs, err := interopClient(t, "NOTES_INTEROP_OTHER_TOKEN").GetNote(ctx, notes.GetNoteInput{Path: notes.GetNoteInputPath{NoteID: note.ID}})
	if err != nil || !isCode(theirs.NotFound, "not_found") {
		t.Errorf("theirs %+v %v", theirs, err)
	}

	anonymous, err := interopClient(t, "").GetNote(ctx, notes.GetNoteInput{Path: notes.GetNoteInputPath{NoteID: note.ID}})
	if err != nil || anonymous.Unauthorized == nil {
		t.Errorf("anonymous %+v %v", anonymous, err)
	}
}

func TestInteropGetNoteRefused(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := interopClient(t, "NOTES_INTEROP_TOKEN")
	missingID := "01900000-0000-7000-8000-000000000000"

	missing, err := notesClient.GetNote(ctx, notes.GetNoteInput{Path: notes.GetNoteInputPath{NoteID: missingID}})
	if err != nil || !isCode(missing.NotFound, "not_found") {
		t.Errorf("missing %+v %v", missing, err)
	}

	// A URN isn't a UUID's string form, which is all JSON Schema's uuid format accepts
	for _, invalidID := range []string{"dolly", "urn:uuid:" + missingID} {
		invalid, err := notesClient.GetNote(ctx, notes.GetNoteInput{Path: notes.GetNoteInputPath{NoteID: invalidID}})
		if err != nil || !isCode(invalid.BadRequest, "invalid_request") {
			t.Errorf("%s: %+v %v", invalidID, invalid, err)
		}
	}
}

func TestInteropListNotes(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := interopClient(t, "NOTES_INTEROP_TOKEN")
	// This test's own, as other tests add notes to the same server at the same time
	prefix := rand.Text() + " "
	older := interopNote(t, notesClient, prefix)
	newer := interopNote(t, notesClient, prefix)

	listed, err := notesClient.ListNotes(ctx, notes.ListNotesInput{Query: &notes.ListNotesInputQuery{Q: &prefix, Limit: nil}})
	if err != nil || listed.OK == nil || !slices.Equal(listed.OK.Items, []notes.Note{newer, older}) {
		t.Errorf("listed %+v %v", listed, err)
	}

	limited, err := notesClient.ListNotes(ctx, notes.ListNotesInput{Query: &notes.ListNotesInputQuery{Q: &prefix, Limit: new(int64(1))}})
	if err != nil || limited.OK == nil || !slices.Equal(limited.OK.Items, []notes.Note{newer}) {
		t.Errorf("limited %+v %v", limited, err)
	}
}

func TestInteropListNotesRefused(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := interopClient(t, "NOTES_INTEROP_TOKEN")

	for name, query := range map[string]notes.ListNotesInputQuery{
		"limit 0": {Q: nil, Limit: new(int64(0))},
		"empty q": {Q: new(""), Limit: nil},
	} {
		invalid, err := notesClient.ListNotes(ctx, notes.ListNotesInput{Query: &query})
		if err != nil || !isCode(invalid.BadRequest, "invalid_request") {
			t.Errorf("%s: %+v %v", name, invalid, err)
		}
	}

	anonymous, err := interopClient(t, "").ListNotes(ctx, notes.ListNotesInput{Query: nil})
	if err != nil || anonymous.Unauthorized == nil {
		t.Errorf("anonymous %+v %v", anonymous, err)
	}
}
