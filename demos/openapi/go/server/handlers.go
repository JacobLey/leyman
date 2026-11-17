package server

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/JacobLey/leyman/demos/openapi/go/notes"
)

// Handlers answer every operation in the document. Each gets a request that already matched the document, with its
// parameters' defaults filled in, and answers with one of the responses the document allows, by setting one field of
// its result. Each acts for the caller, and sees only the caller's notes. An error is a 500, reported to OnError.
type Handlers interface {
	ListNotes(ctx context.Context, caller Caller, request notes.ListNotesRequest) (notes.ListNotesResult, error)
	CreateNote(ctx context.Context, caller Caller, request notes.CreateNoteRequest) (notes.CreateNoteResult, error)
	GetNote(ctx context.Context, caller Caller, request notes.GetNoteRequest) (notes.GetNoteResult, error)
}

// DB is what PostgresHandlers query: a *pgxpool.Pool, or a single connection.
type DB interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// PostgresHandlers are the operations on the notes table of the database package's schema.sql, with plain SQL.
// Another user's note is as missing as one that doesn't exist, so an id says nothing about whose it is.
type PostgresHandlers struct {
	db DB
}

// NewPostgresHandlers queries db, which they never close.
func NewPostgresHandlers(db DB) PostgresHandlers {
	return PostgresHandlers{db: db}
}

// isoMillis is how the TypeScript server writes a time (JavaScript's toISOString), so a note reads the same from
// either server: UTC, to the millisecond.
const isoMillis = "2006-01-02T15:04:05.000Z"

const noteColumns = "id::text, title, body, created_at"

func scanNote(row pgx.Row) (notes.Note, error) {
	var (
		note      notes.Note
		createdAt time.Time
	)

	if err := row.Scan(&note.ID, &note.Title, &note.Body, &createdAt); err != nil {
		return notes.Note{}, fmt.Errorf("reading a note: %w", err)
	}

	note.CreatedAt = createdAt.UTC().Format(isoMillis)

	return note, nil
}

// containing is a LIKE pattern matching text anywhere. %, _ and a backslash in it match themselves, escaped with
// Postgres's default escape character: https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE
func containing(text string) string {
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(text)

	return "%" + escaped + "%"
}

// ListNotes is the caller's newest notes, those whose title contains q (ignoring case) when given.
func (h PostgresHandlers) ListNotes(
	ctx context.Context,
	caller Caller,
	request notes.ListNotesRequest,
) (notes.ListNotesResult, error) {
	var pattern *string

	if request.Query.Q != nil {
		value := containing(*request.Query.Q)
		pattern = &value
	}

	// The limit is the spec's default unless given, filled in by validation
	rows, err := h.db.Query(ctx, "SELECT "+noteColumns+" FROM notes WHERE owner = $1 AND ($2::text IS NULL OR title ILIKE $2) "+
		"ORDER BY created_at DESC, id DESC LIMIT $3", caller.Subject, pattern, request.Query.Limit)
	if err != nil {
		return notes.ListNotesResult{}, fmt.Errorf("listing notes: %w", err)
	}

	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (notes.Note, error) { return scanNote(row) })
	if err != nil {
		return notes.ListNotesResult{}, fmt.Errorf("listing notes: %w", err)
	}

	return notes.ListNotesResult{OK: &notes.NoteList{Items: items}}, nil
}

// CreateNote adds a note, as the caller's.
func (h PostgresHandlers) CreateNote(
	ctx context.Context,
	caller Caller,
	request notes.CreateNoteRequest,
) (notes.CreateNoteResult, error) {
	note, err := scanNote(h.db.QueryRow(ctx, "INSERT INTO notes (owner, title, body) VALUES ($1, $2, $3) RETURNING "+noteColumns,
		caller.Subject, request.Body.Title, request.Body.Body))
	if err != nil {
		return notes.CreateNoteResult{}, err
	}

	return notes.CreateNoteResult{Created: &note}, nil
}

// GetNote is one of the caller's notes, or a 404.
func (h PostgresHandlers) GetNote(
	ctx context.Context,
	caller Caller,
	request notes.GetNoteRequest,
) (notes.GetNoteResult, error) {
	note, err := scanNote(h.db.QueryRow(ctx, "SELECT "+noteColumns+" FROM notes WHERE id = $1 AND owner = $2",
		request.Path.NoteID, caller.Subject))
	if errors.Is(err, pgx.ErrNoRows) {
		return notes.GetNoteResult{
			NotFound: &notes.ApiError{Code: "not_found", Message: "No note " + request.Path.NoteID},
		}, nil
	}

	if err != nil {
		return notes.GetNoteResult{}, err
	}

	return notes.GetNoteResult{OK: &note}, nil
}
