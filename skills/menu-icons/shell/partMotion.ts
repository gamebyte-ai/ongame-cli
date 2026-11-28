// ongame:menu-icons - written by the onGame menu-icons skill (apply.mjs). Change the skill, not this copy.
/** Part-by-part motion for bottom-menu icons. No Pixi here: `tabIconMotion.ts` moves each part's node.
 *
 * An icon cut into parts (an awning, a wheel, a door, a gear) moves each part on its own, in three clips:
 *   idle    a calm loop that never stops; full strength on the selected tab, softer on the others
 *   tap     a short press reaction, from the moment the finger lands
 *   select  a staggered sequence when the tab becomes selected
 * A clip is a pure function of normalised time per part. Clips add up: offsets add, scales add their
 * offsets from 1, and `alpha` adds to the part's own rest alpha (a glow part rests at 0 and lights up).
 * Units: x and y are in the icon's 36x36 box, so a rig reads the same at every screen size. Every tap
 * and select clip starts and ends exactly at rest; every idle loop ends where it starts. A clip that
 * is cut off or restarted hands its pose to a short ease back, so no part ever jumps between frames. A cut-off
 * select finishes a turn forward; a cut-off tap eases back to the nearest rest angle.
 * The frame loop makes no new object: a clip may return one scratch pose it reuses (see partRoles.ts).
 */
export interface PartPose {
  x: number; y: number; rotation: number; scaleX: number; scaleY: number;
  /** Added to the part's rest alpha. */
  alpha: number;
}
export type PartClip = (t: number) => Partial<PartPose>;
export interface PartTrack {
  /** One idle loop, t in [0, 1). */
  idle?: PartClip;
  tap?: PartClip;
  select?: PartClip;
}
export interface PartRig {
  readonly name: string;
  readonly idleSeconds: number;
  readonly tapSeconds: number;
  readonly selectSeconds: number;
  /** Idle strength while the tab is not selected: 0 keeps it still, 1 plays the full loop. */
  readonly idleWhenInactive: number;
  readonly parts: Readonly<Record<string, PartTrack>>;
}

export const PART_REST: Readonly<PartPose> = Object.freeze({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 0 });
/** A select sequence plays a few parts one after another, so it may run longer than a single icon motion. */
export const MAX_PART_CLIP_SECONDS = 0.8;
/** Seconds a cut-off clip takes to ease back to rest. */
export const PART_SETTLE_SECONDS = 0.12;
/** Seconds the idle strength takes to move between the selected and the inactive level. */
export const IDLE_FADE_SECONDS = 0.35;

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** 0 at both ends, 1 in the middle, smooth. */
export const bump = (u: number): number => Math.sin(Math.PI * clamp01(u));
export const smootherstep = (u: number): number => { const t = clamp01(u); return t * t * t * (t * (6 * t - 15) + 10); };
/** Rises smoothly over [a, b], holds, falls smoothly over [c, d]. */
export const plateau = (t: number, a: number, b: number, c: number, d: number): number =>
  smootherstep((t - a) / (b - a)) * (1 - smootherstep((t - c) / (d - c)));
/** A loop wave: sin over one idle period, with a phase in periods. */
export const wave = (t: number, phase = 0): number => Math.sin(2 * Math.PI * (t + phase));

/** Adds `b` onto `a` in place, `wb` times b's offset from rest. In place: it runs for every part every frame. */
function addInto(a: PartPose, b: Partial<PartPose>, wb = 1): void {
  a.x += wb * (b.x ?? 0); a.y += wb * (b.y ?? 0); a.rotation += wb * (b.rotation ?? 0);
  a.scaleX += wb * ((b.scaleX ?? 1) - 1); a.scaleY += wb * ((b.scaleY ?? 1) - 1); a.alpha += wb * (b.alpha ?? 0);
}
/** Puts `p` back at rest, in place, and returns it. */
export function toRest(p: PartPose): PartPose {
  p.x = p.y = p.rotation = p.alpha = 0; p.scaleX = p.scaleY = 1;
  return p;
}
function copyFull(p: Partial<PartPose>): PartPose {
  return { x: p.x ?? 0, y: p.y ?? 0, rotation: p.rotation ?? 0, scaleX: p.scaleX ?? 1, scaleY: p.scaleY ?? 1, alpha: p.alpha ?? 0 };
}

