package platform

import (
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// NewSPAHandler returns an http.Handler that serves static files from the given
// filesystem and falls back to index.html for SPA-style client-side routing.
//
// It avoids http.FileServer for HTML files to prevent the standard library's
// index.html → / redirect which causes loops in SPA setups.
func NewSPAHandler(staticFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(staticFS))

	serveFile := func(w http.ResponseWriter, name string) {
		f, err := staticFS.Open(name)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		defer f.Close()
		stat, _ := f.Stat()

		ct := "application/octet-stream"
		switch {
		case strings.HasSuffix(name, ".html"):
			ct = "text/html; charset=utf-8"
		case strings.HasSuffix(name, ".js"):
			ct = "application/javascript"
		case strings.HasSuffix(name, ".css"):
			ct = "text/css"
		case strings.HasSuffix(name, ".json"):
			ct = "application/json"
		}
		w.Header().Set("Content-Type", ct)
		if stat != nil {
			w.Header().Set("Content-Length", fmt.Sprintf("%d", stat.Size()))
		}
		w.WriteHeader(http.StatusOK)
		io.Copy(w, f)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		urlPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")

		// Root path → index.html
		if urlPath == "" || urlPath == "." {
			serveFile(w, "index.html")
			return
		}

		// Try exact file (skip directories)
		if f, err := staticFS.Open(urlPath); err == nil {
			stat, _ := f.Stat()
			f.Close()
			if stat != nil && !stat.IsDir() {
				// Use fileServer for non-HTML assets (proper caching headers)
				if !strings.HasSuffix(urlPath, ".html") {
					fileServer.ServeHTTP(w, r)
					return
				}
				serveFile(w, urlPath)
				return
			}
		}

		// Try .html extension (Next.js static export: /login → login.html)
		htmlPath := urlPath + ".html"
		if f, err := staticFS.Open(htmlPath); err == nil {
			f.Close()
			serveFile(w, htmlPath)
			return
		}

		// Try path/index.html (/admin → admin/index.html)
		indexPath := urlPath + "/index.html"
		if f, err := staticFS.Open(indexPath); err == nil {
			f.Close()
			serveFile(w, indexPath)
			return
		}

		// SPA fallback: serve root index.html for client-side routing
		serveFile(w, "index.html")
	})
}
