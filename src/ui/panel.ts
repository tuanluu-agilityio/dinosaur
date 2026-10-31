import type { Lang, SpeciesContent } from '../content/schema';
import { getLang, onLangChange, t } from '../i18n/i18n';
import './styles.css';

type SectionKey = keyof SpeciesContent['sections'];
const SECTION_KEYS: SectionKey[] = ['behavior', 'anatomy', 'huntingOrDefense', 'discovery'];

const fmt = (n: number): string => String(Math.round(n * 10) / 10);
const range = (r: [number, number], unit: string, desc = false): string => {
  const [a, b] = desc ? [Math.max(...r), Math.min(...r)] : [r[0], r[1]];
  return a === b ? `${fmt(a)} ${unit}` : `${fmt(a)}–${fmt(b)} ${unit}`;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class InfoPanel {
  private readonly panel: HTMLElement;
  private readonly handle: HTMLElement;
  private readonly body: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private current: SpeciesContent | null = null;
  private lang: Lang = getLang();
  private backCb: (() => void) | null = null;
  private sectionCb: ((s: SectionKey) => void) | null = null;

  constructor(root: HTMLElement) {
    this.panel = el('aside', 'dino-panel');
    this.panel.hidden = true;
    this.handle = el('div', 'dino-panel__handle');
    this.handle.setAttribute('role', 'separator');
    this.handle.appendChild(el('span'));
    this.backBtn = el('button', 'dino-panel__back');
    this.backBtn.type = 'button';
    this.backBtn.addEventListener('click', () => this.backCb?.());
    this.body = el('div', 'dino-panel__body');
    this.panel.append(this.handle, this.backBtn, this.body);
    root.appendChild(this.panel);
    this.initDrag();
    onLangChange((l) => { this.lang = l; if (this.current) this.render(); else this.labels(); });
    this.labels();
  }

  show(c: SpeciesContent, lang: Lang): void {
    this.current = c;
    this.lang = lang;
    this.body.scrollTop = 0;
    this.render();
    this.panel.hidden = false;
  }

  hide(): void { this.panel.hidden = true; this.current = null; }
  onBack(cb: () => void): void { this.backCb = cb; }
  onSection(cb: (s: SectionKey) => void): void { this.sectionCb = cb; }

  private labels(): void { this.backBtn.textContent = `← ${t('back')}`; }

  private render(): void {
    const c = this.current;
    if (!c) return;
    const lang = this.lang;
    const scroll = this.body.scrollTop;
    this.labels();
    const body = this.body;
    body.replaceChildren();

    body.append(el('h2', 'dino-panel__title', c.commonName[lang]), el('p', 'dino-panel__sci', c.scientificName));

    const facts = el('dl', 'dino-panel__facts');
    const add = (k: string, v: string): void => { facts.append(el('dt', undefined, k), el('dd', undefined, v)); };
    add(t('quickFacts.length'), range(c.quickFacts.lengthM, 'm'));
    add(t('quickFacts.mass'), range(c.quickFacts.massT, 't'));
    add(t('quickFacts.period'), range(c.quickFacts.periodMa, 'Ma', true));
    add(t('quickFacts.diet'), t(`diet.${c.quickFacts.diet}`));
    body.append(facts);

    const list = el('div', 'dino-panel__sections');
    for (const key of SECTION_KEYS) {
      const sec = el('section', 'dino-panel__section');
      sec.dataset.section = key;
      const h = el('button', 'dino-panel__section-title', t(`sections.${key}`));
      h.type = 'button';
      h.addEventListener('click', () => this.sectionCb?.(key));
      sec.append(h, el('p', undefined, c.sections[key][lang]));
      list.append(sec);
    }
    body.append(list);

    if (c.contested.length) {
      const sec = el('section', 'dino-panel__contested');
      sec.append(el('h3', undefined, t('contested')));
      const ul = el('ul');
      for (const item of c.contested) ul.append(el('li', undefined, item[lang]));
      sec.append(ul);
      body.append(sec);
    }

    const src = el('section', 'dino-panel__sources');
    src.append(el('h3', undefined, t('sources')));
    const ul = el('ul');
    for (const s of c.sources) {
      const a = el('a', undefined, s.year ? `${s.title} (${s.year})` : s.title);
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const li = el('li');
      li.append(a);
      ul.append(li);
    }
    src.append(ul);
    body.append(src);
    body.scrollTop = scroll;
  }

  /** Drag the handle to resize the bottom sheet (phone portrait only; CSS ignores the height elsewhere). */
  private initDrag(): void {
    let dragging = false;
    this.handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.handle.setPointerCapture(e.pointerId);
    });
    this.handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const vh = window.innerHeight;
      const h = Math.min(vh * 0.9, Math.max(vh * 0.2, vh - e.clientY));
      this.panel.style.setProperty('--sheet-h', `${h}px`);
    });
    const end = (): void => { dragging = false; };
    this.handle.addEventListener('pointerup', end);
    this.handle.addEventListener('pointercancel', end);
  }
}
