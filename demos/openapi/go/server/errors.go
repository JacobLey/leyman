package server

import (
	"errors"
	"fmt"
)

var (
	// ErrInvalidToken is an Authenticator's answer to a token that isn't valid at all: a 401.
	ErrInvalidToken = errors.New("server: invalid bearer token")
	// ErrInsufficientScope is an Authenticator's answer to a valid token without a scope the operation needs: a 403.
	ErrInsufficientScope = errors.New("server: bearer token lacks a scope")
	// ErrConfig is a Config that New can't serve.
	ErrConfig = errors.New("server: invalid config")
)

// ResponseError is a handler's answer that the document doesn't allow. The client gets a 500 instead, never a
// response that breaks the contract, and OnError gets this.
type ResponseError struct {
	OperationID string
	Reason      string
	// Status is the status the handler answered with, or 0 when its result set none, or several.
	Status int
}

func (e *ResponseError) Error() string {
	return fmt.Sprintf("%s answered %d, which the spec does not allow: %s", e.OperationID, e.Status, e.Reason)
}

// AuthorizationServerError is an authorization server that can't be trusted for tokens right now: its discovery
// document or its keys are missing or wrong. The request gets a 500, since the token may well be fine.
type AuthorizationServerError struct {
	Err    error
	Issuer string
}

func (e *AuthorizationServerError) Error() string {
	return fmt.Sprintf("authorization server %s: %v", e.Issuer, e.Err)
}

func (e *AuthorizationServerError) Unwrap() error {
	return e.Err
}
