import type { Lang, SpeciesContent, SpeciesId } from '../content/schema';

export class NarrationMissing extends Error {
  constructor(readonly url: string, cause?: unknown) {
    super(`narration missing: ${url}`, { cause });
    this.name = 'NarrationMissing';
  }
}

type Section = keyof SpeciesContent['sections'];
type Factory = (src: string) => HTMLAudioElement;

/** Plays one narration track at a time. Files: <base>audio/<lang>/<id>.<section>.mp3 */
export class Narrator {
  private current: HTMLAudioElement | null = null;
  private _muted = false;

  constructor(
    private readonly make: Factory = (s) => new Audio(s),
    private readonly base: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/',
  ) {}

  get muted(): boolean { return this._muted; }

  async play(id: SpeciesId, lang: Lang, section: Section = 'behavior'): Promise<void> {
    this.stop();
    if (this._muted) return;
    const url = `${this.base}audio/${lang}/${id}.${section}.mp3`;
    const audio = this.make(url);
    this.current = audio;
    try {
      await audio.play();
    } catch (e) {
      if (this.current !== audio) return; // superseded: play() was aborted by stop()
      this.current = null;
      throw new NarrationMissing(url, e);
    }
  }

  stop(): void {
    this.current?.pause();
    this.current = null;
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (m) this.stop();
  }
}