/** A clip is played at t in (0, 1); outside it, it is at rest. */
function sample(clip: PartClip | undefined, t: number): Partial<PartPose> {
  if (!clip || t <= 0 || t >= 1) return PART_REST;
  return clip(t);
}

/** Checks a rig's promises once, when it is defined: short clips and a calm idle loop. */
export function definePartRig(rig: PartRig): PartRig {
  for (const [key, s] of [['tap', rig.tapSeconds], ['select', rig.selectSeconds]] as const) {
    if (!(s > 0 && s <= MAX_PART_CLIP_SECONDS)) throw new RangeError(`${rig.name}: ${key} must last at most ${MAX_PART_CLIP_SECONDS} s`);
  }
  if (!(rig.idleSeconds >= 2)) throw new RangeError(`${rig.name}: an idle loop lasts at least 2 s, to stay calm`);
  if (!(rig.idleWhenInactive >= 0 && rig.idleWhenInactive <= 1)) throw new RangeError(`${rig.name}: idleWhenInactive is 0 to 1`);
  return Object.freeze({ ...rig, parts: Object.freeze({ ...rig.parts }) });
}

/** The largest change of any channel between two poses, in comparable units (rad, box units, scale). */
export function poseStep(a: PartPose, b: PartPose): number {
  const turn = 2 * Math.PI, dr = Math.abs(b.rotation - a.rotation) % turn;
  return Math.max(Math.min(dr, turn - dr), Math.abs(b.x - a.x) / 4, Math.abs(b.y - a.y) / 4,
    Math.abs(b.scaleX - a.scaleX) * 3, Math.abs(b.scaleY - a.scaleY) * 3, Math.abs(b.alpha - a.alpha));
}

/** Average speeds a cut-off clip eases back at, at most: a big swing takes longer than PART_SETTLE_SECONDS,
 * so a half-open door closes and a cut-off spin finishes its turn forward instead of snapping. */
const SETTLE_SPEED = { rotation: 6, scale: 3, offset: 15, alpha: 4 };
interface Carry { from: Map<string, { pose: PartPose; seconds: number }>; t: number; seconds: number; forward: boolean }

/** Plays one icon's rig. The driver applies `pose(part)` to the part's node each frame. */
export class PartPlayer {
  public readonly rig: PartRig;
  private idleT: number;
  private amp: number;
  private selected = false;
  private reduced = false;
  private tapT = -1;
  private selectT = -1;
  private readonly carries: Carry[] = [];
  /** The ease of a cut-off clip is written here, so it makes no pose per frame. */
  private readonly eased: PartPose = { ...PART_REST };

  /** `phase` (0-1) starts this icon's idle loop part way, so neighbouring icons never move in step. */
  public constructor(rig: PartRig, phase = 0) {
    this.rig = rig;
    this.idleT = phase * rig.idleSeconds;
    this.amp = rig.idleWhenInactive;
  }
  public get tapping(): boolean { return this.tapT >= 0; }
  public get selecting(): boolean { return this.selectT >= 0; }
  public get idleStrength(): number { return this.reduced ? 0 : this.amp; }
  public get settling(): boolean { return this.carries.length > 0; }

