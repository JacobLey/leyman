package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jws"
	"github.com/lestrrat-go/jwx/v3/jwt"
)

var errDiscovery = errors.New("discovery failed")

// JWTOptions configure a JWTAuthenticator.
type JWTOptions struct {
	// HTTPClient fetches the issuer's discovery document and keys. http.DefaultClient when nil.
	HTTPClient *http.Client
	// Now is the current time, for the keys' refetch cooldown. time.Now when nil.
	Now func() time.Time
	// Issuer is the authorization server that issues tokens for the API. Its keys are found through OpenID Connect
	// discovery (/.well-known/openid-configuration), which every common provider serves.
	Issuer string
	// Audience is the API's own resource identifier: a token is accepted only when issued for it (aud), so a token
	// for another service, even from the same issuer, is not.
	Audience string
	// FetchTimeout is how long discovering and fetching the keys may take together, after which the fetch fails (a
	// 500), so an issuer that never answers can't hold requests forever. 5 seconds when zero, as jose's
	// createRemoteJWKSet (its timeoutDuration).
	FetchTimeout time.Duration
}

// defaultFetchTimeout is JWTOptions.FetchTimeout's default.
const defaultFetchTimeout = 5 * time.Second

// keysCooldown is how long a JWTAuthenticator waits before fetching the issuer's keys again for a token signed with a
// key it doesn't know, as jose's createRemoteJWKSet does (its cooldownDuration), so tokens with made-up key ids can't
// make it fetch on every request.
const keysCooldown = 30 * time.Second

// JWTAuthenticator accepts JWT access tokens (RFC 9068) from an authorization server: signed by one of its keys,
// issued by it, for this API, not expired, and with every scope the operation needs, as its subject (sub), which must
// be a user. The keys are discovered on the first request, and again after a discovery fails, and fetched again for a
// token signed with a key it doesn't know (at most every 30 seconds). Only a token that's wrong is ErrInvalidToken: an issuer that can't
// be reached (its discovery, or its keys) is an AuthorizationServerError (a 500, reported), since it says nothing
// about the token.
type JWTAuthenticator struct {
	// fetchedAt is when the keys were last fetched, or tried to be
	fetchedAt time.Time
	keys      jwk.Set
	// fetching is the fetch in flight, or nil
	fetching *keysFetch
	options  JWTOptions
	jwksURI  string
	mu       sync.Mutex
}

// keysFetch is one fetch of the issuer's keys, which every request that needs it waits for.
type keysFetch struct {
	// done is closed once keys and err are set
	done chan struct{}
	keys jwk.Set
	err  error
}

// NewJWTAuthenticator accepts the issuer's tokens for the audience.
func NewJWTAuthenticator(options JWTOptions) *JWTAuthenticator {
	if options.HTTPClient == nil {
		options.HTTPClient = http.DefaultClient
	}

	if options.Now == nil {
		options.Now = time.Now
	}

	if options.FetchTimeout == 0 {
		options.FetchTimeout = defaultFetchTimeout
	}

	return &JWTAuthenticator{fetchedAt: time.Time{}, keys: nil, fetching: nil, options: options, jwksURI: "", mu: sync.Mutex{}}
}

// isAccessToken is whether a JWS's typ is at+jwt, as RFC 9068 requires
// (https://www.rfc-editor.org/rfc/rfc9068#section-2.1), and as jose compares it: case-insensitively, with or without
// "application/".
func isAccessToken(message *jws.Message) bool {
	typ, _ := message.Signatures()[0].ProtectedHeaders().Type()
	typ = strings.ToLower(typ)

	return strings.TrimPrefix(typ, "application/") == "at+jwt"
}

// Authenticate checks a token against the scopes an operation needs.
func (a *JWTAuthenticator) Authenticate(ctx context.Context, token string, scopes []string) (Caller, error) {
	parsed, err := a.verify(ctx, token)
	if err != nil {
		return Caller{}, err
	}

	subject, _ := parsed.Subject()

	// A client's own token (client credentials: sub is its client_id, https://www.rfc-editor.org/rfc/rfc9068#section-5),
	// not a user's
	var clientID any
	if parsed.Get("client_id", &clientID) == nil && clientID == subject {
		return Caller{}, ErrInvalidToken
	}

	var scope any

	_ = parsed.Get("scope", &scope)
	text, _ := scope.(string)
	granted := strings.Split(text, " ")

	for _, needed := range scopes {
		if !slices.Contains(granted, needed) {
			return Caller{}, ErrInsufficientScope
		}
	}

	return Caller{Subject: subject}, nil
}

// verify checks a token is an access token signed by one of the issuer's keys, issued by it for the audience, not
// expired, and with a subject.
func (a *JWTAuthenticator) verify(ctx context.Context, token string) (jwt.Token, error) { //nolint:ireturn // jwx's
	keys, err := a.keySet(ctx, false)
	if err != nil {
		return nil, err
	}

	message, err := jws.Parse([]byte(token))
	if err != nil || len(message.Signatures()) != 1 || !isAccessToken(message) {
		return nil, ErrInvalidToken
	}

	payload, err := a.verifySignature(ctx, []byte(token), message, keys)
	if err != nil {
		return nil, err
	}

	parsed, err := jwt.Parse(payload,
		// Verified above
		jwt.WithVerify(false),
		jwt.WithValidate(true),
		jwt.WithIssuer(a.options.Issuer),
		jwt.WithAudience(a.options.Audience),
		// Whose notes: RFC 9068 requires it
		jwt.WithRequiredClaim("sub"),
	)
	if err != nil {
		return nil, ErrInvalidToken
	}

	return parsed, nil
}

