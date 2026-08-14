package source

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/mmcdole/gofeed"
	"github.com/stretchr/testify/require"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func serveFixture(t *testing.T, path string) http.HandlerFunc {
	t.Helper()
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write(data)
	}
}

func testRSSAdapter(t *testing.T) *RSSAdapter {
	t.Helper()
	return NewRSSAdapter(WithHTTPClient(&http.Client{Timeout: feedCandidateTimeout}))
}

func TestRSSAdapter_FetchesAndParsesAtomFeed(t *testing.T) {
	ts := httptest.NewServer(serveFixture(t, "testdata/atom_feed.xml"))
	defer ts.Close()

	a := testRSSAdapter(t)
	items, err := a.Fetch(context.Background(), Source{URL: ts.URL})
	require.NoError(t, err)
	require.Len(t, items, 3)
	require.Equal(t, "Welcome", items[0].Title)
}

func TestRSSAdapter_FetchesRSS2Feed(t *testing.T) {
	ts := httptest.NewServer(serveFixture(t, "testdata/rss2_feed.xml"))
	defer ts.Close()

	a := testRSSAdapter(t)
	items, err := a.Fetch(context.Background(), Source{URL: ts.URL})
	require.NoError(t, err)
	require.Len(t, items, 2)
	require.Equal(t, "RSS Item One", items[0].Title)
}

func TestRSSAdapter_PreservesPodcastItemArtwork(t *testing.T) {
	feedXML := `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Podcast</title><link>https://example.com</link><description>Podcast feed</description>
    <item>
      <title>Episode One</title><link>https://example.com/episodes/one</link><guid>episode-one</guid>
      <content:encoded><![CDATA[<p>Episode notes</p>]]></content:encoded>
      <itunes:image href="https://cdn.example.com/episode-one.jpg"/>
    </item>
  </channel>
</rss>`
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write([]byte(feedXML))
	}))
	defer ts.Close()

	items, err := testRSSAdapter(t).Fetch(context.Background(), Source{URL: ts.URL})

	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Contains(t, items[0].ContentHTML, `<figure><img src="https://cdn.example.com/episode-one.jpg"`)
	require.Contains(t, items[0].ContentHTML, "<p>Episode notes</p>")
}

func TestRSSAdapter_FallsBackToPodcastFeedArtwork(t *testing.T) {
	feedXML := `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Podcast</title><link>https://example.com</link><description>Podcast feed</description>
    <itunes:image href="https://cdn.example.com/show.jpg"/>
    <item><title>Episode Two</title><link>https://example.com/episodes/two</link><guid>episode-two</guid>
      <content:encoded><![CDATA[<p>Second episode notes</p>]]></content:encoded>
    </item>
  </channel>
</rss>`
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write([]byte(feedXML))
	}))
	defer ts.Close()

	items, err := testRSSAdapter(t).Fetch(context.Background(), Source{URL: ts.URL})

	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Contains(t, items[0].ContentHTML, `src="https://cdn.example.com/show.jpg"`)
}

