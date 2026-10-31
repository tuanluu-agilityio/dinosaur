import ui from './ui.json';
import type { Lang } from '../content/schema';

export type UiKey = keyof typeof ui;
const STORAGE_KEY = 'dino.lang';
const isLang = (v: unknown): v is Lang => v === 'vi' || v === 'en';

export function initialLang(navigatorLangs: readonly string[], stored: string | null): Lang {
  if (isLang(stored)) return stored;
  const first = navigatorLangs.find((l) => l.toLowerCase().startsWith('vi'));
  return first ? 'vi' : 'en';
}

function readStored(): string | null {
  try { return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null; } catch { return null; }
}

let current: Lang = initialLang(
  typeof navigator !== 'undefined' ? [...(navigator.languages ?? [])] : [],
  readStored(),
);
const subs = new Set<(l: Lang) => void>();

export function getLang(): Lang { return current; }

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, l); } catch { /* storage unavailable */ }
  for (const cb of [...subs]) cb(l);
}

export function onLangChange(cb: (l: Lang) => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

export function t(key: UiKey): string { return ui[key][current]; }
