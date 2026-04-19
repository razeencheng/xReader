export const mockUser = {
  id: 1,
  github_id: 12345,
  github_username: 'razeencheng',
  avatar_url: 'https://avatars.githubusercontent.com/u/12345',
  native_language: 'zh-CN',
  role: 'admin',
  density_pref: 'comfortable',
  theme_pref: 'system',
};

export const mockSources = [
  {
    id: 1,
    title: 'Hacker News Best',
    feed_url: 'https://hnrss.org/best',
    site_url: 'https://news.ycombinator.com',
    last_fetched_at: '2026-04-19T08:30:00Z',
    fail_count: 0,
  },
  {
    id: 2,
    title: 'The Pragmatic Engineer',
    feed_url: 'https://newsletter.pragmaticengineer.com/feed',
    site_url: 'https://newsletter.pragmaticengineer.com',
    last_fetched_at: '2026-04-19T07:15:00Z',
    fail_count: 0,
  },
];

const now = new Date('2026-04-19T10:00:00Z');
function hoursAgo(h: number) {
  return new Date(now.getTime() - h * 3600_000).toISOString();
}

export const mockArticles = [
  {
    id: 1,
    source_id: 1,
    title: 'Show HN: I built a real-time collaborative text editor in Rust',
    link: 'https://news.ycombinator.com/item?id=40001',
    language: 'en',
    author: 'rustdev42',
    published_at: hoursAgo(1),
    title_translated: 'Show HN：我用 Rust 构建了一个实时协作文本编辑器',
    summary: '作者使用 Rust 和 CRDT 算法实现了一款浏览器端实时协作编辑器，支持离线编辑和冲突自动合并。项目已开源。',
    source_title: 'Hacker News Best',
    source_icon_url: null,
  },
  {
    id: 2,
    source_id: 2,
    title: 'How Big Tech Runs Tech Projects and the Curious Absence of Scrum',
    link: 'https://newsletter.pragmaticengineer.com/p/project-management-in-tech',
    language: 'en',
    author: 'Gergely Orosz',
    published_at: hoursAgo(3),
    title_translated: '大型科技公司如何管理技术项目——以及 Scrum 的奇妙缺席',
    summary: '深入分析了 Google、Meta、Amazon 等公司的项目管理方式。大部分大厂并不使用 Scrum，而是采用更灵活的内部流程。',
    source_title: 'The Pragmatic Engineer',
    source_icon_url: null,
  },
  {
    id: 3,
    source_id: 1,
    title: 'SQLite is not a toy database',
    link: 'https://news.ycombinator.com/item?id=40003',
    language: 'en',
    published_at: hoursAgo(5),
    title_translated: 'SQLite 不是玩具数据库',
    summary: '文章论证了 SQLite 在生产环境中的可行性，列举了多个大规模部署案例，并对比了与 PostgreSQL 的性能差异。',
    source_title: 'Hacker News Best',
    source_icon_url: null,
  },
  {
    id: 4,
    source_id: 1,
    title: 'The unreasonable effectiveness of plain text',
    link: 'https://news.ycombinator.com/item?id=40004',
    language: 'en',
    author: 'plaintexter',
    published_at: hoursAgo(8),
    title_translated: '纯文本的惊人效力',
    summary: '探讨了为什么纯文本格式在软件工程中依然是最强大的数据格式。从 Unix 哲学到现代 DevOps，纯文本无处不在。',
    source_title: 'Hacker News Best',
    source_icon_url: null,
  },
  {
    id: 5,
    source_id: 2,
    title: 'What Silicon Valley "Gets" about Software Engineers that Traditional Companies Do Not',
    link: 'https://newsletter.pragmaticengineer.com/p/what-sv-gets',
    language: 'en',
    author: 'Gergely Orosz',
    published_at: hoursAgo(24),
    title_translated: '硅谷对软件工程师的理解，与传统公司的差距',
    summary: '分析了硅谷科技公司与传统企业在工程师文化、自主权、薪酬结构和职业发展路径上的关键差异。',
    source_title: 'The Pragmatic Engineer',
    source_icon_url: null,
  },
  {
    id: 6,
    source_id: 1,
    title: 'Writing a JIT compiler from scratch in Zig',
    link: 'https://news.ycombinator.com/item?id=40006',
    language: 'en',
    published_at: hoursAgo(30),
    title_translated: '用 Zig 从零编写 JIT 编译器',
    summary: '一步步教程，演示如何使用 Zig 语言实现一个简单的 JIT 编译器。涵盖了机器码生成、内存映射和基本优化。',
    source_title: 'Hacker News Best',
    source_icon_url: null,
  },
];

