package client

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JacobLey/leyman/demos/openapi/go/notes"
)

// A status the result has no field for is an UnexpectedStatusError, even when the operation's document gives it: the
// result decides, rather than coming back empty.
func TestStatusTheResultDoesNotHave(t *testing.T) {
	t.Parallel()

	httpServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusCreated)
		_, _ = writer.Write([]byte(`{}`))
	}))
	t.Cleanup(httpServer.Close)

	notesClient, err := New(Options{BaseURL: httpServer.URL, Token: nil, HTTPClient: nil})
	if err != nil {
		t.Fatal(err)
	}

	// createNote documents a 201, which a listNotes result has no field for
	result, err := call[notes.ListNotesResult](context.Background(), notesClient, "createNote", notes.CreateNoteInput{
		Body:   notes.NewNote{Title: "Dolly", Body: ""},
		Header: nil,
	})

	var unexpected *UnexpectedStatusError
	if !errors.As(err, &unexpected) || unexpected.Status != http.StatusCreated || result.OK != nil {
		t.Fatalf("%+v %v", result, err)
	}
}
