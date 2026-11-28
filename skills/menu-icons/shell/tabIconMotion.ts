// ongame:menu-icons - written by the onGame menu-icons skill (apply.mjs). Change the skill, not this copy.
import * as PIXI from 'pixi.js';
import { PartPlayer, type PartPose, type PartRig } from './partMotion.js';
import { BODY_CENTRE_PART, BODY_PART } from './partRoles.js';

/** Moves the parts of each bottom-menu icon on its own: an idle loop, a press reaction and a pick sequence.
 *
 * Works on the template's BottomNav (`template:shell-bottom-nav`) as it is: the nav keeps placing and
 * sizing each icon; this moves only the nodes inside it.
 *   press   starts on the tab's `pointerdown`, before the tap is decided
 *   pick    starts when `nav.active` changes, so routing still decides first
 *   idle    runs on the clock the game passes to `nav.update`; full on the selected tab, 35 % on the rest
 * Call `update(seconds)` right after `nav.update(seconds)`. Feed Calm and the system's reduced-motion
 * setting to `setReducedMotion`, as for the nav. Parts change only transforms and alpha, so the bar never
 * repaints for them, and the frame loop makes no new object.
 */
export interface IconPart {
  readonly name: string;
  readonly node: PIXI.Container;
  readonly restX: number; readonly restY: number; readonly restRotation: number;
  readonly restScaleX: number; readonly restScaleY: number; readonly restAlpha: number;
  /** The node parent's local pixels per unit of the icon's 36x36 box. */
  readonly unit: number;
}
/** An icon whose parts can move. Give `view` to the nav's `icon` factory. */
export interface PartedIcon { readonly view: PIXI.Container; readonly parts: readonly IconPart[] }

/** The template BottomNav, as far as this driver reads it. */
export interface BottomNavLike {
  readonly active: string;
  readonly model: { readonly ids: readonly string[] };
  getChildByLabel(label: string, deep?: boolean): PIXI.Container | null;
}

/**
 * Wraps the game's icon art and its named part nodes. `art` is centred on (0, 0) and fits the 36x36 box, as
 * the nav's `icon` factory asks. Each part is a node inside `art` whose origin is the part's joint (a hinge, a
 * wheel's axle, a flower's stem), so it turns and scales about that joint. The pose each node has now is its
 * rest pose. The whole icon becomes two more parts: `body`, with its joint at the icon's base, and inside it
 * `body-centre`, with its joint at the icon's centre.
 */
export function partedIcon(art: PIXI.Container, parts: Readonly<Record<string, PIXI.Container>>): PartedIcon {
  for (const whole of [BODY_PART, BODY_CENTRE_PART]) {
    if (whole in parts) throw new RangeError(`'${whole}' is the whole icon; name the parts`);
  }
  const view = new PIXI.Container();
  view.label = 'menu-icon';
  const body = new PIXI.Container();
  body.label = `part:${BODY_PART}`;
  body.position.set(0, 18);
  body.pivot.set(0, 18);
  const centre = new PIXI.Container();
  centre.label = `part:${BODY_CENTRE_PART}`;
  centre.addChild(art);
  body.addChild(centre);
  view.addChild(body);
  const out: IconPart[] = [rest(BODY_PART, body, 1), rest(BODY_CENTRE_PART, centre, 1)];
  for (const [name, node] of Object.entries(parts)) {
    let unit = 1;
    let up: PIXI.Container | null = node.parent;
    while (up && up !== body) { unit *= up.scale.x; up = up.parent; }
    if (!up) throw new RangeError(`part ${name} is not inside the icon's art`);
    if (!node.label) node.label = `part:${name}`;
    out.push(rest(name, node, unit));
  }
  return { view, parts: out };
}
function rest(name: string, node: PIXI.Container, unit: number): IconPart {
  return { name, node, restX: node.position.x, restY: node.position.y, restRotation: node.rotation,
    restScaleX: node.scale.x, restScaleY: node.scale.y, restAlpha: node.alpha, unit };
}

export interface TabIconSpec { readonly icon: PartedIcon; readonly rig: PartRig }
interface Tab {
  readonly id: string; readonly root: PIXI.Container; readonly player: PartPlayer;
  readonly parts: readonly IconPart[]; readonly onDown: () => void;
}