export const mockArticleDetail = {
  ...mockArticles[0],
  is_read: false,
  is_starred: false,
  content_html: `<h2>Introduction</h2>
<p>Building a real-time collaborative text editor has been a dream of mine for years. After exploring various approaches — OT (Operational Transformation), CRDTs (Conflict-free Replicated Data Types), and hybrid models — I settled on using <strong>Yrs</strong>, a Rust port of Yjs, as the foundation.</p>

<p>The key insight was that CRDTs have matured enough to handle the complex merging scenarios that used to require a central server. With the right data structure, you can achieve <em>true peer-to-peer collaboration</em> without sacrificing consistency.</p>

<h2>Architecture</h2>
<p>The system consists of three main components:</p>
<ul>
<li><strong>CRDT Engine</strong> — Handles document state and merge operations using Yrs</li>
<li><strong>WebSocket Relay</strong> — A lightweight Rust server using Axum for message routing</li>
<li><strong>Browser Client</strong> — A WASM module compiled from the same Rust codebase</li>
</ul>

<p>One of the most interesting challenges was implementing <em>awareness</em> — showing where other users' cursors are in real-time. This required a separate protocol layer on top of the document sync.</p>

<h2>Performance</h2>
<p>In benchmarks, the editor handles 10,000+ concurrent operations per second with sub-millisecond merge times. The WASM bundle is only 180KB gzipped, which loads in under 50ms on modern browsers.</p>

<p>Memory usage stays flat regardless of document history length, thanks to garbage collection of merged operations. This was a critical optimization — earlier versions would grow unbounded.</p>

<h2>What I Learned</h2>
<p>The hardest part wasn't the CRDT implementation itself, but handling the edge cases around <strong>offline editing</strong>. When a user comes back online after hours of disconnected work, the merge needs to be both correct and produce a result that "makes sense" to humans.</p>

<p>I'm releasing this as open source under the MIT license. Check it out on GitHub and let me know what you think!</p>`,
  content_text: 'Building a real-time collaborative text editor has been a dream of mine...',
};

export const mockArticleAI: Record<number, { title_translated?: string; summary?: string; body_translation_status?: string; body_translation_content?: string }> = {
  1: {
    title_translated: 'Show HN：我用 Rust 构建了一个实时协作文本编辑器',
    summary: '作者使用 Rust 和 CRDT 算法实现了一款浏览器端实时协作编辑器，支持离线编辑和冲突自动合并。项目已开源。',
    body_translation_status: 'complete',
    body_translation_content: `<h2>简介</h2>
<p>构建一个实时协作文本编辑器一直是我多年来的梦想。在探索了各种方法——OT（操作转换）、CRDT（无冲突复制数据类型）和混合模型之后，我选择了使用 <strong>Yrs</strong>（Yjs 的 Rust 移植版）作为基础。</p>

<p>关键洞察是，CRDT 已经足够成熟，可以处理过去需要中央服务器的复杂合并场景。使用正确的数据结构，你可以实现<em>真正的点对点协作</em>，而不会牺牲一致性。</p>

<h2>架构</h2>
<p>系统由三个主要组件组成：</p>
<ul>
<li><strong>CRDT 引擎</strong> — 使用 Yrs 处理文档状态和合并操作</li>
<li><strong>WebSocket 中继</strong> — 使用 Axum 的轻量级 Rust 服务器进行消息路由</li>
<li><strong>浏览器客户端</strong> — 从相同 Rust 代码库编译的 WASM 模块</li>
</ul>

<p>最有趣的挑战之一是实现<em>感知</em>——实时显示其他用户的光标位置。这需要在文档同步之上添加一个单独的协议层。</p>

<h2>性能</h2>
<p>在基准测试中，编辑器每秒处理超过 10,000 个并发操作，合并时间低于一毫秒。WASM 包仅 180KB（gzip 后），在现代浏览器上加载时间不到 50 毫秒。</p>

<p>得益于已合并操作的垃圾回收，内存使用量不会随文档历史长度增长。这是一个关键优化——早期版本会无限增长。</p>

<h2>我学到的</h2>
<p>最困难的部分不是 CRDT 实现本身，而是处理<strong>离线编辑</strong>的边缘情况。当用户在离线工作数小时后重新上线时，合并需要既正确又能产生对人类"有意义"的结果。</p>

<p>我以 MIT 许可证开源发布。请在 GitHub 上查看，告诉我你的想法！</p>`,
  },
};

export const mockHighlights = [
  {
    id: 1,
    article_id: 1,
    layer: 'original' as const,
    paragraph_index: 1,
    text_start_offset: 4,
    text_end_offset: 30,
    quoted_text: 'key insight was that CRDTs',
    note: 'Core thesis of the article',
    created_at: hoursAgo(0.5),
  },
  {
    id: 2,
    article_id: 1,
    layer: 'original' as const,
    paragraph_index: 5,
    text_start_offset: 0,
    text_end_offset: 45,
    quoted_text: 'Memory usage stays flat regardless of document',
    created_at: hoursAgo(0.3),
  },
];

export const mockHighlightRows = [
  {
    id: 1,
    article_id: 1,
    quoted_text: 'key insight was that CRDTs',
    note: 'Core thesis of the article',
    paragraph_index: 1,
    created_at: hoursAgo(0.5),
    article_title: mockArticles[0].title,
    article_link: mockArticles[0].link,
  },
  {
    id: 2,
    article_id: 1,
    quoted_text: 'Memory usage stays flat regardless of document',
    paragraph_index: 5,
    created_at: hoursAgo(0.3),
    article_title: mockArticles[0].title,
    article_link: mockArticles[0].link,
  },
];

export const mockAllowlist = [
  { github_username: 'razeencheng', role: 'admin', created_at: '2026-04-01T00:00:00Z' },
  { github_username: 'testuser', role: 'user', created_at: '2026-04-10T12:00:00Z' },
];

export const mockArticleStates: Record<number, { is_read: boolean; is_starred: boolean }> = {
  1: { is_read: false, is_starred: false },
  2: { is_read: true, is_starred: false },
  3: { is_read: false, is_starred: true },
  4: { is_read: true, is_starred: false },
  5: { is_read: false, is_starred: false },
  6: { is_read: true, is_starred: true },
};
