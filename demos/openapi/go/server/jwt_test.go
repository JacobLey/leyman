package server_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/json"
	"errors"
	"maps"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jws"
	"github.com/lestrrat-go/jwx/v3/jwt"

	"github.com/JacobLey/leyman/demos/openapi/go/server"
)

const audience = "https://notes.example"

// issuer is an authorization server's discovery document and keys, served for the tests, with keys to sign tokens.
type issuer struct {
	// discovery answers the discovery document, and jwks the key set, each settable per test.
	discovery func(w http.ResponseWriter)
	jwks      func(w http.ResponseWriter)
	public    jwk.Set
	url       string
	keys      []jwk.Key
	fetches   atomic.Int32
	mu        sync.Mutex
}

func newKey(t *testing.T, kid string) jwk.Key { //nolint:ireturn // jwx's
	t.Helper()

	private, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}

	key, err := jwk.Import(private)
	if err != nil {
		t.Fatal(err)
	}

	if kid != "" {
		_ = key.Set(jwk.KeyIDKey, kid)
	}

	_ = key.Set(jwk.AlgorithmKey, jwa.ES256())

	return key
}

func writeJSONBody(writer http.ResponseWriter, body any) {
	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(body) //nolint:errchkjson // Maps of strings, and key sets, which always encode
}

// newIssuer serves an issuer with one key, "first".
func newIssuer(t *testing.T) *issuer {
	t.Helper()

	served := &issuer{
		discovery: nil, jwks: nil, public: nil, url: "", keys: nil, fetches: atomic.Int32{}, mu: sync.Mutex{},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", func(writer http.ResponseWriter, _ *http.Request) {
		served.mu.Lock()
		defer served.mu.Unlock()

		if served.discovery != nil {
			served.discovery(writer)

			return
		}

		writeJSONBody(writer, map[string]string{"issuer": served.url, "jwks_uri": served.url + "/jwks"})
	})
	mux.HandleFunc("GET /jwks", func(writer http.ResponseWriter, _ *http.Request) {
		served.mu.Lock()
		defer served.mu.Unlock()

		served.fetches.Add(1)

		if served.jwks != nil {
			served.jwks(writer)

			return
		}

		writeJSONBody(writer, served.public)
	})

	httpServer := httptest.NewServer(mux)
	t.Cleanup(httpServer.Close)
	served.url = httpServer.URL
	served.setKeys(t, newKey(t, "first"))

	return served
}

// setKeys replaces the keys the issuer publishes.
func (i *issuer) setKeys(t *testing.T, keys ...jwk.Key) {
	t.Helper()

	set := jwk.NewSet()

	for _, key := range keys {
		public, err := key.PublicKey()
		if err != nil {
			t.Fatal(err)
		}

		_ = set.AddKey(public)
	}

	i.mu.Lock()
	defer i.mu.Unlock()

	i.keys = keys
	i.public = set
}

// claims are a token's, beyond the defaults sign fills in.
type claims map[string]any

// sign mints an access token with the key: issued by the issuer, for the audience, to alice, with both scopes, expiring
// in a minute, unless claims (nil to remove one) or typ say otherwise.
func (i *issuer) sign(t *testing.T, key jwk.Key, typ string, extra claims) string {
	t.Helper()

	values := claims{
		"iss":   i.url,
		"aud":   audience,
		"sub":   "alice",
		"scope": "notes:read notes:write",
		"exp":   time.Now().Add(time.Minute).Unix(),
	}
	maps.Copy(values, extra)

	token := jwt.New()

	for name, value := range values {
		if value != nil {
			if err := token.Set(name, value); err != nil {
				t.Fatal(err)
			}
		}
	}

	headers := jws.NewHeaders()
	_ = headers.Set(jws.TypeKey, typ)

	signed, err := jwt.Sign(token, jwt.WithKey(jwa.ES256(), key, jws.WithProtectedHeaders(headers)))
	if err != nil {
		t.Fatal(err)
	}

	return string(signed)
}

func (i *issuer) authenticator(now func() time.Time) *server.JWTAuthenticator {
	return server.NewJWTAuthenticator(server.JWTOptions{HTTPClient: nil, Now: now, Issuer: i.url, Audience: audience})
}

