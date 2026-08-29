import { describe, expect, test } from 'vitest';
import { getUILanguage, translate } from './i18n';

describe('i18n', () => {
  test('normalizes BCP-47 native languages to UI dictionaries', () => {
    expect(getUILanguage('zh-CN')).toBe('zh-CN');
    expect(getUILanguage('zh-TW')).toBe('zh-TW');
    expect(getUILanguage('en-US')).toBe('en');
    expect(getUILanguage('ja-JP')).toBe('ja');
    expect(getUILanguage('ko-KR')).toBe('ko');
    expect(getUILanguage('pt-BR')).toBe('pt');
  });

  test('translates common navigation labels and interpolated messages', () => {
    expect(translate('zh-CN', 'nav.today')).toBe('今日');
    expect(translate('zh-TW', 'nav.settings')).toBe('設定');
    expect(translate('en-US', 'nav.today')).toBe('Today');
    expect(translate('ja-JP', 'feed.allRead')).toBe('すべて既読');
    expect(translate('ja-JP', 'settings.save')).toBe('設定を保存');
    expect(translate('es-ES', 'sources.findAndAdd')).toBe('Buscar y añadir');
    expect(translate('zh-CN', 'feed.bulkReadNotice', { scope: '当前视图', count: 2 })).toBe('已将当前视图 2 篇标为已读');
    expect(translate('en-US', 'feed.bulkReadNotice', { scope: 'current view', count: 2 })).toBe('Marked 2 articles in current view as read');
  });

  test('falls back to English for unknown languages and keys for missing messages', () => {
    expect(translate('it-IT', 'nav.settings')).toBe('Settings');
    expect(translate('zh-CN', 'missing.key')).toBe('missing.key');
  });

  test('localizes the compound reader advance action in every supported UI language', () => {
    expect(Object.fromEntries(
      ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt'].map((language) => [
        language,
        translate(language, 'reader.advanceNext'),
      ]),
    )).toEqual({
      en: '✓ Next',
      'zh-CN': '✓ 下一篇',
      'zh-TW': '✓ 下一篇',
      ja: '✓ 次の記事',
      ko: '✓ 다음 글',
      es: '✓ Siguiente',
      fr: '✓ Suivant',
      de: '✓ Weiter',
      pt: '✓ Próximo',
    });
    for (const language of ['zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt']) {
      expect(translate(language, 'reader.syncingRead')).not.toBe(translate('en', 'reader.syncingRead'));
      expect(translate(language, 'reader.readUnsynced')).not.toBe(translate('en', 'reader.readUnsynced'));
      expect(translate(language, 'reader.previousMarkFailed')).not.toBe(translate('en', 'reader.previousMarkFailed'));
    }
  });

  test('fully localizes the core one-handed operation copy in English and Chinese', () => {
    const expected = {
      en: {
        title: 'One-handed controls',
        description: 'Place common phone controls on the side that feels easiest to reach.',
        left: 'Left',
        right: 'Right',
        changed: 'One-handed controls moved to the Left',
      },
      'zh-CN': {
        title: '单手操作',
        description: '将手机上的常用操作放到顺手的一侧。',
        left: '左侧',
        right: '右侧',
        changed: '单手操作已切换到左侧',
      },
      'zh-TW': {
        title: '單手操作',
        description: '將手機上的常用操作放到順手的一側。',
        left: '左側',
        right: '右側',
        changed: '單手操作已切換到左側',
      },
    } as const;

    for (const [language, messages] of Object.entries(expected)) {
      expect(translate(language, 'operationSide.title')).toBe(messages.title);
      expect(translate(language, 'operationSide.description')).toBe(messages.description);
      expect(translate(language, 'operationSide.left')).toBe(messages.left);
      expect(translate(language, 'operationSide.right')).toBe(messages.right);
      expect(translate(language, 'operationSide.changed', { side: messages.left })).toBe(messages.changed);
    }
  });

  test('provides native one-handed operation labels for every supported UI language', () => {
    const expected = {
      en: ['Left', 'Right', 'One-handed controls moved to the Left'],
      'zh-CN': ['左侧', '右侧', '单手操作已切换到左侧'],
      'zh-TW': ['左側', '右側', '單手操作已切換到左側'],
      ja: ['左側', '右側', '片手操作を左側に切り替えました'],
      ko: ['왼쪽', '오른쪽', '한 손 조작을 왼쪽으로 전환했습니다'],
      es: ['Izquierda', 'Derecha', 'Controles movidos a la Izquierda'],
      fr: ['Gauche', 'Droite', 'Commandes déplacées à Gauche'],
      de: ['Links', 'Rechts', 'Einhandbedienung auf Links umgestellt'],
      pt: ['Esquerda', 'Direita', 'Controles movidos para a Esquerda'],
    } as const;

    for (const [language, [left, right, changed]] of Object.entries(expected)) {
      expect(translate(language, 'operationSide.left')).toBe(left);
      expect(translate(language, 'operationSide.right')).toBe(right);
      expect(translate(language, 'operationSide.changed', { side: left })).toBe(changed);
      expect(translate(language, 'operationSide.left')).not.toBe('operationSide.left');
      expect(translate(language, 'operationSide.changed', { side: left })).not.toBe('operationSide.changed');
    }

    for (const language of ['ja', 'ko', 'es', 'fr', 'de', 'pt']) {
      expect(translate(language, 'operationSide.title')).not.toBe(translate('en', 'operationSide.title'));
      expect(translate(language, 'operationSide.description')).not.toBe(translate('en', 'operationSide.description'));
      expect(translate(language, 'operationSide.left')).not.toBe(translate('en', 'operationSide.left'));
      expect(translate(language, 'operationSide.right')).not.toBe(translate('en', 'operationSide.right'));
    }
  });

  test('describes reader preference location without a physical side', () => {
    const english = translate('en', 'settings.description');
    const chinese = translate('zh-CN', 'settings.description');

    expect(english).toContain('reader');
    expect(english).not.toMatch(/bottom-right|right|left/i);
    expect(chinese).toContain('文章阅读器');
    expect(chinese).not.toMatch(/右下角|左|右/);
  });
});