// verifySignature is a token's payload, once one of the issuer's keys verifies its signature. A token signed with a
// key the issuer didn't have when its keys were last fetched may be signed with one it has rotated in since: its kid
// isn't among them, or it has no kid and none of them verifies it. Then the keys are fetched again (unless that was
// done within the cooldown) and tried once more, as jose's createRemoteJWKSet does for a token no key matches
// (JWKSNoMatchingKey). A kid among the keys whose key doesn't verify the token is a bad signature, not a new key.
func (a *JWTAuthenticator) verifySignature(ctx context.Context, token []byte, message *jws.Message, keys jwk.Set) ([]byte, error) {
	kid, hasKid := message.Signatures()[0].ProtectedHeaders().KeyID()

	_, known := keys.LookupKeyID(kid)
	if known || !hasKid {
		payload, err := verifyWith(token, keys)
		if err == nil || known {
			return payload, err
		}
	}

	keys, err := a.keySet(ctx, true)
	if err != nil {
		return nil, err
	}

	return verifyWith(token, keys)
}

// verifyWith is a token's payload, when one of the keys verifies its signature.
func verifyWith(token []byte, keys jwk.Set) ([]byte, error) {
	// jwx requires a kid by default, while jose tries every key that fits
	payload, err := jws.Verify(token, jws.WithKeySet(keys, jws.WithInferAlgorithmFromKey(true), jws.WithRequireKid(false)))
	if err != nil {
		return nil, ErrInvalidToken
	}

	return payload, nil
}

// discover finds the issuer's jwks_uri, from its discovery document.
func (a *JWTAuthenticator) discover(ctx context.Context) (string, error) {
	url := strings.TrimSuffix(a.options.Issuer, "/") + "/.well-known/openid-configuration"

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("%w: %w", errDiscovery, err)
	}

	response, err := a.options.HTTPClient.Do(request)
	if err != nil {
		return "", fmt.Errorf("%w: %w", errDiscovery, err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode > 299 {
		return "", fmt.Errorf("%w: discovery answered %d", errDiscovery, response.StatusCode)
	}

	// Named by OpenID Connect Discovery: https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata
	//nolint:tagliatelle // Named by the spec
	var metadata struct {
		Issuer  any `json:"issuer"`
		JWKSURI any `json:"jwks_uri"`
	}
	if err := json.NewDecoder(response.Body).Decode(&metadata); err != nil {
		return "", fmt.Errorf("%w: %w", errDiscovery, err)
	}

	jwksURI, ok := metadata.JWKSURI.(string)
	// A document for another issuer would trust its keys for this one
	if metadata.Issuer != a.options.Issuer || !ok {
		return "", fmt.Errorf("%w: discovery named another issuer, or no keys", errDiscovery)
	}

	return jwksURI, nil
}

// keySet is the issuer's keys, discovered and fetched on first use. With refresh, they are fetched again, unless a
// fetch was tried in the last 30 seconds, whether or not it worked.
//
// One fetch runs at a time, and every request that needs the keys meanwhile waits for it, as jose shares one reload.
// The fetch is the authenticator's, not the request's: a request that's cancelled stops waiting (with its context's
// error), while the fetch goes on for the others, up to FetchTimeout.
func (a *JWTAuthenticator) keySet(ctx context.Context, refresh bool) (jwk.Set, error) { //nolint:ireturn // jwx's
	a.mu.Lock()

	if a.keys != nil && (!refresh || a.options.Now().Sub(a.fetchedAt) < keysCooldown) {
		keys := a.keys
		a.mu.Unlock()

		return keys, nil
	}

	fetch := a.fetching
	if fetch == nil {
		fetch = &keysFetch{done: make(chan struct{}), keys: nil, err: nil}
		a.fetching = fetch

		go a.fetch(context.WithoutCancel(ctx), fetch)
	}

	a.mu.Unlock()

	select {
	case <-fetch.done:
		return fetch.keys, fetch.err
	case <-ctx.Done():
		return nil, fmt.Errorf("waiting for the issuer's keys: %w", context.Cause(ctx))
	}
}

// fetch discovers the issuer's jwks_uri, unless it already has, then fetches its keys, within FetchTimeout.
func (a *JWTAuthenticator) fetch(ctx context.Context, fetch *keysFetch) {
	ctx, cancel := context.WithTimeout(ctx, a.options.FetchTimeout)
	defer cancel()

	a.mu.Lock()
	jwksURI := a.jwksURI
	a.mu.Unlock()

	var err error
	if jwksURI == "" {
		jwksURI, err = a.discover(ctx)
	}

	var keys jwk.Set
	if err == nil {
		keys, err = jwk.Fetch(ctx, jwksURI, jwk.WithHTTPClient(a.options.HTTPClient))
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	a.fetching = nil
	// Discovered once, even when the keys then fail
	a.jwksURI = jwksURI
	// A failed fetch starts the cooldown too, so tokens with made-up kids can't make it fetch from an issuer that's
	// down on every request either. Until then, the keys it has are used
	a.fetchedAt = a.options.Now()

	if err != nil {
		fetch.err = &AuthorizationServerError{Err: err, Issuer: a.options.Issuer}
	} else {
		a.keys = keys
		fetch.keys = keys
	}

	close(fetch.done)
}
