package article

import (
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestExtractReadableContent_PrefersArticleBodyAndSanitizes(t *testing.T) {
	html := `<!doctype html>
		<html>
			<head><title>Original title</title><script>alert("x")</script></head>
			<body>
				<nav>Navigation</nav>
				<article>
					<h1>Heading</h1>
					<p class="site-font" style="font-family: Comic Sans MS">This is the first readable paragraph with enough text to pass the minimum readable content threshold.</p>
					<p class="article-body">This is the second paragraph and it keeps the same article-like structure for the reader.</p>
					<script>alert("bad")</script>
					<a href="https://example.com/tracker">inline link</a>
				</article>
			</body>
		</html>`

	content, err := extractReadableContent([]byte(html))
	require.NoError(t, err)
	require.Equal(t, "Original title", content.Title)
	require.Contains(t, content.ContentHTML, "<p>")
	require.Contains(t, content.ContentText, "first readable paragraph")
	require.NotContains(t, strings.ToLower(content.ContentHTML), "<script")
	require.NotContains(t, content.ContentHTML, "href=")
	require.NotContains(t, content.ContentHTML, "class=")
	require.NotContains(t, content.ContentHTML, "style=")
}

func TestExtractReadableContentFromURL_ResolvesRelativeImages(t *testing.T) {
	pageURL, err := url.Parse("https://blog.example.com/posts/eclipse")
	require.NoError(t, err)
	html := `<!doctype html><html><head><title>Eclipse</title></head><body><article>
<p>This readable paragraph is deliberately long enough for the article extractor to select the body as meaningful content.</p>
<figure><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP" data-src="/media/eclipse.png" alt="Eclipse chart"></figure><p>Additional explanation for the chart.</p>
</article></body></html>`

	content, err := extractReadableContentFromURL([]byte(html), pageURL)

	require.NoError(t, err)
	require.Contains(t, content.ContentHTML, `src="https://blog.example.com/media/eclipse.png"`)
}

func TestParseSafeOriginalURL_RejectsUnsafeTargets(t *testing.T) {
	unsafe := []string{
		"file:///etc/passwd",
		"http://127.0.0.1/admin",
		"http://localhost/admin",
		"http://[::1]/admin",
		"http://user:pass@example.com/post",
	}

	for _, raw := range unsafe {
		_, err := parseSafeOriginalURL(raw)
		require.Error(t, err, raw)
	}
}