func TestRSSAdapter_RecoversExplicitlyDroppedImagesFromArticlePage(t *testing.T) {
	var serverURL string
	articleRequests := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed":
			w.Header().Set("Content-Type", "application/xml")
			_, _ = fmt.Fprintf(w, `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<title>Image Feed</title><link>%s</link><description>Feed</description><item>
<title>Chart Article</title><link>%s/article</link><guid>chart-article</guid>
<content:encoded><![CDATA[<p>Feed paragraph remains readable.</p><!-- unsupported block: image --><p>Figure explanation.</p>]]></content:encoded>
</item></channel></rss>`, serverURL, serverURL)
		case "/article":
			articleRequests++
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<!doctype html><html><head><title>Chart Article</title></head><body><article>
<h1>Chart Article</h1><p>This original article paragraph is deliberately long enough to pass the readable-content threshold used by xReader.</p>
<figure><img src="/media/eclipse-chart.png" alt="Eclipse traffic chart"></figure><p>Figure explanation.</p>
</article></body></html>`))
		default:
			http.NotFound(w, r)
		}
	}))
	serverURL = ts.URL
	defer ts.Close()

	items, err := testRSSAdapter(t).Fetch(context.Background(), Source{URL: serverURL + "/feed"})

	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, 1, articleRequests)
	require.Contains(t, items[0].ContentHTML, `src="`+serverURL+`/media/eclipse-chart.png"`)
	require.Contains(t, items[0].ContentHTML, "This original article paragraph")
}

func TestRSSAdapter_SkipsArticleFetchWithoutDroppedImageMarker(t *testing.T) {
	requests := 0
	adapter := NewRSSAdapter(WithHTTPClient(&http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests++
		return nil, fmt.Errorf("unexpected request")
	})}))

	got := adapter.recoverDroppedImages(context.Background(), "https://example.com/article", "<p>Complete body</p>", "<p>Complete body</p>")

	require.Equal(t, "<p>Complete body</p>", got)
	require.Zero(t, requests)
}

func TestRSSAdapter_FallsBackWhenImageRecoveryResponseIsInvalid(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		body        string
	}{
		{name: "not html", contentType: "application/json", body: `{}`},
		{name: "missing content type", contentType: "", body: `<article><p>Readable content that must not be trusted without an HTML content type.</p><img src="https://cdn.example.com/chart.png"></article>`},
		{name: "too large", contentType: "text/html", body: strings.Repeat("x", articleImageRecoveryMaxBytes+1)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			adapter := NewRSSAdapter(WithHTTPClient(&http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{tt.contentType}},
					Body:       io.NopCloser(strings.NewReader(tt.body)),
					Request:    req,
				}, nil
			})}))

			got := adapter.recoverDroppedImages(context.Background(), "https://example.com/article", "<!-- unsupported block: image -->", "<p>RSS fallback</p>")

			require.Equal(t, "<p>RSS fallback</p>", got)
		})
	}
}

func TestRSSAdapter_FallsBackWhenArticleRecoveryIsUnsafeOrTransportFails(t *testing.T) {
	const fallback = "<p>RSS fallback</p>"
	require.Equal(t, fallback, NewRSSAdapter().recoverDroppedImages(
		context.Background(), "http://127.0.0.1/private", "<!-- unsupported block: image -->", fallback,
	))

	adapter := NewRSSAdapter(WithHTTPClient(&http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, fmt.Errorf("network unavailable")
	})}))
	require.Equal(t, fallback, adapter.recoverDroppedImages(
		context.Background(), "https://example.com/article", "<!-- unsupported block: image -->", fallback,
	))
}

func TestPreserveItemArtwork_DoesNotDuplicateBodyImageOrAcceptUnsafeURL(t *testing.T) {
	withBodyImage := `<p><img src="https://cdn.example.com/body.jpg"></p>`
	item := &gofeed.Item{Title: "Episode", Image: &gofeed.Image{URL: "https://cdn.example.com/artwork.jpg"}}
	require.Equal(t, withBodyImage, preserveItemArtwork(withBodyImage, item, nil))

	unsafe := &gofeed.Item{Title: "Episode", Image: &gofeed.Image{URL: "http://127.0.0.1/private.jpg"}}
	require.Equal(t, "<p>Notes</p>", preserveItemArtwork("<p>Notes</p>", unsafe, nil))
}

func TestRSSAdapter_Sanitizes_StripsScripts(t *testing.T) {
	ts := httptest.NewServer(serveFixture(t, "testdata/script_feed.xml"))
	defer ts.Close()

	a := testRSSAdapter(t)
	items, err := a.Fetch(context.Background(), Source{URL: ts.URL})
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.NotContains(t, items[0].ContentHTML, "<script>")
	require.NotContains(t, items[0].ContentHTML, "onclick")
}

func TestRSSAdapter_MalformedFeed_ReturnsError(t *testing.T) {
	ts := httptest.NewServer(serveFixture(t, "testdata/malformed_feed.xml"))
	defer ts.Close()

	a := testRSSAdapter(t)
	_, err := a.Fetch(context.Background(), Source{URL: ts.URL})
	require.Error(t, err)
}

func TestRSSAdapter_Validate_ReturnsMetadata(t *testing.T) {
	ts := httptest.NewServer(serveFixture(t, "testdata/atom_feed.xml"))
	defer ts.Close()

	a := testRSSAdapter(t)
	meta, err := a.Validate(context.Background(), ts.URL)
	require.NoError(t, err)
	require.Equal(t, "Test Atom Feed", meta.Title)
}

func TestSanitizeHTML_StripsDangerousContent(t *testing.T) {
	input := `<p>Hello</p><script>alert(1)</script><p onclick="evil()">click</p><img src="data:image/png;base64,abc">`
	out := SanitizeHTML(input)
	require.NotContains(t, out, "<script>")
	require.NotContains(t, out, "onclick")
	require.True(t, strings.Contains(out, "Hello"))
}

func TestSanitizeHTML_StripsHiddenHeadingAnchors(t *testing.T) {
	input := `<h3 id="详细配置">详细配置<a hidden class="anchor" aria-hidden="true" href="#详细配置">#</a></h3><h3>总结#</h3>`

	out := SanitizeHTML(input)

	require.Contains(t, out, "详细配置")
	require.Contains(t, out, "总结")
	require.NotContains(t, out, "详细配置#")
	require.NotContains(t, out, "总结#")
	require.NotContains(t, out, "anchor")
}
