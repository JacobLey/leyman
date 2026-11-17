package notes

// The results below are written by hand, as genever-go only writes each response's body type: one pointer field per
// response the document gives the operation, tagged with its status, of which exactly one is set. A handler sets one
// to answer with it, and the client sets the one the server answered with. The server checks that the field set is a
// documented status, and the tests check that each struct has a field for every documented status and nothing else.

// ListNotesResult is one of operation "listNotes"'s documented responses.
type ListNotesResult struct {
	OK           *ListNotesResponse200 `status:"200"`
	BadRequest   *ListNotesResponse400 `status:"400"`
	Unauthorized *ListNotesResponse401 `status:"401"`
	Forbidden    *ListNotesResponse403 `status:"403"`
}

// CreateNoteResult is one of operation "createNote"'s documented responses.
type CreateNoteResult struct {
	Created              *CreateNoteResponse201 `status:"201"`
	BadRequest           *CreateNoteResponse400 `status:"400"`
	Unauthorized         *CreateNoteResponse401 `status:"401"`
	Forbidden            *CreateNoteResponse403 `status:"403"`
	Conflict             *CreateNoteResponse409 `status:"409"`
	ContentTooLarge      *CreateNoteResponse413 `status:"413"`
	UnprocessableContent *CreateNoteResponse422 `status:"422"`
}

// GetNoteResult is one of operation "getNote"'s documented responses.
type GetNoteResult struct {
	OK           *GetNoteResponse200 `status:"200"`
	BadRequest   *GetNoteResponse400 `status:"400"`
	Unauthorized *GetNoteResponse401 `status:"401"`
	Forbidden    *GetNoteResponse403 `status:"403"`
	NotFound     *GetNoteResponse404 `status:"404"`
}
