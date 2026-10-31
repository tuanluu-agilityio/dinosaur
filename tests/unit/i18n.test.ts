import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initialLang, setLang, getLang, onLangChange, t } from '../../src/i18n/i18n';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

describe('initialLang', () => {
  it('picks vi from navigator list', () => expect(initialLang(['vi-VN', 'en'], null)).toBe('vi'));
  it('defaults to en', () => expect(initialLang(['en-US'], null)).toBe('en'));
  it('stored wins', () => expect(initialLang(['vi'], 'en')).toBe('en'));
  it('invalid stored falls back to en', () => expect(initialLang(['fr'], 'xx')).toBe('en'));
});

describe('setLang', () => {
  it('notifies once and persists', () => {
    const cb = vi.fn();
    const off = onLangChange(cb);
    const target = getLang() === 'vi' ? 'en' : 'vi';
    setLang(target);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(target);
    expect(store.get('dino.lang')).toBe(target);
    setLang(target);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });
  it('t returns strings per language', () => {
    setLang('en'); expect(t('back')).toBeTruthy();
    const en = t('sections.behavior'); setLang('vi');
    expect(t('sections.behavior')).not.toBe(en);
  });
});
