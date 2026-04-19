const LANG_FONTS: Record<string, string> = {
  ja: "'Hiragino Mincho ProN', Georgia, serif",
  zh: "'Source Han Serif', Georgia, serif",
  'zh-cn': "'Source Han Serif', Georgia, serif",
  'zh-tw': "'Source Han Serif', Georgia, serif",
  ko: "'Nanum Myeongjo', Georgia, serif",
};

export function fontForLang(lang: string): string {
  return LANG_FONTS[lang.toLowerCase()] ?? "'Iowan Old Style', Georgia, serif";
}
