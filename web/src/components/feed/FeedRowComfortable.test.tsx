import { render, screen } from '@testing-library/react';
import { FeedRowComfortable } from './FeedRowComfortable';
import type { Article } from '@/lib/types';

const base: Article = {
  id: 1,
  source_id: 1,
  title: 'Original Title',
  link: 'https://example.com',
  language: 'en',
  published_at: new Date().toISOString(),
};

const mockItemTranslated: Article = {
  ...base,
  title: 'nixosサーバー管理に移行した理由',
  title_translated: '为什么我把家用服务器全部迁到了 NixOS',
  language: 'ja',
  summary: '一年前作者把家里四台服务器迁到 NixOS。',
  source_title: 'はてなブログ',
};

const mockItemNative: Article = {
  ...base,
  title: '在北京租房踩的 12 个坑',
  language: 'zh',
  summary: '作者复盘今年租房踩过的坑。',
  source_title: 'V2EX',
};

const shortItem: Article = {
  ...base,
  title: 'nanoGPT update is out',
  title_translated: 'nanoGPT 刚发布了更新',
  language: 'en',
};

test('renders translated title with original muted below when translated', () => {
  render(<FeedRowComfortable item={mockItemTranslated} />);
  expect(screen.getByText(/为什么我把家用服务器/)).toBeInTheDocument();
  expect(screen.getByText(/nixosサーバー管理/)).toBeInTheDocument();
});

test('does not render original title when article is native-language', () => {
  render(<FeedRowComfortable item={mockItemNative} />);
  expect(screen.queryByText(/原标题/)).not.toBeInTheDocument();
});

test('renders 要点 inline when summary is present', () => {
  render(<FeedRowComfortable item={mockItemTranslated} />);
  expect(screen.getByText('要点')).toBeInTheDocument();
});

test('omits 要点 for short items', () => {
  render(<FeedRowComfortable item={shortItem} />);
  expect(screen.queryByText('要点')).not.toBeInTheDocument();
});
