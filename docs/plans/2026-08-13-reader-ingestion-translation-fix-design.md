# Reader image and translation integrity design

## Problem

Some feeds publish complete article text but replace inline images with placeholders, so xReader stores a text-complete article with no images and never offers the existing “load original” fallback. Podcast feeds may expose episode artwork only through RSS metadata such as `itunes:image`, which is parsed by `gofeed` but discarded by the current article input model. Separately, an OpenAI-compatible model may return several numbered translations on one line; the line-oriented parser then merges later translations into the first item and caches empty translations for the remaining items.

## Accepted scope

Keep the existing database and reader UI unchanged. Repair content before it reaches the current `content_html` column, and repair translation parsing/cache validity at the existing backend seams.

For translations, accept a batch only when every requested paragraph receives a non-empty, unambiguous translation. A model response that puts several labels on one line is ambiguous with bracketed citations, so xReader does not guess: it automatically retries that batch one paragraph at a time. Empty translations are never considered cached. If a retry still fails, completed batches are persisted, the job is marked failed, and SSE emits an error instead of a false `done`; the existing client reconnect path can then request only missing work. Existing ordinal-label compatibility remains supported for the initial batch, while singleton retries require the requested index.

For images, preserve episode artwork by prepending a sanitized figure when the item body has no image, preferring item artwork and falling back to channel artwork. When raw feed content explicitly reports unsupported image blocks, selectively fetch the article page with the existing SSRF-safe client, strict timeout, redirect checks, strict HTML content-type check, a 2 MB response limit, and a 20-second feed-level recovery budget. Extract the readable article body, resolve relative and lazy-loaded image URLs against the final page URL, and use it only when it contains a valid HTTP(S) image. Any enrichment failure falls back to the sanitized RSS body without failing the feed refresh.

## Alternatives rejected

- Fetch every article page: better fidelity but excessive network cost and a larger reliability surface.
- Add image columns and migrations: unnecessary for the current rendering model and requires a safety-gate decision.
- Trust prompt wording alone: model formatting remains nondeterministic and cannot guarantee one-to-one output.
- Parse any inline bracketed number as a label: translations may legitimately contain citations, so ambiguous batches fall back to singleton requests instead.

## Verification

Regression tests cover same-line labels, incomplete batches, empty cached translations, `itunes:image`, selective page enrichment, relative image resolution, unsafe/failed enrichment fallback, and unchanged ordinary-feed behavior. Run relevant Go packages, full Go tests with race detection, frontend tests/lint/build, `go vet`, and a final diff/security review.
