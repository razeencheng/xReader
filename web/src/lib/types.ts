export interface Article {
  id: number;
  source_id: number;
  title: string;
  link: string;
  language: string;
  author?: string;
  published_at?: string;
  content_html?: string;
  content_text?: string;
  title_translated?: string;
  summary?: string;
  source_title?: string;
  source_kind?: string;
}

export interface ArticleListResponse {
  items: Article[];
  next_cursor?: string;
}
