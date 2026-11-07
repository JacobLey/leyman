package convert

import (
	"errors"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// ErrHost is an allowed host that is not a host.
var ErrHost = errors.New("not a host")

// hostPattern is a host, optionally with a port: `example.com`, `*.example.com`, `127.0.0.1:8080`, `[::1]:8080`.
var hostPattern = regexp.MustCompile(`(?i)^(\[[\d.:a-f]+\]|[^\s#/:?@\[\]]+)(?::(\d+))?$`)

const (
	schemeHTTP  = "http"
	schemeHTTPS = "https"
)

// A hostFilter reports whether a URL may be fetched.
type hostFilter func(*url.URL) bool

type allowedHost struct {
	// hostname is the host's name, lowercase, and `.` and what follows for a wildcard.
	hostname string
	// port is the port, without leading zeros, or empty for any.
	port       string
	isWildcard bool
}

// allowHosts returns a filter of URLs by host.
//
// An entry matches a host exactly, on any port, unless it names one. An entry starting with `*.` matches subdomains
// of the rest, but not the rest itself: `*.example.com` matches `api.example.com`, but not `example.com`.
func allowHosts(entries []string) (hostFilter, error) {
	allowed := make([]allowedHost, 0, len(entries))

	for _, entry := range entries {
		host, err := parseHost(entry)
		if err != nil {
			return nil, err
		}

		allowed = append(allowed, host)
	}

	return func(target *url.URL) bool {
		port := target.Port()
		if port == "" {
			port = map[string]string{schemeHTTP: "80", schemeHTTPS: "443"}[target.Scheme]
		}

		hostname := strings.ToLower(target.Hostname())

		return slices.ContainsFunc(allowed, func(entry allowedHost) bool {
			return (entry.port == "" || entry.port == port) &&
				(hostname == entry.hostname || (entry.isWildcard && strings.HasSuffix(hostname, entry.hostname)))
		})
	}, nil
}

// parseHost reads an allowed host, as allowHosts does.
func parseHost(entry string) (allowedHost, error) {
	match := hostPattern.FindStringSubmatch(entry)
	if match == nil {
		return allowedHost{}, &hostError{entry: entry}
	}

	parsed, err := url.Parse("http://" + match[1])
	if err != nil {
		return allowedHost{}, &hostError{entry: entry}
	}

	hostname := strings.ToLower(parsed.Hostname())
	isWildcard := strings.HasPrefix(hostname, "*.")

	if isWildcard {
		hostname = hostname[1:]
	}

	port := match[2]
	if port != "" {
		number, _ := strconv.Atoi(port)
		port = strconv.Itoa(number)
	}

	return allowedHost{hostname: hostname, port: port, isWildcard: isWildcard}, nil
}

// fetchFilter returns which URLs may be fetched: any when fetch is true, else those of hosts, or none without hosts.
func fetchFilter(fetch bool, hosts []string) (hostFilter, error) {
	if len(hosts) > 0 {
		return allowHosts(hosts)
	}

	if fetch {
		return func(*url.URL) bool { return true }, nil
	}

	return nil, nil //nolint:nilnil // No filter, as no URL is loaded
}

type hostError struct {
	entry string
}

func (e *hostError) Error() string {
	return "Not a host: " + quote(e.entry)
}

func (e *hostError) Is(target error) bool {
	return target == ErrHost
}
