import manifest from '../../assets/manifest.json';
import { SPECIES_IDS, type Lang, type SpeciesContent, type SpeciesId } from '../content/schema';
import { getLang, onLangChange, t } from '../i18n/i18n';

interface ModelEntry {
  species: string; sourceUrl: string; author: string; license: string; modifications: string[]; status: string;
}
type SpeciesJson = Pick<SpeciesContent, 'id' | 'commonName' | 'scientificName' | 'sources'>;
/** The part of `ContentStore` credits needs; sharing the app's store avoids duplicate species fetches. */
export interface SpeciesSource { get(id: SpeciesId): Promise<SpeciesContent> }

/** Species used for the credits list. Nothing is fetched until `load()` runs (first open); a failed species is skipped. */
export function createSpeciesLoader(getStore: () => Promise<SpeciesSource>): { load(): Promise<SpeciesJson[]> } {
  let done: Promise<SpeciesJson[]> | null = null;
  return {
    load(): Promise<SpeciesJson[]> {
      done ??= getStore().then(async (store) => {
        const out = await Promise.all(SPECIES_IDS.map((id) => store.get(id).catch(() => null)));
        return out.filter((s): s is SpeciesContent => s !== null);
      }).catch(() => { done = null; return []; });
      return done;
    },
  };
}

async function ownStore(): Promise<SpeciesSource> {
  const { ContentStore } = await import('../app/loader');
  return new ContentStore();
}

const CC_URLS: Record<string, string> = {
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY-NC-3.0': 'https://creativecommons.org/licenses/by-nc/3.0/',
  'CC-BY-NC-4.0': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};

const AUDIO = {
  title: 'Small wood at night close to Rio de Janeiro (on the way to Pedra Bonita)',
  author: 'felix.blume', license: 'CC0-1.0', url: 'https://freesound.org/people/felix.blume/sounds/410357/',
};
const AURELIA = {
  url: 'https://github.com/holtsetio/aurelia/tree/724aba263459d1b11a49b72bfc7ce8baac840ca8',
  notice: 'MIT License, Copyright (c) 2025 Holtsetio',
};

