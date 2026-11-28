// ongame:menu-icons - written by the onGame menu-icons skill (apply.mjs). Change the skill, not this copy.
import {
  MAX_PART_CLIP_SECONDS, PART_REST, bump, clamp01, definePartRig, plateau, smootherstep, toRest, wave,
  type PartClip, type PartPose, type PartRig, type PartTrack,
} from './partMotion.js';

/** Ready clips by part role, so an icon gets its motion by naming what each part is.
 *
 * The numbers come from three tab icons of a shipped game (a stall, a house, a coin):
 *   flap   an awning, a flag, a lid's edge; its joint is the hinge at its top. Breathes, dips, flaps.
 *   hop    a roof, a cap, a lid that lifts; its joint is its bottom centre. Squashes, hops, lands.
 *   spin   a wheel, a gear, a fan; its joint is its centre. Rocks, kicks, turns once.
 *   pop    a flower, a bush, a gem, a star; its joint is its base. Sways, squashes, pops in turn.
 *   swing  a door, a drawer, a book cover; its joint is the hinge side. Opens and closes on a pick.
 *   glow   a window light, a sparkle, a shine; it rests at alpha 0. Flashes now and then, lights on a pick.
 * The whole icon is one more part, `body`, with its joint at the icon's base (`hop`, `wobble`), and `body-centre`,
 * with its joint at the icon's centre (`spin`).
 * Calm by design: smooth curves only (sine bumps and smootherstep ramps), no hard steps. Each clip writes into
 * one pose it reuses, so a frame makes no new object.
 */
export type PartRole = 'flap' | 'hop' | 'spin' | 'pop' | 'swing' | 'glow';
export type BodyMotion = 'hop' | 'wobble' | 'spin' | 'none';
export const PART_ROLES: readonly PartRole[] = Object.freeze(['flap', 'hop', 'spin', 'pop', 'swing', 'glow']);
/** The part names `partedIcon` gives the whole icon: joined at its base, and at its centre. */
export const BODY_PART = 'body';
export const BODY_CENTRE_PART = 'body-centre';

/** Seconds of a pick sequence, a press and an idle loop. */
export const SELECT_SECONDS = 0.76;
export const TAP_SECONDS = 0.3;
export const IDLE_SECONDS = 4;
/** Idle strength on a tab that is not selected. */
export const IDLE_WHEN_INACTIVE = 0.35;

/** Where a part's clips start: its place in the pick order, its idle phase and which way it leans. */
interface Slot { start: number; len: number; phase: number; side: number }

const frac = (v: number): number => v - Math.floor(v);

/** A clip that writes into one reused pose, so a frame makes no new object. `write` gets the pose at rest.
 * Build a game's own clips with it: `poseClip((p, t) => { p.y = -2 * Math.sin(Math.PI * t); })`. */
export function poseClip(write: (p: PartPose, t: number) => void): PartClip {
  const p: PartPose = { ...PART_REST };
  return (t: number) => {
    write(toRest(p), t);
    return p;
  };
}
/** The same clip played over [start, start + len] of the pick sequence, at rest outside it. */
const windowed = (s: Slot, write: (p: PartPose, u: number) => void): PartClip =>
  poseClip((p, t) => { const u = clamp01((t - s.start) / s.len); if (u > 0 && u < 1) write(p, u); });
const squash = (p: PartPose, t: number, k: number): void => { p.scaleX = 1 + 0.6 * k * bump(t); p.scaleY = 1 - k * bump(t); };
const sway = (p: PartPose, t: number, phase: number, rot: number, swell: number): void => {
  p.rotation = rot * wave(t, phase);
  p.scaleX = p.scaleY = 1 + swell * wave(t, phase + 0.25);
};

/** How long each role's pick takes, as a share of the sequence. */
const ROLE_LENGTH: Readonly<Record<PartRole, number>> = { flap: 0.9, hop: 0.8, spin: 0.85, pop: 0.42, swing: 0.9, glow: 0.86 };

const ROLES: Readonly<Record<PartRole, (s: Slot) => PartTrack>> = {
  flap: (s) => ({
    idle: poseClip((p, t) => { p.scaleY = 1 + 0.05 * wave(t, s.phase); p.rotation = 0.02 * wave(t, s.phase + 0.25); }),
    tap: poseClip((p, t) => { p.scaleY = 1 + 0.16 * bump(t); p.scaleX = 1 - 0.04 * bump(t); }),
    select: windowed(s, (p, u) => {
      p.scaleY = 1 + 0.24 * bump(u / 0.34) - 0.1 * bump((u - 0.34) / 0.3) + 0.04 * bump((u - 0.64) / 0.36);
      p.rotation = 0.08 * Math.sin(3 * Math.PI * u) * (1 - u) * (1 - u);
    }),
  }),
  hop: (s) => ({
    idle: poseClip((p, t) => { p.scaleY = 1 + 0.03 * wave(t, s.phase); }),
    tap: poseClip((p, t) => squash(p, t, 0.14)),
    select: windowed(s, (p, u) => {
      p.y = -2.4 * bump((u - 0.06) / 0.4);
      p.scaleY = 1 - 0.08 * bump(u / 0.12) + 0.06 * bump((u - 0.06) / 0.4) - 0.14 * bump((u - 0.46) / 0.24);
      p.scaleX = 1 + 0.05 * bump(u / 0.12) + 0.09 * bump((u - 0.46) / 0.24);
    }),
  }),
  spin: (s) => ({
    idle: poseClip((p, t) => { p.rotation = 0.3 * wave(t, s.phase); }),
    tap: poseClip((p, t) => { p.rotation = 0.6 * bump(t); p.scaleX = p.scaleY = 1 - 0.08 * bump(t); }),
    select: windowed(s, (p, u) => {
      p.rotation = 2 * Math.PI * smootherstep(u / 0.85) + 0.16 * bump((u - 0.7) / 0.3);
      p.scaleX = p.scaleY = 1 + 0.12 * bump(u);
    }),
  }),
  pop: (s) => ({
    idle: poseClip((p, t) => sway(p, t, s.phase, 0.1, 0.05)),
    tap: poseClip((p, t) => squash(p, t, 0.2)),
    select: windowed(s, (p, u) => {
      p.scaleX = p.scaleY = 1 + 0.5 * bump(u);
      p.rotation = 0.18 * s.side * Math.sin(2 * Math.PI * u) * bump(u);
    }),
  }),
  swing: (s) => ({
    tap: poseClip((p, t) => { p.scaleX = 1 - 0.12 * bump(t); }),
    select: windowed(s, (p, u) => { p.scaleX = 1 - 0.72 * plateau(u, 0.05, 0.34, 0.62, 0.94); }),
  }),
  glow: (s) => {
    // one flash per idle loop, at a point set by the phase, inside the loop so the loop closes
    const at = 0.1 + 0.6 * frac(s.phase);
    return {
      idle: poseClip((p, t) => { p.alpha = 0.7 * bump((t - at) / 0.22); }),
      tap: poseClip((p, t) => { p.alpha = 0.4 * bump(t); }),
      select: windowed(s, (p, u) => {
        p.alpha = 0.9 * plateau(u, 0.12, 0.3, 0.7, 0.98);
        p.scaleX = p.scaleY = 1 + 0.3 * bump((u - 0.12) / 0.5);
      }),
    };
  },
};

