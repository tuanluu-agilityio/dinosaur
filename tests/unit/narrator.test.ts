import { describe, expect, it } from 'vitest';
import { Narrator, NarrationMissing } from '../../src/audio/narrator';

class FakeAudio {
  static all: FakeAudio[] = [];
  static hold = false;
  playing = false;
  playCalls = 0;
  constructor(public src: string) { FakeAudio.all.push(this); }
  rejectPending: ((e: Error) => void) | null = null;
  async play(): Promise<void> {
    this.playCalls++;
    if (FakeAudio.hold) {
      await new Promise<void>((_, rej) => { this.rejectPending = rej; });
    }
    if (this.src.includes('missing')) throw new Error('404');
    this.playing = true;
  }
  pause(): void { this.playing = false; }
  addEventListener(): void {}
}
const make = () => { FakeAudio.all = []; return new Narrator((s) => new FakeAudio(s) as unknown as HTMLAudioElement); };
const playing = () => FakeAudio.all.filter((a) => a.playing).length;

describe('Narrator', () => {
  it('stops the previous track before playing a new one', async () => {
    const n = make();
    await n.play('tyrannosaurus', 'en', 'behavior');
    await n.play('triceratops', 'vi', 'anatomy');
    expect(playing()).toBe(1);
    expect(FakeAudio.all[1].src).toContain('audio/vi/triceratops.anatomy.mp3');
  });
  it('does not call play when muted, and remembers state', async () => {
    const n = make();
    n.setMuted(true);
    await n.play('tyrannosaurus', 'en');
    expect(n.muted).toBe(true);
    expect(FakeAudio.all.every((a) => a.playCalls === 0)).toBe(true);
  });
  it('muting stops current playback', async () => {
    const n = make();
    await n.play('tyrannosaurus', 'en');
    n.setMuted(true);
    expect(playing()).toBe(0);
  });
  it('rejects with NarrationMissing for a missing file', async () => {
    const n = make();
    await expect(n.play('missing' as never, 'en')).rejects.toBeInstanceOf(NarrationMissing);
    expect(playing()).toBe(0);
  });
  it('does not report missing when a superseded play is aborted', async () => {
    const n = make();
    FakeAudio.hold = true;
    const first = n.play('tyrannosaurus', 'en');
    FakeAudio.hold = false;
    const second = n.play('triceratops', 'en');
    FakeAudio.all[0].rejectPending?.(new Error('AbortError'));
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });
  it('keeps the original error as cause on NarrationMissing', async () => {
    const n = make();
    const err = await n.play('missing' as never, 'en').catch((e) => e);
    expect((err as Error).cause).toBeInstanceOf(Error);
  });
});
