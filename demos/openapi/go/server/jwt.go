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
}

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
	fetchedAt time.Time
	keys      jwk.Set
	options   JWTOptions
	jwksURI   string
	mu        sync.Mutex
}

// NewJWTAuthenticator accepts the issuer's tokens for the audience.
func NewJWTAuthenticator(options JWTOptions) *JWTAuthenticator {
	if options.HTTPClient == nil {
		options.HTTPClient = http.DefaultClient
	}

	if options.Now == nil {
		options.Now = time.Now
	}

	return &JWTAuthenticator{fetchedAt: time.Time{}, keys: nil, options: options, jwksURI: "", mu: sync.Mutex{}}
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

// keySet is the issuer's keys, discovered and fetched on first use. With refresh, they are fetched again, unless they
// were fetched in the last 30 seconds.
func (a *JWTAuthenticator) keySet(ctx context.Context, refresh bool) (jwk.Set, error) { //nolint:ireturn // jwx's
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.keys != nil && (!refresh || a.options.Now().Sub(a.fetchedAt) < keysCooldown) {
		return a.keys, nil
	}

	if a.jwksURI == "" {
		jwksURI, err := a.discover(ctx)
		if err != nil {
			return nil, &AuthorizationServerError{Err: err, Issuer: a.options.Issuer}
		}

		a.jwksURI = jwksURI
	}

	keys, err := jwk.Fetch(ctx, a.jwksURI, jwk.WithHTTPClient(a.options.HTTPClient))
	if err != nil {
		return nil, &AuthorizationServerError{Err: err, Issuer: a.options.Issuer}
	}

	a.keys = keys
	a.fetchedAt = a.options.Now()

	return keys, nil
}