/** The whole icon's pick: a hop (0.44 s) and a wobble (0.46 s) from its base, a spin (0.56 s) about its centre.
 * A light press squash from the base. */
const BODY_PRESS: PartClip = poseClip((p, t) => squash(p, t, 0.06));
const BODY: Readonly<Record<Exclude<BodyMotion, 'none'>, PartTrack>> = {
  hop: {
    select: windowed({ start: 0, len: 0.58, phase: 0, side: 1 }, (p, u) => {
      const air = bump((u - 0.2) / 0.52);
      const k = 0.05 * bump(u / 0.2) + 0.05 * bump((u - 0.72) / 0.28);
      p.y = -6 * air; p.scaleX = 1 + 0.7 * k - 0.03 * air; p.scaleY = 1 - k + 0.05 * air;
    }),
  },
  wobble: {
    select: windowed({ start: 0, len: 0.6, phase: 0, side: 1 }, (p, u) => {
      p.rotation = 0.15 * Math.sin(3 * Math.PI * u) * (1 - u) * (1 - u);
      p.scaleX = p.scaleY = 1 + 0.08 * bump(u);
    }),
  },
  spin: {
    select: windowed({ start: 0, len: 0.74, phase: 0, side: 1 }, (p, u) => {
      p.rotation = 2 * Math.PI * smootherstep(u);
      p.scaleX = p.scaleY = 1 + 0.06 * bump(u);
    }),
  },
};

export interface RoleRigSpec {
  /** The whole icon's pick motion. Default `hop`. */
  body?: BodyMotion;
  /** Each part by name, in the order the pick plays them: a role, or a track of the game's own clips. */
  parts: Readonly<Record<string, PartRole | PartTrack>>;
  /** Seconds of one idle loop, 2 or more. Default 4. */
  idleSeconds?: number;
}

/** A rig from part roles. In a pick, the short `pop`s play one after another in the order they are listed; the
 * longer moves (a flap, a hop, a spin, a swing, a glow) start early and play across the sequence, at full length,
 * so a late part never turns faster. Everything ends inside SELECT_SECONDS. Neighbouring parts idle out of step
 * and lean opposite ways. */
export function rigFromRoles(name: string, spec: RoleRigSpec): PartRig {
  const names = Object.keys(spec.parts);
  for (const whole of [BODY_PART, BODY_CENTRE_PART]) {
    if (names.includes(whole)) throw new RangeError(`${name}: '${whole}' is the whole icon; name the parts`);
  }
  if (names.length < 2) throw new RangeError(`${name}: an icon needs at least two parts that move on their own`);
  const gap = Math.min(0.12, 0.5 / (names.length - 1));
  const parts: Record<string, PartTrack> = {};
  names.forEach((part, i) => {
    const role = spec.parts[part];
    if (typeof role !== 'string') { parts[part] = role; return; }
    if (!(role in ROLES)) throw new RangeError(`${name}.${part}: unknown role '${role}' (${PART_ROLES.join(', ')})`);
    const len = ROLE_LENGTH[role];
    const start = Math.min(0.06 + i * gap, 0.98 - len);
    parts[part] = ROLES[role]({ start, len, phase: frac(i * 0.23), side: i % 2 ? -1 : 1 });
  });
  const body = spec.body ?? 'hop';
  if (body !== 'none') {
    if (!(body in BODY)) throw new RangeError(`${name}: unknown body motion '${body}' (hop, wobble, spin, none)`);
    parts[BODY_PART] = body === 'spin' ? { tap: BODY_PRESS } : { tap: BODY_PRESS, ...BODY[body] };
    if (body === 'spin') parts[BODY_CENTRE_PART] = BODY.spin;
  }
  return definePartRig({
    name, idleSeconds: spec.idleSeconds ?? IDLE_SECONDS, tapSeconds: TAP_SECONDS,
    selectSeconds: Math.min(SELECT_SECONDS, MAX_PART_CLIP_SECONDS), idleWhenInactive: IDLE_WHEN_INACTIVE, parts,
  });
}
