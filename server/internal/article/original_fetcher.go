package article

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"

	"github.com/razeencheng/xreader/internal/source"
)

const (
	originalFetchTimeout = 8 * time.Second
	originalFetchMaxBody = 2 * 1024 * 1024
)

var (
	errOriginalUnsupportedURL = errors.New("unsupported original URL")
	errOriginalUnsafeURL      = errors.New("unsafe original URL")
	errOriginalNotHTML        = errors.New("original URL did not return HTML")
	errOriginalTooLarge       = errors.New("original page is too large")
	errOriginalNoContent      = errors.New("original page has no readable content")
)

type OriginalContent struct {
	URL         string
	Title       string
	ContentHTML string
	ContentText string
}

func fetchOriginalContent(ctx context.Context, rawURL string) (OriginalContent, error) {
	u, err := parseSafeOriginalURL(rawURL)
	if err != nil {
		return OriginalContent{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, originalFetchTimeout)
	defer cancel()

	client := &http.Client{
		Timeout: originalFetchTimeout,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: (&safeDialer{
				resolver: net.DefaultResolver,
				dialer:   &net.Dialer{Timeout: 3 * time.Second},
			}).DialContext,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			_, err := parseSafeOriginalURL(req.URL.String())
			return err
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return OriginalContent{}, err
	}
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("User-Agent", "xReader original loader")

	resp, err := client.Do(req)
	if err != nil {
		return OriginalContent{}, fmt.Errorf("fetch original: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return OriginalContent{}, fmt.Errorf("fetch original: status %d", resp.StatusCode)
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if contentType != "" && !strings.Contains(contentType, "text/html") && !strings.Contains(contentType, "application/xhtml+xml") {
		return OriginalContent{}, errOriginalNotHTML
	}

	body, err := readLimited(resp.Body, originalFetchMaxBody)
	if err != nil {
		return OriginalContent{}, err
	}

	content, err := extractReadableContentFromURL(body, resp.Request.URL)
	if err != nil {
		return OriginalContent{}, err
	}
	content.URL = resp.Request.URL.String()
	return content, nil
}

func parseSafeOriginalURL(rawURL string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u == nil {
		return nil, errOriginalUnsupportedURL
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errOriginalUnsupportedURL
	}
	if u.User != nil || u.Hostname() == "" {
		return nil, errOriginalUnsafeURL
	}
	if isUnsafeHost(u.Hostname()) {
		return nil, errOriginalUnsafeURL
	}
	return u, nil
}

type safeDialer struct {
	resolver *net.Resolver
	dialer   *net.Dialer
}

func (d *safeDialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	if isUnsafeHost(host) {
		return nil, errOriginalUnsafeURL
	}

	addrs, err := d.resolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	for _, addr := range addrs {
		parsed, ok := netip.AddrFromSlice(addr.IP)
		if !ok || isUnsafeIP(parsed) {
			continue
		}
		return d.dialer.DialContext(ctx, network, net.JoinHostPort(addr.IP.String(), port))
	}
	return nil, errOriginalUnsafeURL
}

func isUnsafeHost(host string) bool {
	normalized := strings.TrimSuffix(strings.ToLower(strings.Trim(host, "[]")), ".")
	if normalized == "localhost" || strings.HasSuffix(normalized, ".localhost") {
		return true
	}
	parsed, err := netip.ParseAddr(strings.Trim(host, "[]"))
	return err == nil && isUnsafeIP(parsed)
}

func isUnsafeIP(ip netip.Addr) bool {
	return !ip.IsValid() ||
		ip.IsUnspecified() ||
		ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast()
}

func readLimited(r io.Reader, max int64) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(r, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > max {
		return nil, errOriginalTooLarge
	}
	return body, nil
}

func extractReadableContent(body []byte) (OriginalContent, error) {
	return extractReadableContentFromURL(body, nil)
}

func extractReadableContentFromURL(body []byte, baseURL *url.URL) (OriginalContent, error) {
	content, err := source.ExtractReadableContent(body, baseURL)
	if errors.Is(err, source.ErrNoReadableContent) {
		return OriginalContent{}, errOriginalNoContent
	}
	if err != nil {
		return OriginalContent{}, err
	}
	return OriginalContent{
		Title:       content.Title,
		ContentHTML: content.ContentHTML,
		ContentText: content.ContentText,
	}, nil
}
