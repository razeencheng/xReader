CREATE TABLE highlights (
  id                bigserial PRIMARY KEY,
  user_id           bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id        bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  layer             text NOT NULL,
  paragraph_index   int NOT NULL,
  text_start_offset int NOT NULL,
  text_end_offset   int NOT NULL,
  quoted_text       text NOT NULL,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_highlights_user_article ON highlights(user_id, article_id);
