import { getLang, onLangChange, setLang, t } from '../i18n/i18n';

const MUTE_KEY = 'dino.muted';

function readMuted(): boolean {
  try { return globalThis.localStorage?.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

/** Language toggle, mute and skip-intro buttons. Plain DOM, text from t(). */
export class Controls {
  private readonly lang: HTMLButtonElement;
  private readonly mute: HTMLButtonElement;
  private readonly skip: HTMLButtonElement;
  private muted = readMuted();
  private muteCb: ((m: boolean) => void) | null = null;
  private skipCb: (() => void) | null = null;

  constructor(root: HTMLElement) {
    const bar = document.createElement('div');
    bar.className = 'dino-controls';
    const mk = (cls: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      return b;
    };
    this.lang = mk('dino-controls__lang');
    this.mute = mk('dino-controls__mute');
    this.skip = mk('dino-controls__skip');
    this.skip.hidden = true;
    bar.append(this.skip, this.mute, this.lang);
    root.appendChild(bar);

    this.lang.addEventListener('click', () => setLang(getLang() === 'vi' ? 'en' : 'vi'));
    this.mute.addEventListener('click', () => this.setMuted(!this.muted));
    this.skip.addEventListener('click', () => this.skipCb?.());
    onLangChange(() => this.labels());
    this.labels();
  }

  get isMuted(): boolean { return this.muted; }
  onMute(cb: (m: boolean) => void): void { this.muteCb = cb; }
  onSkipIntro(cb: () => void): void { this.skipCb = cb; }
  showSkipIntro(visible: boolean): void { this.skip.hidden = !visible; }

  setMuted(m: boolean): void {
    this.muted = m;
    try { globalThis.localStorage?.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage unavailable */ }
    this.labels();
    this.muteCb?.(m);
  }

  private labels(): void {
    this.lang.textContent = getLang() === 'vi' ? 'EN' : 'VI';
    this.lang.setAttribute('aria-label', getLang() === 'vi' ? 'English' : 'Tiếng Việt');
    this.mute.textContent = t(this.muted ? 'unmute' : 'mute');
    this.mute.setAttribute('aria-pressed', String(this.muted));
    this.skip.textContent = t('skipIntro');
  }
}
