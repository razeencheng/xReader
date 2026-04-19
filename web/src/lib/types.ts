export interface ArticleItem {
  id: number;
  source_id: number;
  title: string;
  link: string;
  language: string;
  author?: string;
  published_at?: string;
  title_translated?: string;
  summary?: string;
  source_title?: string;
  source_icon_url?: string;
}

export type Article = ArticleItem;

export interface ArticleListResponse {
  items: ArticleItem[];
  next_cursor?: string;
}

export type ArticleTab = 'today' | 'stream' | 'starred';
