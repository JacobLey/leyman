package server

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
)

// Caller is who a request is from, once its token is accepted.
type Caller struct {
	// Subject is who the token is for: a user, as the authorization server knows them. Each owns their own notes.
	Subject string
}

// Authenticator checks a bearer token against the scopes an operation needs. It returns the token's Caller,
// ErrInvalidToken (a 401) or ErrInsufficientScope (a 403). Any other error is a 500, reported to OnError: it says
// nothing about the token.
type Authenticator interface {
	Authenticate(ctx context.Context, token string, scopes []string) (Caller, error)
}

// AuthenticatorFunc is a function as an Authenticator.
type AuthenticatorFunc func(ctx context.Context, token string, scopes []string) (Caller, error)

// Authenticate calls f.
func (f AuthenticatorFunc) Authenticate(ctx context.Context, token string, scopes []string) (Caller, error) {
	return f(ctx, token, scopes)
}

// StaticToken is a token StaticTokens accepts, and whose it is.
type StaticToken struct {
	Token string
	// Subject is the caller it is accepted as.
	Subject string
}

type hashedToken struct {
	subject string
	hash    [sha256.Size]byte
}

// StaticTokens accepts a fixed list of tokens, e.g. API keys from a secret store, each for one subject, with every
// scope. Each token is hashed (SHA-256), so tokens of any length compare in the same time, and compared in constant
// time against every allowed token, rather than stopping at the first match, so neither how long a comparison takes
// nor where a match is found says anything about a guess.
type StaticTokens struct {
	tokens []hashedToken
}

// NewStaticTokens accepts each of the tokens, as its subject.
func NewStaticTokens(tokens []StaticToken) StaticTokens {
	allowed := make([]hashedToken, len(tokens))
	for index, token := range tokens {
		allowed[index] = hashedToken{subject: token.Subject, hash: sha256.Sum256([]byte(token.Token))}
	}

	return StaticTokens{tokens: allowed}
}

// Authenticate accepts a token with any scopes, if it is one of the tokens.
func (s StaticTokens) Authenticate(_ context.Context, token string, _ []string) (Caller, error) {
	candidate := sha256.Sum256([]byte(token))
	match := -1

	for index, allowed := range s.tokens {
		if subtle.ConstantTimeCompare(allowed.hash[:], candidate[:]) == 1 {
			match = index
		}
	}

	if match < 0 {
		return Caller{}, ErrInvalidToken
	}

	return Caller{Subject: s.tokens[match].subject}, nil
}
