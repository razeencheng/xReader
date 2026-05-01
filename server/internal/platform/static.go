package platform

import (
	"io/fs"
	"net/http"
	"strings"
)

// NewSPAHandler returns an http.Handler that serves static files from the given
// filesystem and falls back to index.html for SPA-style client-side routing.
func NewSPAHandler(staticFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(staticFS))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")

		// Try exact file
		if f, err := staticFS.Open(path); err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// Try with .html extension (Next.js static export pattern)
		if f, err := staticFS.Open(path + ".html"); err == nil {
			f.Close()
			r.URL.Path = "/" + path + ".html"
			fileServer.ServeHTTP(w, r)
			return
		}

		// Try path/index.html
		if f, err := staticFS.Open(path + "/index.html"); err == nil {
			f.Close()
			r.URL.Path = "/" + path + "/index.html"
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback: serve root index.html
		r.URL.Path = "/index.html"
		fileServer.ServeHTTP(w, r)
	})
}
