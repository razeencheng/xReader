import { CalendarDays, List, RadioTower, Star, type LucideIcon } from 'lucide-react';
import type { ViewTab } from '@/stores/useUIStore';

export const PRIMARY_NAV_ITEMS: {
  id: ViewTab;
  icon: LucideIcon;
  title: string;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'today', icon: CalendarDays, title: 'Today', label: 'Today', shortLabel: '今日' },
  { id: 'all', icon: List, title: 'All Articles', label: 'All', shortLabel: '全部' },
  { id: 'starred', icon: Star, title: 'Starred', label: 'Starred', shortLabel: '收藏' },
  { id: 'sources', icon: RadioTower, title: 'Sources', label: 'Sources', shortLabel: '源' },
];

export const LANGUAGE_OPTIONS = [
  { code: 'zh-CN', label: '中文', name: 'Chinese', short: 'ZH' },
  { code: 'en', label: 'EN', name: 'English', short: 'EN' },
  { code: 'ja', label: '日本語', name: 'Japanese', short: 'JA' },
  { code: 'es', label: 'ES', name: 'Spanish', short: 'ES' },
  { code: 'fr', label: 'FR', name: 'French', short: 'FR' },
  { code: 'de', label: 'DE', name: 'German', short: 'DE' },
  { code: 'ko', label: '한국어', name: 'Korean', short: 'KO' },
  { code: 'pt', label: 'PT', name: 'Portuguese', short: 'PT' },
] as const;
