'use client';

import { render, screen } from '@testing-library/react';
import { FeedRowComfortable } from './FeedRowComfortable';
import type { ArticleItem } from '@/lib/types';

const mockTranslated: ArticleItem = {
  id: 1,
  source_id: 1,
  title: 'Why Vercel AI SDK hit 2M',
  link: '#',
  language: 'en',
  title_translated: 'Vercel AI SDK 为何周下载量突破 200 万',
  summary: '统一流式/工具调用/错误处理 API 是 AI SDK 胜出的关键。',
  source_title: 'Vercel Blog',
  published_at: new Date(Date.now() - 3 * 3600000).toISOString(),
};

const mockNative: ArticleItem = {
  id: 2,
  source_id: 2,
  title: '在北京租房踩的 12 个坑',
  link: '#',
  language: 'zh',
  summary: '作者复盘今年租房踩过的坑',
  source_title: 'V2EX',
  published_at: new Date(Date.now() - 5 * 3600000).toISOString(),
};

const mockShort: ArticleItem = {
  id: 3,
  source_id: 3,
  title: 'nanoGPT update',
  link: '#',
  language: 'en',
  source_title: '@karpathy',
  published_at: new Date(Date.now() - 2 * 3600000).toISOString(),
};

test('renders translated title with original muted below', () => {
  render(<FeedRowComfortable item={mockTranslated} />);
  expect(screen.getByText(/Vercel AI SDK 为何/)).toBeInTheDocument();
  expect(screen.getByText(/Why Vercel AI SDK/)).toBeInTheDocument();
});

test('does not render original title for native-language article', () => {
  render(<FeedRowComfortable item={mockNative} />);
  expect(screen.queryByText(/原标题/)).not.toBeInTheDocument();
});

test('renders 要点 when summary present', () => {
  render(<FeedRowComfortable item={mockTranslated} />);
  expect(screen.getByText('要点')).toBeInTheDocument();
});

test('omits 要点 for short items without summary', () => {
  render(<FeedRowComfortable item={mockShort} />);
  expect(screen.queryByText('要点')).not.toBeInTheDocument();
});