const CSS = `
.dino-credits-btn { position: fixed; left: 12px; bottom: 12px; z-index: 30; font: 600 13px/1 system-ui, sans-serif; color: #e8efe6;
  background: rgba(14,20,16,.92); border: 1px solid rgba(255,255,255,.2); border-radius: 8px; padding: 10px 14px; min-height: 40px; cursor: pointer; }
.dino-credits { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.55); }
.dino-credits[hidden] { display: none; }
.dino-credits__box { box-sizing: border-box; width: min(720px, 94vw); max-height: 88vh; overflow-y: auto; padding: 18px 22px 24px;
  color: #e8efe6; background: rgba(14,20,16,.97); border-radius: 12px; font: 15px/1.5 system-ui, sans-serif; overscroll-behavior: contain; }
.dino-credits__box h2 { margin: 0 0 8px; font-size: 1.4rem; }
.dino-credits__box h3 { margin: 20px 0 6px; font-size: 1rem; color: #9fd18b; }
.dino-credits__box ul { margin: 0; padding-left: 20px; }
.dino-credits__box li { margin: 4px 0; }
.dino-credits__box a { color: #9fd18b; overflow-wrap: anywhere; }
.dino-credits__tag { margin-left: 6px; padding: 1px 6px; border-radius: 4px; background: rgba(159,209,139,.2); font-size: .8rem; }
.dino-credits__close { font: 600 14px/1 system-ui, sans-serif; color: #e8efe6; background: transparent; border: 1px solid rgba(255,255,255,.3);
  border-radius: 8px; padding: 10px 14px; min-height: 40px; cursor: pointer; margin-bottom: 8px; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function link(href: string, text: string): HTMLAnchorElement {
  const a = el('a', undefined, text);
  a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}
function licence(id: string): Node {
  const url = CC_URLS[id];
  return url ? link(url, id) : document.createTextNode(id);
}

/** Credits and licences dialog with its trigger button. Plain DOM, text from t(). */
export class Credits {
  private readonly btn: HTMLButtonElement;
  private readonly dialog: HTMLElement;
  private readonly box: HTMLElement;
  private lang: Lang = getLang();
  private speciesList: SpeciesJson[] = [];
  private readonly species: { load(): Promise<SpeciesJson[]> };

  /** `store` should be the app's shared ContentStore; without it credits creates its own on first open. */
  constructor(root: HTMLElement, store?: SpeciesSource) {
    this.species = createSpeciesLoader(() => (store ? Promise.resolve(store) : ownStore()));
    if (!document.getElementById('dino-credits-style')) {
      const s = el('style', undefined, CSS);
      s.id = 'dino-credits-style';
      document.head.appendChild(s);
    }
    this.btn = el('button', 'dino-credits-btn');
    this.btn.type = 'button';
    this.btn.addEventListener('click', () => this.open());
    this.dialog = el('div', 'dino-credits');
    this.dialog.hidden = true;
    this.box = el('div', 'dino-credits__box');
    this.box.setAttribute('role', 'dialog');
    this.box.setAttribute('aria-modal', 'true');
    this.box.tabIndex = -1;
    this.dialog.appendChild(this.box);
    this.dialog.addEventListener('click', (e) => { if (e.target === this.dialog) this.close(); });
    root.append(this.btn, this.dialog);
    onLangChange((l) => { this.lang = l; this.render(); });
    this.render();
  }

  isOpen(): boolean { return !this.dialog.hidden; }
  open(): void {
    this.dialog.hidden = false;
    void this.species.load().then((l) => { if (l.length > 0 && this.speciesList.length === 0) { this.speciesList = l; this.render(); if (this.isOpen()) this.box.querySelector<HTMLElement>('button')?.focus(); } });
    this.box.scrollTop = 0;
    window.addEventListener('keydown', this.onKey);
    this.box.querySelector<HTMLElement>('button')?.focus();
  }
  close(): void {
    this.dialog.hidden = true;
    window.removeEventListener('keydown', this.onKey);
    this.btn.focus();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { this.close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...this.box.querySelectorAll<HTMLElement>('button, a[href]')];
    if (f.length === 0) return;
    const first = f[0], last = f[f.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !this.box.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !this.box.contains(active))) { e.preventDefault(); first.focus(); }
  };

  private render(): void {
    this.btn.textContent = t('credits');
    const box = this.box;
    box.replaceChildren();
    box.setAttribute('aria-labelledby', 'dino-credits-title');
    const close = el('button', 'dino-credits__close', t('credits.close'));
    close.type = 'button';
    close.addEventListener('click', () => this.close());
    const title = el('h2', undefined, t('credits.title'));
    title.id = 'dino-credits-title';
    box.append(close, title);

    const species = new Map<string, SpeciesJson>();
    for (const s of this.speciesList) species.set(s.id, s);

    box.append(el('h3', undefined, t('credits.models')));
    const models = el('ul');
    for (const m of (manifest as ModelEntry[]).filter((e) => e.status === 'approved')) {
      const li = el('li');
      li.dataset.species = m.species;
      const name = species.get(m.species)?.commonName[this.lang] ?? m.species;
      li.append(`${name} ${t('credits.by')} ${m.author} · `, link(m.sourceUrl, 'Sketchfab'), ' · ', licence(m.license));
      if (m.modifications.length > 0) li.append(el('span', 'dino-credits__tag', t('credits.modified')));
      models.append(li);
    }
    box.append(models);

    box.append(el('h3', undefined, t('credits.audio')));
    const audio = el('ul');
    const ali = el('li');
    ali.append(`${AUDIO.title} ${t('credits.by')} ${AUDIO.author} · `, link(AUDIO.url, 'Freesound'), ' · ', licence(AUDIO.license),
      el('span', 'dino-credits__tag', t('credits.modified')), el('br'), t('credits.audioText'));
    audio.append(ali);
    box.append(audio, el('h3', undefined, t('credits.flora')), el('p', undefined, t('credits.floraText')));

    box.append(el('h3', undefined, t('credits.code')));
    const code = el('p');
    code.append(`${t('credits.codeText')} `, link(AURELIA.url, 'holtsetio/aurelia'), ` · ${AURELIA.notice}`);
    box.append(code);

    box.append(el('h3', undefined, t('credits.science')));
    const sci = el('ul');
    for (const s of species.values()) {
      const li = el('li');
      li.append(el('strong', undefined, `${s.commonName[this.lang]} (${s.scientificName})`));
      const inner = el('ul');
      for (const src of s.sources) {
        const sl = el('li');
        sl.append(link(src.url, src.title));
        if (src.year) sl.append(` (${src.year})`);
        inner.append(sl);
      }
      li.append(inner);
      sci.append(li);
    }
    box.append(sci);
  }
}
