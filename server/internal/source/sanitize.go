package source

import "github.com/microcosm-cc/bluemonday"

var sanitizer *bluemonday.Policy

func init() {
	sanitizer = bluemonday.UGCPolicy()
	sanitizer.AllowAttrs("class").OnElements("span", "div", "p", "pre", "code")
}

func SanitizeHTML(html string) string {
	return sanitizer.Sanitize(html)
}