  public setSelected(selected: boolean): void { this.selected = selected; }
  public setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) { this.tapT = this.selectT = -1; this.carries.length = 0; }
  }
  /** A finger landed on the tab. A press during a press restarts it from the drawn pose. */
  public tap(): void {
    if (this.reduced) return;
    if (this.tapT >= 0) this.carry('tap');
    this.tapT = 0;
  }
  /** The tab became selected. */
  public select(): void {
    if (this.reduced) return;
    if (this.selectT >= 0) this.carry('select');
    this.selectT = 0;
  }
  /** Another tab was selected: a running select sequence eases back to rest instead of finishing. */
  public cancelSelect(): void {
    if (this.selectT < 0) return;
    this.carry('select');
    this.selectT = -1;
  }
  public update(seconds: number): void {
    if (this.reduced) return;
    this.idleT = (this.idleT + seconds) % this.rig.idleSeconds;
    const target = this.selected ? 1 : this.rig.idleWhenInactive;
    const stepAmp = seconds / IDLE_FADE_SECONDS;
    this.amp = this.amp < target ? Math.min(target, this.amp + stepAmp) : Math.max(target, this.amp - stepAmp);
    if (this.tapT >= 0 && (this.tapT += seconds) >= this.rig.tapSeconds) this.tapT = -1;
    if (this.selectT >= 0 && (this.selectT += seconds) >= this.rig.selectSeconds) this.selectT = -1;
    // drop finished carries in place: a new array each frame would be garbage
    let kept = 0;
    for (let i = 0; i < this.carries.length; i++) {
      const c = this.carries[i];
      c.t += seconds;
      if (c.t < c.seconds) this.carries[kept++] = c;
    }
    this.carries.length = kept;
  }
  /** The part's pose now: idle, tap and select added up, plus any cut-off clip easing back.
   * Pass `out` to reuse one object each frame instead of making a new one. */
  public pose(part: string, out: PartPose = { ...PART_REST }): PartPose {
    const p = toRest(out);
    const track = this.rig.parts[part];
    if (this.reduced || !track) return p;
    addInto(p, sample(track.idle, this.idleT / this.rig.idleSeconds + 1e-9), this.amp);
    addInto(p, this.clipPose(part, 'tap'));
    addInto(p, this.clipPose(part, 'select'));
    for (let i = 0; i < this.carries.length; i++) {
      const c = this.carries[i];
      const from = c.from.get(part);
      if (from) addInto(p, settle(from.pose, c.t / from.seconds, c.forward, this.eased));
    }
    return p;
  }
  private clipPose(part: string, clip: 'tap' | 'select'): Partial<PartPose> {
    const t = clip === 'tap' ? this.tapT : this.selectT;
    if (t < 0) return PART_REST;
    const seconds = clip === 'tap' ? this.rig.tapSeconds : this.rig.selectSeconds;
    return sample(this.rig.parts[part]?.[clip], t / seconds);
  }
  /** Keeps a cut-off clip's drawn pose per part, to ease back from. Runs on a press or a pick, not per frame. */
  private carry(clip: 'tap' | 'select'): void {
    const from = new Map<string, { pose: PartPose; seconds: number }>();
    const forward = clip === 'select';
    let seconds = PART_SETTLE_SECONDS;
    for (const part of Object.keys(this.rig.parts)) {
      const pose = copyFull(this.clipPose(part, clip));
      const s = settleSeconds(pose, forward);
      from.set(part, { pose, seconds: s });
      seconds = Math.max(seconds, s);
    }
    this.carries.push({ from, t: 0, seconds, forward });
  }
}

/** Where a cut-off rotation comes to rest. A tap's kick, or a small lean, goes back to the nearest whole turn; a
 * select's spin goes on to its next whole turn, never back. */
const SMALL_LEAN = 0.5;
function turnTarget(rotation: number, forward: boolean): number {
  const turns = rotation / (2 * Math.PI);
  if (!forward || Math.abs(rotation) < SMALL_LEAN) return Math.round(turns) * 2 * Math.PI;
  return Math.sign(turns) * Math.ceil(Math.abs(turns) - 1e-6) * 2 * Math.PI;
}
/** How long a cut-off pose takes to rest: PART_SETTLE_SECONDS, or longer for a big swing (SETTLE_SPEED). */
function settleSeconds(p: PartPose, forward: boolean): number {
  return Math.max(PART_SETTLE_SECONDS, Math.abs(turnTarget(p.rotation, forward) - p.rotation) / SETTLE_SPEED.rotation,
    Math.max(Math.abs(p.scaleX - 1), Math.abs(p.scaleY - 1)) / SETTLE_SPEED.scale,
    Math.max(Math.abs(p.x), Math.abs(p.y)) / SETTLE_SPEED.offset, Math.abs(p.alpha) / SETTLE_SPEED.alpha);
}
const easeOut = (k: number): number => 1 - (1 - clamp01(k)) * (1 - clamp01(k));

/** Eases a cut-off clip's pose to rest, k from 0 to 1, into `out`; a select's spin finishes its turn forward. */
function settle(from: PartPose, k: number, forward: boolean, out: PartPose): PartPose {
  const e = easeOut(k);
  const turn = turnTarget(from.rotation, forward);
  out.x = from.x * (1 - e); out.y = from.y * (1 - e); out.rotation = from.rotation + (turn - from.rotation) * e;
  out.scaleX = from.scaleX + (1 - from.scaleX) * e; out.scaleY = from.scaleY + (1 - from.scaleY) * e;
  out.alpha = from.alpha * (1 - e);
  return out;
}