export class TabIconMotion {
  private readonly nav: BottomNavLike;
  private readonly tabs: Tab[] = [];
  private active: string;
  private reduced = false;
  /** One pose reused for every part every frame. */
  private readonly pose: PartPose = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 0 };

  /** `icons` names every tab of the nav. A tab left out, a rig part the icon lacks, or an icon with fewer
   * than two moving parts besides its body throws: every bottom-menu icon moves part by part. */
  public constructor(nav: BottomNavLike, icons: Readonly<Record<string, TabIconSpec>>) {
    this.nav = nav;
    const ids = nav.model.ids;
    for (const id of Object.keys(icons)) if (!ids.includes(id)) throw new RangeError(`Unknown tab: ${id}`);
    ids.forEach((id, index) => {
      const spec = icons[id];
      if (!spec) throw new RangeError(`${id}: every bottom-menu tab needs a parted icon and a rig (menu-icons skill)`);
      const root = nav.getChildByLabel(`tab-${id}`);
      if (!root) throw new RangeError(`${id}: the nav has no tab-${id} node`);
      if (!root.children.includes(spec.icon.view)) throw new RangeError(`${id}: give icon.view to this tab's icon factory`);
      const names = new Set(spec.icon.parts.map(p => p.name));
      const missing = Object.keys(spec.rig.parts).filter(p => !names.has(p));
      if (missing.length) throw new RangeError(`${id}: the icon has no part ${missing.join(', ')}`);
      const moving = Object.keys(spec.rig.parts).filter(p => p !== BODY_PART && p !== BODY_CENTRE_PART).length;
      if (moving < 2) throw new RangeError(`${id}: an icon needs at least two parts that move on their own`);
      // neighbouring icons start their idle loops at different points, so they never move in step
      const player = new PartPlayer(spec.rig, (index * 0.37) % 1);
      player.setSelected(id === nav.active);
      const parts = spec.icon.parts.filter(p => p.name in spec.rig.parts);
      const tab: Tab = { id, root, player, parts, onDown: () => { player.tap(); this.apply(tab); } };
      root.on('pointerdown', tab.onDown);
      this.tabs.push(tab);
      this.apply(tab);
    });
    this.active = nav.active;
  }

  /** Call on the nav's clock, right after `nav.update(seconds)`. */
  public update(seconds: number): void {
    const now = this.nav.active;
    if (now !== this.active) {
      for (const tab of this.tabs) {
        if (tab.id === now) tab.player.select();
        else tab.player.cancelSelect();
        tab.player.setSelected(tab.id === now);
      }
      this.active = now;
    }
    // under Calm every part already rests where setReducedMotion put it
    if (this.reduced) return;
    for (let i = 0; i < this.tabs.length; i++) {
      this.tabs[i].player.update(seconds);
      this.apply(this.tabs[i]);
    }
  }
  /** Calm, or the system's reduced-motion setting: every part rests. */
  public setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    for (const tab of this.tabs) { tab.player.setReducedMotion(reduced); this.apply(tab); }
  }
  /** Each part's drawn offset from rest (alpha is the drawn alpha), for tests and recorded play. */
  public probe(id: string): { rig: string; idle: number; tapping: boolean; selecting: boolean; settling: boolean;
    parts: Record<string, PartPose> } {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) throw new RangeError(`Unknown tab: ${id}`);
    const parts: Record<string, PartPose> = {};
    for (const p of tab.parts) {
      parts[p.name] = { x: (p.node.position.x - p.restX) * p.unit, y: (p.node.position.y - p.restY) * p.unit,
        rotation: p.node.rotation - p.restRotation, scaleX: p.node.scale.x / p.restScaleX,
        scaleY: p.node.scale.y / p.restScaleY, alpha: p.node.alpha };
    }
    const pl = tab.player;
    return { rig: pl.rig.name, idle: pl.idleStrength, tapping: pl.tapping, selecting: pl.selecting, settling: pl.settling, parts };
  }
  public destroy(): void {
    for (const tab of this.tabs) tab.root.off('pointerdown', tab.onDown);
    this.tabs.length = 0;
  }
  /** Moves each part's node to its pose: transforms and alpha only. */
  private apply(tab: Tab): void {
    for (let i = 0; i < tab.parts.length; i++) {
      const p = tab.parts[i];
      const pose = tab.player.pose(p.name, this.pose);
      p.node.position.set(p.restX + pose.x / p.unit, p.restY + pose.y / p.unit);
      p.node.rotation = p.restRotation + pose.rotation;
      p.node.scale.set(p.restScaleX * pose.scaleX, p.restScaleY * pose.scaleY);
      p.node.alpha = Math.min(1, Math.max(0, p.restAlpha + pose.alpha));
    }
  }
}