func TestJWTTokens(t *testing.T) {
	t.Parallel()

	served := newIssuer(t)
	authenticator := served.authenticator(nil)
	key := served.keys[0]
	ctx := context.Background()

	for name, token := range map[string]string{
		"at+jwt":             served.sign(t, key, "at+jwt", nil),
		"application/at+jwt": served.sign(t, key, "Application/AT+JWT", nil),
		"another client":     served.sign(t, key, "at+jwt", claims{"client_id": "cli"}),
	} {
		caller, err := authenticator.Authenticate(ctx, token, []string{"notes:read", "notes:write"})
		if err != nil || caller.Subject != "alice" {
			t.Errorf("%s: %v %v", name, caller, err)
		}
	}

	other := newKey(t, "first")

	for name, token := range map[string]string{
		"not a JWT":          "abc",
		"typ JWT":            served.sign(t, key, "JWT", nil),
		"another issuer":     served.sign(t, key, "at+jwt", claims{"iss": "https://other.example"}),
		"another audience":   served.sign(t, key, "at+jwt", claims{"aud": "https://other.example"}),
		"expired":            served.sign(t, key, "at+jwt", claims{"exp": time.Now().Add(-time.Minute).Unix()}),
		"no subject":         served.sign(t, key, "at+jwt", claims{"sub": nil}),
		"client credentials": served.sign(t, key, "at+jwt", claims{"sub": "cli", "client_id": "cli"}),
		"another key":        served.sign(t, other, "at+jwt", nil),
	} {
		if _, err := authenticator.Authenticate(ctx, token, []string{"notes:read"}); !errors.Is(err, server.ErrInvalidToken) {
			t.Errorf("%s: %v", name, err)
		}
	}

	for name, scope := range map[string]any{"one scope": "notes:read", "not a string": 5, "none": nil} {
		token := served.sign(t, key, "at+jwt", claims{"scope": scope})
		if _, err := authenticator.Authenticate(ctx, token, []string{"notes:write"}); !errors.Is(err, server.ErrInsufficientScope) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestJWTKeyRotation(t *testing.T) {
	t.Parallel()

	served := newIssuer(t)
	now := time.Now()
	authenticator := served.authenticator(func() time.Time { return now })
	ctx := context.Background()
	first := served.keys[0]

	if _, err := authenticator.Authenticate(ctx, served.sign(t, first, "at+jwt", nil), nil); err != nil {
		t.Fatal(err)
	}

	// A new key: fetched again for a token signed with it, once the cooldown passed
	second := newKey(t, "second")
	served.setKeys(t, first, second)

	if _, err := authenticator.Authenticate(ctx, served.sign(t, second, "at+jwt", nil), nil); !errors.Is(err, server.ErrInvalidToken) {
		t.Fatalf("within the cooldown: %v", err)
	}

	now = now.Add(30 * time.Second)

	if _, err := authenticator.Authenticate(ctx, served.sign(t, second, "at+jwt", nil), nil); err != nil {
		t.Fatalf("after the cooldown: %v", err)
	}

	// A token without a kid is tried against the keys
	served.setKeys(t, first)

	now = now.Add(30 * time.Second)

	if _, err := authenticator.Authenticate(ctx, served.sign(t, newKey(t, "unknown"), "at+jwt", nil), nil); !errors.Is(err, server.ErrInvalidToken) {
		t.Fatalf("unknown key: %v", err)
	}

	withoutKid := newKey(t, "")
	served.setKeys(t, withoutKid)

	now = now.Add(30 * time.Second)

	// Fetched again for the unknown kid above, so the key without a kid is known
	if _, err := authenticator.Authenticate(ctx, served.sign(t, newKey(t, "another"), "at+jwt", nil), nil); !errors.Is(err, server.ErrInvalidToken) {
		t.Fatalf("unknown key: %v", err)
	}

	if _, err := authenticator.Authenticate(ctx, served.sign(t, withoutKid, "at+jwt", nil), nil); err != nil {
		t.Fatalf("no kid: %v", err)
	}

	if fetches := served.fetches.Load(); fetches != 4 {
		t.Fatalf("%d fetches", fetches)
	}

	// Keys that can't be fetched again are the issuer's failure, not the token's
	served.mu.Lock()
	served.jwks = func(w http.ResponseWriter) { w.WriteHeader(http.StatusBadGateway) }
	served.mu.Unlock()

	now = now.Add(30 * time.Second)

	var issuerError *server.AuthorizationServerError
	if _, err := authenticator.Authenticate(ctx, served.sign(t, newKey(t, "later"), "at+jwt", nil), nil); !errors.As(err, &issuerError) {
		t.Fatalf("refetch failed: %v", err)
	}
}

func TestJWTIssuerFailures(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	for name, broken := range map[string]func(served *issuer){
		"discovery fails": func(served *issuer) {
			served.discovery = func(w http.ResponseWriter) { w.WriteHeader(http.StatusInternalServerError) }
		},
		"discovery isn't JSON": func(served *issuer) {
			served.discovery = func(w http.ResponseWriter) { _, _ = w.Write([]byte("<html>")) }
		},
		"another issuer": func(served *issuer) {
			served.discovery = func(w http.ResponseWriter) {
				writeJSONBody(w, map[string]string{"issuer": "https://other.example", "jwks_uri": served.url + "/jwks"})
			}
		},
		"no keys": func(served *issuer) {
			served.discovery = func(w http.ResponseWriter) { writeJSONBody(w, map[string]string{"issuer": served.url}) }
		},
		"keys fail": func(served *issuer) {
			served.jwks = func(w http.ResponseWriter) { w.WriteHeader(http.StatusInternalServerError) }
		},
	} {
		served := newIssuer(t)
		authenticator := served.authenticator(nil)
		token := served.sign(t, served.keys[0], "at+jwt", nil)

		served.mu.Lock()
		broken(served)
		served.mu.Unlock()

		_, err := authenticator.Authenticate(ctx, token, nil)

		var issuerError *server.AuthorizationServerError
		if !errors.As(err, &issuerError) || issuerError.Issuer != served.url || errors.Unwrap(err) == nil || err.Error() == "" {
			t.Errorf("%s: %v", name, err)
		}

		// Tried again on the next request
		served.mu.Lock()
		served.discovery = nil
		served.jwks = nil
		served.mu.Unlock()

		if _, err := authenticator.Authenticate(ctx, token, nil); err != nil {
			t.Errorf("%s, fixed: %v", name, err)
		}
	}

	// Unreachable, or not even a URL
	for _, url := range []string{"http://127.0.0.1:1", "http://\x7f"} {
		authenticator := server.NewJWTAuthenticator(server.JWTOptions{HTTPClient: nil, Now: nil, Issuer: url, Audience: audience})

		var issuerError *server.AuthorizationServerError
		if _, err := authenticator.Authenticate(ctx, "abc", nil); !errors.As(err, &issuerError) {
			t.Errorf("%q: %v", url, err)
		}
	}
}

func TestJWTThroughTheServer(t *testing.T) {
	t.Parallel()

	served := newIssuer(t)
	authenticator := served.authenticator(nil)
	api := serve(t, func(config *server.Config) { config.Authenticator = authenticator })

	token := served.sign(t, served.keys[0], "at+jwt", nil)

	// An issuer that can't be reached is a 500, since the token may well be fine
	served.mu.Lock()
	served.jwks = func(w http.ResponseWriter) { w.WriteHeader(http.StatusBadGateway) }
	served.mu.Unlock()

	expectProblem(t, api.request(t, http.MethodGet, "/notes", token, ""), http.StatusInternalServerError, "internal_error")

	var issuerError *server.AuthorizationServerError
	if logged := api.errors.all(); len(logged) != 1 || !errors.As(logged[0], &issuerError) {
		t.Fatalf("logged %v", logged)
	}

	served.mu.Lock()
	served.jwks = nil
	served.mu.Unlock()

	expectStatus(t, api.request(t, http.MethodGet, "/notes", token, ""), http.StatusOK)
}
