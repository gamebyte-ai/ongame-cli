import * as PIXI from 'pixi.js';

/**
 * Reference player (Pixi v8) for the pages pack.py writes. Copy it into the game and adapt; it is the code that
 * shipped in Castle Crash, with the game's own diagnostics left out.
 *
 * Every clip starts on the idle pose and is cut where it is nearly back there, so between clips the character holds
 * the idle still and the last frames fade into it. The still sits UNDER the fading frame, so nothing dims. Only one
 * clip's pages are in memory at a time (a 2048 px page is 16 MB on the GPU, a clip is 2-5 pages).
 */
export interface ClipsMeta {
  name: string; fw: number; fh: number; top: number; feet: number; cx: number; idle: string;
  clips: Record<string, { n: number; fps: number; act: number; cols: number; per: number; pages: number }>;
}

const FADE = 0.2;

export class MascotClips {
  private loaded: { name: string; frames: PIXI.Texture[] } | null = null;
  private loading: { name: string; job: Promise<PIXI.Texture[]> } | null = null;

  /** `dir` is where the pages are served from, e.g. `assets/mascot/`. */
  public constructor(public readonly meta: ClipsMeta, private readonly dir: string) {}

  public url(file: string): string { return this.dir + file; }
  private page(name: string, p: number): string { return this.url(`${this.meta.name}_${name}_${p}.webp`); }

  public unload(): void {
    if (!this.loaded) return;
    const { name, frames } = this.loaded;
    this.loaded = null;
    for (const t of frames) t.destroy(false);
    for (let p = 0; p < this.meta.clips[name].pages; p++) void PIXI.Assets.unload(this.page(name, p));
  }

  /** The clip's frames; loading one drops the other first. */
  public load(name: string): Promise<PIXI.Texture[]> {
    if (this.loaded?.name === name) return Promise.resolve(this.loaded.frames);
    if (this.loading?.name === name) return this.loading.job;
    this.unload();
    const c = this.meta.clips[name];
    const { fw, fh } = this.meta;
    const job = Promise.all(Array.from({ length: c.pages }, (_, p) => PIXI.Assets.load<PIXI.Texture>(this.page(name, p))))
      .then((pages) => {
        const frames = Array.from({ length: c.n }, (_, i) => {
          const j = i % c.per;
          return new PIXI.Texture({ source: pages[Math.floor(i / c.per)].source, frame: new PIXI.Rectangle((j % c.cols) * fw, Math.floor(j / c.cols) * fh, fw, fh) });
        });
        if (this.loading?.job === job) { this.loading = null; this.loaded = { name, frames }; }
        else if (this.loaded?.name !== name) { // superseded while loading: nobody holds these pages
          for (const t of frames) t.destroy(false);
          for (let p = 0; p < c.pages; p++) void PIXI.Assets.unload(this.page(name, p));
        }
        return frames;
      })
      .catch((e: unknown) => { if (this.loading?.job === job) this.loading = null; throw e; });
    this.loading = { name, job };
    return job;
  }

  /** Start fetching a clip before the screen that plays it opens (a win card: on the win, not on the card). */
  public preload(name: string): void { void this.load(name).catch(() => undefined); }
}

/**
 * The character performing a fixed programme on a loop: each clip, then a hold on the idle still. `cue()` plays a
 * clip right away (a tap) and the programme carries on after it. Positioned by its feet: `height` is the idle pose's
 * on-screen height, feet to top. Call `update(dt)` from the game's ticker, in seconds.
 */
export class Mascot extends PIXI.Container {
  private readonly idle: PIXI.Sprite;
  private readonly vid = new PIXI.Sprite();
  private video: { clip: string; frames: PIXI.Texture[]; t: number; n: number; fps: number; hold: number } | null = null;
  private hold = 0;
  private step = 0;
  private run = 0;
  private waiting = false;

  public constructor(private readonly clips: MascotClips, height: number, idle: PIXI.Texture,
    private readonly programme: { clip: string; hold: number }[]) {
    super();
    const { fw, fh, top, feet, cx } = clips.meta;
    const s = height / (feet - top);
    for (const sp of [this.vid, (this.idle = new PIXI.Sprite(idle))]) {
      sp.anchor.set(cx / fw, feet / fh);
      sp.scale.set(s);
    }
    this.vid.visible = false;
    this.addChild(this.idle, this.vid);
    if (programme.length) this.next(); else this.hold = Infinity;
  }

  /** Play `clip` now, replacing whatever is on; the programme resumes after it. */
  public cue(clip: string, holdAfter = 1.5): void { this.start(clip, holdAfter); }

  private next(): void {
    const p = this.programme[this.step % this.programme.length];
    this.step++;
    this.start(p.clip, p.hold);
  }

  private start(clip: string, hold: number): void {
    const id = ++this.run;
    // loading another clip frees this one's textures, so stop drawing them first
    if (this.video && this.video.clip !== clip) { this.video = null; this.vid.visible = false; this.idle.alpha = 1; }
    this.waiting = true;
    this.clips.load(clip)
      .then((frames) => {
        if (id !== this.run) return;
        this.waiting = false;
        if (this.destroyed) { this.clips.unload(); return; }
        const c = this.clips.meta.clips[clip];
        this.video = { clip, frames, t: 0, n: c.n, fps: c.fps, hold };
        this.vid.texture = frames[0]; this.vid.alpha = 1; this.vid.visible = true;
        this.idle.alpha = 0;
      })
      .catch(() => { if (id === this.run) { this.waiting = false; this.hold = hold; } }); // the idle still stays on screen
  }

  /** Frames run on the game clock; the last FADE seconds fade the frame out over the idle still. */
  public update(dt: number): void {
    if (this.destroyed) return;
    const v = this.video;
    if (!v) {
      if (this.waiting || this.hold <= 0) return;
      this.hold -= dt;
      if (this.hold <= 0) this.next();
      return;
    }
    v.t += Math.min(dt, 1 / 20); // a long frame (tab switch) skips no more than one step
    const i = Math.floor(v.t * v.fps);
    if (i >= v.n) {
      this.video = null; this.vid.visible = false; this.idle.alpha = 1;
      this.hold = v.hold;
      return;
    }
    this.vid.texture = v.frames[i];
    const left = (v.n - 1) / v.fps - v.t;
    const k = Math.min(1, Math.max(0, 1 - left / FADE));
    this.idle.alpha = k > 0 ? 1 : 0; this.vid.alpha = 1 - k;
  }

  public override destroy(options?: Parameters<PIXI.Container['destroy']>[0]): void {
    this.video = null;
    this.run++;
    super.destroy(options);
    this.clips.unload();
  }
}
