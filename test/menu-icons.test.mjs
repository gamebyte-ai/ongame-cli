// Every bottom-menu icon moves part by part, by default. skills/menu-icons ships the part player, the role clips and
// the driver for the template's BottomNav (copied into a game by apply.mjs), and check.mjs fails a game whose bottom
// menu icons do not move part by part. /make-game, phone-layout and the polish phase point every bottom menu there.
// The shipped TypeScript is loaded with Node's own type stripping; Pixi is a small stand-in here.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as nodeModule from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const scratch = mkdtempSync(join(tmpdir(), 'menu-icons-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

// ---------------------------------------------------------------------------------------------------------------
// Load the shipped TypeScript: strip the types, point the imports at the stripped copies and at a Pixi stand-in.

const PIXI_FAKE = `
export class ObservablePoint { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y = x) { this.x = x; this.y = y; } }
export class Container {
  constructor() { this.position = new ObservablePoint(); this.scale = new ObservablePoint(1, 1); this.pivot = new ObservablePoint();
    this.rotation = 0; this.alpha = 1; this.label = ''; this.children = []; this.parent = null; this.listeners = {}; }
  get x() { return this.position.x; } get y() { return this.position.y; }
  addChild(...cs) { for (const c of cs) { c.parent = this; this.children.push(c); } return cs[0]; }
  getChildByLabel(label) { return this.children.find((c) => c.label === label) ?? null; }
  on(type, fn) { (this.listeners[type] ??= []).push(fn); return this; }
  off(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); return this; }
  emit(type) { for (const fn of [...(this.listeners[type] ?? [])]) fn(); }
}
`;
const strip = nodeModule.stripTypeScriptTypes;
assert.equal(typeof strip, 'function', `Node ${process.version} has no module.stripTypeScriptTypes (Node 22.13 or later)`);
const lib = join(scratch, 'lib');
mkdirSync(lib);
writeFileSync(join(lib, 'pixi.mjs'), PIXI_FAKE);
for (const name of ['partMotion', 'partRoles', 'tabIconMotion']) {
  const js = strip(read(`skills/menu-icons/shell/${name}.ts`))
    .replace(/from '\.\/(\w+)\.js'/g, "from './$1.mjs'").replace(/from 'pixi\.js'/g, "from './pixi.mjs'");
  writeFileSync(join(lib, `${name}.mjs`), js);
}
const load = (name) => import(pathToFileURL(join(lib, `${name}.mjs`)).href);
const M = await load('partMotion');
const R = await load('partRoles');
const D = await load('tabIconMotion');
const PIXI = await load('pixi');

const FRAME = 1 / 60;
const full = (p) => ({ ...M.PART_REST, ...p });
const ROLE_RIG = (role, body = 'none') => R.rigFromRoles(`only-${role}-${body}`, { body, parts: { a: role, b: role, c: role } });
const RIGS = [
  ...R.PART_ROLES.map((role) => ROLE_RIG(role)),
  ...['hop', 'wobble', 'spin'].map((body) => ROLE_RIG('pop', body)),
  R.rigFromRoles('stall', { body: 'wobble', parts: { awning: 'flap', wheel: 'spin', red: 'pop', yellow: 'pop', blue: 'pop', pink: 'pop' } }),
  R.rigFromRoles('house', { body: 'hop', parts: { roof: 'hop', door: 'swing', light: 'glow', bushL: 'pop', bushR: 'pop' } }),
  R.rigFromRoles('coin', { body: 'spin', parts: { gear: 'spin', sparkle: 'glow' } }),
];

// ---------------------------------------------------------------------------------------------------------------
// The role clips

test('every role and body clip starts and ends at rest, every idle loop closes, and no clip is too long', () => {
  for (const rig of RIGS) {
    assert.ok(rig.selectSeconds <= M.MAX_PART_CLIP_SECONDS && rig.tapSeconds <= M.MAX_PART_CLIP_SECONDS, rig.name);
    assert.ok(rig.idleSeconds >= 2, rig.name);
    for (const [part, track] of Object.entries(rig.parts)) {
      for (const clip of ['tap', 'select']) {
        const f = track[clip];
        if (!f) continue;
        assert.ok(M.poseStep(full(f(1e-6)), M.PART_REST) < 0.01, `${rig.name}.${part}.${clip} starts at rest`);
        assert.ok(M.poseStep(full(f(1 - 1e-6)), M.PART_REST) < 0.01, `${rig.name}.${part}.${clip} ends at rest`);
      }
      if (track.idle) assert.ok(M.poseStep(full(track.idle(1e-6)), full(track.idle(1 - 1e-6))) < 0.01, `${rig.name}.${part} idle loop`);
    }
  }
});

test('every role moves its part in a pick, and in idle when it has an idle loop; only a swing and the body have none', () => {
  for (const role of R.PART_ROLES) assert.equal(!!ROLE_RIG(role).parts.a.idle, role !== 'swing', `${role} idle loop`);
  for (const rig of RIGS) {
    for (const [part, track] of Object.entries(rig.parts)) {
      if (!track.select) { assert.equal(part, R.BODY_PART, `${rig.name}.${part} has a pick`); continue; }
      let pick = 0, idle = 0;
      for (let i = 1; i < 200; i++) {
        pick = Math.max(pick, M.poseStep(full(track.select(i / 200)), M.PART_REST));
        if (track.idle) idle = Math.max(idle, M.poseStep(full(track.idle(i / 200)), full(track.idle(0))));
      }
      assert.ok(pick > 0.05, `${rig.name}.${part} pick moves (${pick})`);
      if (track.idle) assert.ok(idle > 0.02, `${rig.name}.${part} idle moves (${idle})`);
    }
  }
});

test('a pick plays the listed parts one after another, inside the sequence', () => {
  const rig = RIGS.find((r) => r.name === 'stall');
  const peaks = ['red', 'yellow', 'blue', 'pink'].map((part) => {
    let best = 0, at = 0;
    for (let i = 1; i < 400; i++) { const d = M.poseStep(full(rig.parts[part].select(i / 400)), M.PART_REST); if (d > best) { best = d; at = i; } }
    return at;
  });
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] > peaks[i - 1], `peaks in list order: ${peaks}`);
  // the spin turns once round and comes back to its start angle
  let most = 0;
  for (let i = 1; i < 400; i++) most = Math.max(most, rig.parts.wheel.select(i / 400).rotation);
  assert.ok(most > 6 && most < 2 * Math.PI + 0.2, `one full turn (${most})`);
});

test('every part moves softly from frame to frame at 60 fps through idle, presses, picks and cut-off picks', () => {
  for (const rig of RIGS) {
    const player = new M.PartPlayer(rig);
    player.setSelected(true);
    const names = Object.keys(rig.parts);
    let last = names.map((p) => player.pose(p));
    let worst = 0;
    for (let f = 0; f < 600; f++) {
      if (f === 30) player.tap();
      if (f === 34) player.select();
      if (f === 50) player.select(); // picked again mid-sequence
      if (f === 60) player.cancelSelect();
      if (f === 90) { player.select(); player.tap(); }
      if (f === 95) player.tap(); // pressed again mid-press
      player.update(FRAME);
      const now = names.map((p) => player.pose(p));
      now.forEach((p, i) => { worst = Math.max(worst, M.poseStep(last[i], p)); });
      last = now;
    }
    assert.ok(worst < 0.4, `${rig.name}: largest step between frames ${worst}`);
  }
});

test('a role clip reuses one pose, so the frame loop makes no new object', () => {
  const rig = RIGS.find((r) => r.name === 'house');
  for (const [part, track] of Object.entries(rig.parts)) {
    for (const clip of ['idle', 'tap', 'select']) {
      if (!track[clip]) continue;
      assert.equal(track[clip](0.3), track[clip](0.6), `${part}.${clip} returns the same object`);
    }
  }
});

test('a rig needs two named parts, known roles and known body motions', () => {
  assert.throws(() => R.rigFromRoles('one', { parts: { roof: 'hop' } }), /at least two parts/);
  assert.throws(() => R.rigFromRoles('body', { parts: { body: 'hop', door: 'swing' } }), /whole icon/);
  assert.throws(() => R.rigFromRoles('odd', { parts: { a: 'bounce', b: 'pop' } }), /unknown role 'bounce'/);
  assert.throws(() => R.rigFromRoles('odd', { body: 'turn', parts: { a: 'pop', b: 'pop' } }), /unknown body motion/);
  assert.throws(() => R.rigFromRoles('centre', { parts: { 'body-centre': 'spin', a: 'pop' } }), /whole icon/);
  const own = { select: (t) => ({ y: -2 * Math.sin(Math.PI * t) }) };
  assert.equal(R.rigFromRoles('mixed', { parts: { a: own, b: 'pop' } }).parts.a, own, "a game's own track is kept");
  assert.ok('body' in R.rigFromRoles('default', { parts: { a: 'pop', b: 'pop' } }).parts, 'the body hops by default');
  assert.ok(!('body' in R.rigFromRoles('still', { body: 'none', parts: { a: 'pop', b: 'pop' } }).parts));
});

test('a cut-off spin finishes its turn forward and the player keeps every part still under reduced motion', () => {
  const rig = M.definePartRig({ name: 'test', idleSeconds: 3, tapSeconds: 0.3, selectSeconds: 0.6, idleWhenInactive: 0,
    parts: { p: { select: (t) => ({ rotation: 2 * Math.PI * t, y: -2 * Math.sin(Math.PI * t) }) } } });
  const player = new M.PartPlayer(rig);
  player.select();
  for (let f = 0; f < 12; f++) player.update(FRAME);
  const before = { ...player.pose('p') };
  player.cancelSelect();
  assert.ok(M.poseStep(before, player.pose('p')) < 1e-9, 'the ease starts at the drawn pose');
  let frames = 0, back = 0, last = before.rotation;
  while (player.settling && frames < 90) {
    player.update(FRAME); frames++;
    const r = player.pose('p').rotation;
    const d = r - last - 2 * Math.PI * Math.round((r - last) / (2 * Math.PI));
    back = Math.max(back, -d); last = r;
  }
  assert.ok(frames > M.PART_SETTLE_SECONDS / FRAME && frames < 60, `settled in ${frames} frames`);
  assert.equal(back, 0, 'never turns back');
  assert.ok(M.poseStep(player.pose('p'), M.PART_REST) < 1e-9);

  for (const r of RIGS) {
    const calm = new M.PartPlayer(r, 0.4);
    calm.setSelected(true);
    calm.setReducedMotion(true);
    calm.tap(); calm.select();
    for (let f = 0; f < 120; f++) {
      calm.update(FRAME);
      for (const p of Object.keys(r.parts)) assert.deepEqual(calm.pose(p), M.PART_REST);
    }
  }
});

test('a press cut off at its peak eases back to rest; only a cut-off pick finishes a turn', () => {
  const rig = R.rigFromRoles('wheel', { body: 'none', parts: { wheel: 'spin', rose: 'pop' } });
  const player = new M.PartPlayer(rig);
  player.tap();
  for (let f = 0; f < 9; f++) player.update(FRAME); // the kick is at its peak, about 0.6 rad
  player.tap(); // pressed again
  let most = 0, frames = 0;
  while ((player.tapping || player.settling) && frames < 120) {
    player.update(FRAME); frames++;
    most = Math.max(most, Math.abs(player.pose('wheel').rotation));
  }
  assert.ok(most < 1, `a double press never spins the wheel round (most ${most.toFixed(2)} rad)`);
  assert.ok(frames <= 0.5 * 60, `it rests within 0.5 s (${frames} frames)`);
});

test('the whole icon spins about its centre, and hops or wobbles from its base', () => {
  const spin = R.rigFromRoles('coin', { body: 'spin', parts: { gear: 'spin', sparkle: 'glow' } });
  assert.ok(spin.parts[R.BODY_CENTRE_PART]?.select, 'a spin body plays on body-centre');
  assert.ok(!spin.parts[R.BODY_PART].select && spin.parts[R.BODY_PART].tap, 'and only presses from the base');
  let most = 0;
  for (let i = 1; i < 400; i++) most = Math.max(most, spin.parts[R.BODY_CENTRE_PART].select(i / 400).rotation);
  assert.ok(most > 6 && most < 2 * Math.PI + 1e-9, `one full turn (${most})`);
  for (const body of ['hop', 'wobble']) {
    const rig = R.rigFromRoles(body, { body, parts: { a: 'pop', b: 'pop' } });
    assert.ok(rig.parts[R.BODY_PART].select && !(R.BODY_CENTRE_PART in rig.parts), body);
  }
});

test('an unselected icon idles at 35 % of the selected one, as drawn', () => {
  const rig = R.rigFromRoles('flowers', { body: 'none', parts: { a: 'pop', b: 'pop' } });
  const drawn = (selected) => {
    const player = new M.PartPlayer(rig);
    player.setSelected(selected);
    for (let f = 0; f < 60; f++) player.update(FRAME); // the strength settles
    let most = 0;
    for (let f = 0; f < 4 * 60; f++) { player.update(FRAME); most = Math.max(most, Math.abs(player.pose('a').rotation)); }
    return most;
  };
  const ratio = drawn(false) / drawn(true);
  assert.ok(Math.abs(ratio - R.IDLE_WHEN_INACTIVE) < 0.02, `ratio ${ratio}`);
});

test('Calm turned on mid-pick drops the pick, so turning it off again starts from rest', () => {
  const rig = R.rigFromRoles('stall', { body: 'wobble', parts: { awning: 'flap', wheel: 'spin' } });
  const player = new M.PartPlayer(rig);
  player.setSelected(true);
  player.select(); player.tap();
  for (let f = 0; f < 10; f++) player.update(FRAME);
  player.setReducedMotion(true);
  player.setReducedMotion(false);
  assert.equal(player.selecting || player.tapping || player.settling, false);
  player.update(FRAME);
  for (const p of Object.keys(rig.parts)) assert.ok(M.poseStep(player.pose(p), M.PART_REST) < 0.4, p);
});

// ---------------------------------------------------------------------------------------------------------------
// The driver, on a stand-in for the template's BottomNav

/** The template BottomNav as the driver reads it: `active`, `model.ids`, a `tab-<id>` node holding the icon view. */
function fakeNav(defs, active) {
  const nav = new PIXI.Container();
  nav.active = active;
  nav.model = { ids: defs.map((d) => d.id) };
  for (const d of defs) {
    const node = new PIXI.Container();
    node.label = `tab-${d.id}`;
    node.addChild(d.icon());
    nav.addChild(node);
  }
  return nav;
}
/** An icon drawn in code: an art container scaled to the 36 box, with part nodes at their joints. */
function makeIcon(names, restAlpha = {}) {
  const art = new PIXI.Container();
  art.scale.set(36 / 120);
  const parts = {};
  names.forEach((name, i) => {
    const n = new PIXI.Container(); n.position.set(20 * i, 10); n.alpha = restAlpha[name] ?? 1; art.addChild(n); parts[name] = n;
  });
  return D.partedIcon(art, parts);
}
const SHOP = ['awning', 'wheel', 'rose'];
const HOME = ['roof', 'door', 'light'];
const shopRig = R.rigFromRoles('stall', { body: 'wobble', parts: { awning: 'flap', wheel: 'spin', rose: 'pop' } });
const homeRig = R.rigFromRoles('house', { parts: { roof: 'hop', door: 'swing', light: 'glow' } });
function setup() {
  const shop = makeIcon(SHOP), home = makeIcon(HOME, { light: 0 });
  const nav = fakeNav([{ id: 'shop', icon: () => shop.view }, { id: 'home', icon: () => home.view }], 'home');
  const motion = new D.TabIconMotion(nav, { shop: { icon: shop, rig: shopRig }, home: { icon: home, rig: homeRig } });
  return { nav, motion, shop, home };
}
const moved = (probe) => Math.max(...Object.values(probe.parts).map((p) => M.poseStep(full({ ...p, alpha: 0 }), M.PART_REST)));

test('partedIcon keeps each part\'s rest pose and its scale to the 36 box, and adds the whole icon as body', () => {
  const icon = makeIcon(SHOP);
  assert.deepEqual(icon.parts.map((p) => p.name), ['body', 'body-centre', ...SHOP]);
  const wheel = icon.parts.find((p) => p.name === 'wheel');
  assert.equal(wheel.restX, 20);
  assert.ok(Math.abs(wheel.unit - 0.3) < 1e-9, `unit ${wheel.unit}`);
  assert.equal(icon.parts[0].node.parent, icon.view);
  assert.equal(icon.parts[1].node.parent, icon.parts[0].node);
  const art = new PIXI.Container();
  assert.throws(() => D.partedIcon(art, { stray: new PIXI.Container() }), /not inside the icon's art/);
  assert.throws(() => D.partedIcon(art, { body: new PIXI.Container() }), /whole icon/);
});

test('the driver idles the parts, fuller on the selected tab, and plays a press and a pick', () => {
  const { nav, motion } = setup();
  for (let f = 0; f < 60; f++) motion.update(FRAME);
  const home = motion.probe('home'), shop = motion.probe('shop');
  assert.ok(home.idle > shop.idle && Math.abs(shop.idle - R.IDLE_WHEN_INACTIVE) < 1e-9, `idle ${home.idle} vs ${shop.idle}`);
  assert.ok(moved(home) > 0.001, 'the selected icon idles part by part');

  nav.getChildByLabel('tab-shop').emit('pointerdown');
  assert.equal(motion.probe('shop').tapping, true, 'a press starts when the finger lands');
  for (let f = 0; f < 6; f++) motion.update(FRAME);
  assert.ok(moved(motion.probe('shop')) > 0.02, 'a press moves the parts');

  nav.active = 'shop'; // the game's routing accepted the tab and called setActive
  motion.update(FRAME);
  assert.equal(motion.probe('shop').selecting, true, 'the pick plays on the new tab');
  for (let f = 0; f < 12; f++) motion.update(FRAME);
  const body = motion.probe('shop').parts.body;
  assert.ok(Math.abs(body.rotation) > 0.01, `the whole icon wobbles (${body.rotation})`);
  for (let f = 0; f < 30; f++) motion.update(FRAME);
  assert.equal(motion.probe('shop').idle, 1, 'the newly selected tab idles at full strength');
  assert.ok(Math.abs(motion.probe('home').idle - R.IDLE_WHEN_INACTIVE) < 1e-9, 'the tab it left drops to 35 %');
  nav.active = 'home';
  motion.update(FRAME);
  assert.equal(motion.probe('shop').selecting, false, 'leaving a tab ends its pick');
  assert.equal(motion.probe('shop').settling, true, 'and eases it back from where it is drawn');
  for (let f = 0; f < 120; f++) motion.update(FRAME);
  assert.equal(motion.probe('shop').settling, false);
});

test('the driver keeps every part at rest under Calm, and stops listening when destroyed', () => {
  const { nav, motion } = setup();
  motion.setReducedMotion(true);
  nav.getChildByLabel('tab-home').emit('pointerdown');
  nav.active = 'shop';
  for (let f = 0; f < 120; f++) {
    motion.update(FRAME);
    for (const id of ['shop', 'home']) {
      for (const [name, p] of Object.entries(motion.probe(id).parts)) {
        assert.ok(M.poseStep(full({ ...p, alpha: 0 }), M.PART_REST) < 1e-9, `${id}.${name} rests`);
      }
    }
  }
  motion.setReducedMotion(false);
  motion.destroy();
  assert.equal(nav.getChildByLabel('tab-home').listeners.pointerdown.length, 0, 'its pointerdown listener is gone');
});

test('the driver moves each node by the pose over its unit, and lights a glow from alpha 0', () => {
  const own = { idle: (t) => ({ x: 2 * Math.sin(2 * Math.PI * t), y: -3 * Math.sin(2 * Math.PI * t) }) };
  const rig = M.definePartRig({ name: 'own', idleSeconds: 3, tapSeconds: 0.3, selectSeconds: 0.6, idleWhenInactive: 0.35,
    parts: { a: own, b: own } });
  const one = makeIcon(['a', 'b']), two = makeIcon(['a', 'b']);
  const nav = fakeNav([{ id: 'one', icon: () => one.view }, { id: 'two', icon: () => two.view }], 'one');
  const motion = new D.TabIconMotion(nav, { one: { icon: one, rig }, two: { icon: two, rig } });
  const twin = new M.PartPlayer(rig, 0); // the first tab's phase
  twin.setSelected(true);
  for (let f = 0; f < 20; f++) { motion.update(FRAME); twin.update(FRAME); }
  const a = one.parts.find((p) => p.name === 'a'), want = twin.pose('a');
  assert.ok(Math.abs(want.y) > 0.5, 'the part is away from rest');
  assert.ok(Math.abs(a.node.position.x - (a.restX + want.x / 0.3)) < 1e-9, 'x is the pose over the unit');
  assert.ok(Math.abs(a.node.position.y - (a.restY + want.y / 0.3)) < 1e-9, 'y is the pose over the unit');

  const { nav: nav2, motion: motion2, home } = setup();
  const light = home.parts.find((p) => p.name === 'light').node;
  assert.equal(light.alpha, 0, 'a glow rests at alpha 0');
  nav2.active = 'shop'; motion2.update(FRAME);
  nav2.active = 'home';
  let brightest = 0;
  for (let f = 0; f < 50; f++) { motion2.update(FRAME); brightest = Math.max(brightest, light.alpha); }
  assert.ok(brightest > 0.5, `the pick lights it (${brightest})`);
  motion2.setReducedMotion(true);
  for (let f = 0; f < 30; f++) motion2.update(FRAME);
  assert.equal(light.alpha, 0, 'Calm puts it out');
  assert.equal(motion2.probe('home').idle, 0);
  motion2.setReducedMotion(false);
  for (let f = 0; f < 60; f++) motion2.update(FRAME);
  assert.equal(motion2.probe('home').idle, 1, 'the selected tab idles at full strength');
  assert.ok(Math.abs(motion2.probe('shop').idle - R.IDLE_WHEN_INACTIVE) < 1e-9, 'the tab left idles at 35 %');
});

test('the driver refuses a tab left still, a part the icon lacks, a one-part icon and a view the nav does not hold', () => {
  const shop = makeIcon(SHOP), home = makeIcon(HOME);
  const nav = fakeNav([{ id: 'shop', icon: () => shop.view }, { id: 'home', icon: () => home.view }], 'home');
  assert.throws(() => new D.TabIconMotion(nav, { shop: { icon: shop, rig: shopRig } }), /home: every bottom-menu tab needs a parted icon/);
  assert.throws(() => new D.TabIconMotion(nav, { shop: { icon: shop, rig: shopRig }, home: { icon: home, rig: homeRig }, x: { icon: home, rig: homeRig } }), /Unknown tab: x/);
  assert.throws(() => new D.TabIconMotion(nav, { shop: { icon: shop, rig: homeRig }, home: { icon: home, rig: homeRig } }), /shop: the icon has no part roof, door, light/);
  const lone = M.definePartRig({ name: 'lone', idleSeconds: 3, tapSeconds: 0.3, selectSeconds: 0.6, idleWhenInactive: 0.35,
    parts: { body: { select: (t) => ({ y: -Math.sin(Math.PI * t) }) }, roof: { select: (t) => ({ y: -Math.sin(Math.PI * t) }) } } });
  assert.throws(() => new D.TabIconMotion(nav, { shop: { icon: shop, rig: shopRig }, home: { icon: home, rig: lone } }), /home: an icon needs at least two parts/);
  assert.throws(() => new D.TabIconMotion(nav, { shop: { icon: home, rig: homeRig }, home: { icon: home, rig: homeRig } }), /shop: give icon.view/);
});

// ---------------------------------------------------------------------------------------------------------------
// apply.mjs and check.mjs on fixture games

const run = (script, ...args) => {
  const r = spawnSync(process.execPath, [join(root, 'skills/menu-icons', script), ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
let games = 0;
/** A game folder with the given files under src/. */
function game(files) {
  const dir = join(scratch, `game-${++games}`);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, 'src', rel, '..'), { recursive: true });
    writeFileSync(join(dir, 'src', rel), text);
  }
  mkdirSync(join(dir, 'src'), { recursive: true });
  return dir;
}
const NAV_ONLY = `import { BottomNav } from './shell/BottomNav.js';
export function makeNav(icons) {
  const nav = new BottomNav([
    { id: 'shop', label: 'Shop', icon: () => icons.shop },
    { id: 'home', label: 'Home', icon: () => icons.home },
  ], 'home');
  return nav;
}
`;
const NAV_DRIVEN = `import { BottomNav } from './shell/BottomNav.js';
import { TabIconMotion, partedIcon } from './shell/tabIconMotion.js';
export class Lobby {
  private nav = new BottomNav([{ id: 'shop', label: 'Shop', icon: () => shop.view }, { id: 'home', label: 'Home', icon: () => home.view }]);
  private icons = new TabIconMotion(this.nav!, { shop: { icon: shop, rig: shopRig }, home: { icon: home, rig: homeRig } });
}
`;
const TEMPLATE_NAV = `import { BottomTabs } from './BottomTabs.js';
export class BottomNav { constructor(defs) { this.model = new BottomTabs(defs.map((d) => d.id)); } }
`;

test('apply.mjs writes the three files, changes nothing on a second run and updates an older copy', () => {
  const dir = game({ 'main.ts': NAV_ONLY });
  let r = run('apply.mjs', dir);
  assert.equal(r.code, 0, r.out);
  for (const f of ['partMotion.ts', 'partRoles.ts', 'tabIconMotion.ts']) {
    assert.equal(readFileSync(join(dir, 'src/shell', f), 'utf8'), read(`skills/menu-icons/shell/${f}`));
    assert.match(r.out, new RegExp(`src/shell/${f} written`));
  }
  r = run('apply.mjs', dir);
  assert.equal(r.code, 0, r.out);
  assert.equal((r.out.match(/already current/g) ?? []).length, 3, r.out);
  writeFileSync(join(dir, 'src/shell/partRoles.ts'), '// ongame:menu-icons - an older copy\nexport {};\n');
  r = run('apply.mjs', dir);
  assert.match(r.out, /src\/shell\/partRoles\.ts updated/);
  assert.equal(readFileSync(join(dir, 'src/shell/partRoles.ts'), 'utf8'), read('skills/menu-icons/shell/partRoles.ts'));
});

test("apply.mjs never overwrites the game's own file, and then writes nothing", () => {
  const dir = game({ 'shell/partRoles.ts': 'export const mine = 1;\n' });
  const r = run('apply.mjs', dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /src\/shell\/partRoles\.ts is the game's own file; not overwritten/);
  assert.equal(readFileSync(join(dir, 'src/shell/partRoles.ts'), 'utf8'), 'export const mine = 1;\n');
  assert.equal(existsSync(join(dir, 'src/shell/partMotion.ts')), false, 'no other file written');
  assert.equal(run('apply.mjs', join(scratch, 'no-such-game')).code, 2);
});

test('check.mjs fails a bottom menu whose icons do not move part by part, and names its line', () => {
  const dir = game({ 'main.ts': NAV_ONLY, 'shell/BottomNav.ts': TEMPLATE_NAV });
  const r = run('check.mjs', dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL src\/main\.ts:3 new BottomNav\(\.\.\.\): its icons do not move part by part/);
  assert.doesNotMatch(r.out, /BottomNav\.ts.*BottomTabs/, "the template's own BottomTabs is not a second menu");
});

test('check.mjs passes a driven nav once apply.mjs wrote the files, and fails a missing or edited copy', () => {
  const dir = game({ 'lobby.ts': NAV_DRIVEN, 'shell/BottomNav.ts': TEMPLATE_NAV });
  let r = run('check.mjs', dir);
  assert.equal(r.code, 1, r.out);
  assert.equal((r.out.match(/is missing: run apply\.mjs/g) ?? []).length, 3, r.out);
  assert.equal(run('apply.mjs', dir).code, 0);
  r = run('check.mjs', dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1 bottom menu\(s\), every icon moves part by part/);
  const file = join(dir, 'src/shell/partRoles.ts');
  writeFileSync(file, readFileSync(file, 'utf8').replace('0.76', '1.5'));
  r = run('check.mjs', dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL src\/shell\/partRoles\.ts: an older or edited copy/);
  writeFileSync(file, readFileSync(file, 'utf8').replace('1.5', '0.76').replace(/\n/g, '\r\n'));
  assert.equal(run('check.mjs', dir).code, 0, 'a copy checked out with CRLF is still current');
});

test('check.mjs matches each nav to its own driver', () => {
  const two = `import { BottomNav } from './shell/BottomNav.js';
const shopNav = new BottomNav(defs);
const mapNav = new BottomNav(defs);
const icons = new TabIconMotion(shopNav as BottomNav, specs);
`;
  const dir = game({ 'two.ts': two });
  run('apply.mjs', dir);
  const r = run('check.mjs', dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL src\/two\.ts:3 /);
  assert.doesNotMatch(r.out, /two\.ts:2 /);
  const inline = game({ 'inline.ts': 'export const icons = new TabIconMotion(new BottomNav(defs), specs);\n' });
  run('apply.mjs', inline);
  assert.equal(run('check.mjs', inline).code, 0);
});

test('check.mjs credits a driver only to the nav in its own class, scope or import, never to another nav of that name', () => {
  const screen = (driven) => `import { BottomNav } from '../shell/BottomNav.js';
export class Screen {
  private nav = new BottomNav(defs);
${driven ? '  private icons = new TabIconMotion(this.nav, specs);\n' : ''}}
`;
  const classes = game({ 'views/Shop.ts': screen(true), 'views/Map.ts': screen(false) });
  run('apply.mjs', classes);
  let r = run('check.mjs', classes);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL src\/views\/Map\.ts:3 /);
  assert.doesNotMatch(r.out, /Shop\.ts/);

  const functions = game({ 'menus.ts': `export function shop() {
  const nav = new BottomNav(defs);
  return new TabIconMotion(nav, specs);
}
export function map() {
  const nav = new BottomNav(defs);
  return nav;
}
` });
  run('apply.mjs', functions);
  r = run('check.mjs', functions);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL src\/menus\.ts:6 /);
  assert.doesNotMatch(r.out, /menus\.ts:2 /);

  const imported = game({ 'nav.ts': 'export const nav = new BottomNav(defs);\n',
    'motion.ts': "import { nav } from './nav.js';\nexport const icons = new TabIconMotion(nav, specs);\n" });
  run('apply.mjs', imported);
  assert.equal(run('check.mjs', imported).code, 0, 'an exported nav driven where it is imported passes');
  const unimported = game({ 'nav.ts': 'export const nav = new BottomNav(defs);\n',
    'motion.ts': 'const nav = make();\nexport const icons = new TabIconMotion(nav, specs);\n' });
  run('apply.mjs', unimported);
  assert.equal(run('check.mjs', unimported).code, 1, 'another file\'s own `nav` does not drive it');
});

test('check.mjs follows private fields, imports by their source and name, and navs returned from a factory', () => {
  const ok = (files) => { const dir = game(files); run('apply.mjs', dir); return run('check.mjs', dir); };
  let r = ok({ 'Lobby.ts': 'export class Lobby {\n  #nav = new BottomNav(defs);\n  #icons = new TabIconMotion(this.#nav, specs);\n}\n' });
  assert.equal(r.code, 0, r.out);
  r = ok({ 'a/nav.ts': 'export const nav = new BottomNav(defs);\n', 'b/nav.ts': 'export const nav = new BottomNav(defs);\n',
    'motion.ts': "import { nav } from './a/nav.js';\nexport const icons = new TabIconMotion(nav, specs);\n" });
  assert.equal(r.code, 1, 'a driver of a/nav does not move b/nav');
  assert.match(r.out, /FAIL src\/b\/nav\.ts:1 /);
  assert.doesNotMatch(r.out, /a\/nav\.ts/);
  r = ok({ 'nav.ts': 'const nav = new BottomNav(defs);\nexport { nav as menu };\n',
    'motion.ts': "import { menu as shopNav } from './nav';\nexport const icons = new TabIconMotion(shopNav, specs);\n" });
  assert.equal(r.code, 0, `an export and an import under other names pass: ${r.out}`);
  r = ok({ 'nav.ts': 'export const nav = new BottomNav(defs);\n',
    'motion.ts': "import * as menus from './nav.ts';\nexport const icons = new TabIconMotion(menus.nav, specs);\n" });
  assert.equal(r.code, 0, `a namespace import passes: ${r.out}`);
  r = ok({ 'menu.ts': 'export function makeNav() { return new BottomNav(defs); }\n',
    'screen.ts': "import { makeNav } from './menu.js';\nconst nav = makeNav();\nexport const icons = new TabIconMotion(nav, specs);\n" });
  assert.equal(r.code, 0, `a nav from a factory passes with a driver left over: ${r.out}`);
  r = ok({ 'menu.ts': 'export function makeNav() { return new BottomNav(defs); }\n' });
  assert.equal(r.code, 1, 'and fails with none');
});

test('check.mjs resolves a driven name to its nearest declaration, so an inner nav never credits an outer one', () => {
  const ok = (text) => { const dir = game({ 'menus.ts': text }); run('apply.mjs', dir); return run('check.mjs', dir); };
  let r = ok(`const nav = new BottomNav(defs);
function makeOther() {
  const nav = new BottomNav(defs);
  return new TabIconMotion(nav, specs);
}
`);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL src\/menus\.ts:1 /);
  assert.doesNotMatch(r.out, /menus\.ts:3 /);
  r = ok(`const nav = new BottomNav(defs);
function wire(other) {
  return new TabIconMotion(nav, specs);
}
`);
  assert.equal(r.code, 0, `an outer nav driven from an inner function passes: ${r.out}`);
  r = ok(`const nav = new BottomNav(defs);
function wire(nav) {
  return new TabIconMotion(nav, specs);
}
`);
  assert.equal(r.code, 1, 'a parameter of the same name is another nav');
  r = ok('const nav = new BottomNav(defs);\nexport const wire = () => new TabIconMotion(nav, specs);\n');
  assert.equal(r.code, 0, `a driver in an arrow's expression body passes: ${r.out}`);
});

test('check.mjs reads a build/ folder inside src/, and skips build output in a game with no src/', () => {
  const dir = game({ 'build/BuildMenu.ts': 'export const nav = new BottomNav(defs);\n' });
  const r = run('check.mjs', dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL src\/build\/BuildMenu\.ts:1 /);
  const flat = join(scratch, 'flat-game');
  for (const [rel, text] of Object.entries({ 'main.js': 'export const x = 1;\n', 'dist/assets/index.js': 'const n = new BottomNav(d);\n',
    'android/app/public/index.js': 'const n = new BottomNav(d);\n', 'node_modules/ui/nav.js': 'const n = new BottomNav(d);\n' })) {
    mkdirSync(join(flat, rel, '..'), { recursive: true });
    writeFileSync(join(flat, rel), text);
  }
  const f = run('check.mjs', flat);
  assert.equal(f.code, 0, f.out);
  assert.match(f.out, /no bottom menu/);
});

test('check.mjs exits 1 when a menu fails beside an unreadable file, 2 on a missing folder or no argument; apply.mjs needs src/', () => {
  const dir = game({ 'nav.ts': 'export const nav = new BottomNav(defs);\n', 'broken.ts': 'const n = new BottomNav(;\n' });
  assert.equal(run('check.mjs', dir).code, 1);
  assert.equal(run('check.mjs', join(scratch, 'no-such-game')).code, 2);
  assert.equal(run('check.mjs').code, 2);
  const empty = join(scratch, 'empty-folder');
  mkdirSync(empty);
  assert.equal(run('apply.mjs', empty).code, 2);
  assert.equal(existsSync(join(empty, 'src')), false, 'nothing written');
});

test('the browser fixture: its one-piece menu fails the check, and the menu an agent built from SKILL.md passes', () => {
  const fixture = join(root, 'test/browser/menu-icons-fixture');
  const before = game({});
  cpSync(join(fixture, 'before/src'), join(before, 'src'), { recursive: true });
  const r = run('check.mjs', before);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL src\/views\/GameScreenView\.pixi\.ts:\d+ new BottomNav/);
  const after = game({});
  cpSync(join(fixture, 'after/src'), join(after, 'src'), { recursive: true });
  assert.equal(run('apply.mjs', after).code, 0);
  const a = run('check.mjs', after);
  assert.equal(a.code, 0, a.out);
});

test('check.mjs passes a nav whose every tab has a rig, a renderer with its own PartPlayer, and a game with no menu', () => {
  const rigged = game({ 'nav.ts': `const nav = new BottomNav([
  { id: 'shop', label: 'Shop', icon, rig: RIGS.stall }, { id: 'home', label: 'Home', icon, rig: RIGS.house }]);
` });
  assert.equal(run('check.mjs', rigged).code, 0);
  const half = game({ 'nav.ts': "const nav = new BottomNav([{ id: 'shop', label: 'Shop', icon, rig }, { id: 'home', label: 'Home', icon }]);\n" });
  assert.equal(run('check.mjs', half).code, 1, 'one tab without a rig fails');
  const svg = game({ 'svgNav.ts': 'const tabs = new BottomTabs(ids, "home");\n' });
  let r = run('check.mjs', svg);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL src\/svgNav\.ts:1 new BottomTabs\(\.\.\.\)/);
  const svgMoving = game({ 'svgNav.ts': 'const tabs = new BottomTabs(ids, "home");\nconst shop = new PartPlayer(rig);\n' });
  assert.equal(run('check.mjs', svgMoving).code, 0);
  const elsewhere = game({ 'svgNav.ts': 'const tabs = new BottomTabs(ids, "home");\n', 'fx.ts': 'const p = new PartPlayer(rig);\n' });
  assert.equal(run('check.mjs', elsewhere).code, 1, 'a PartPlayer in another file does not move this menu');
  r = run('check.mjs', game({ 'main.ts': 'export const x = 1;\n', 'shell/BottomTabs.test.ts': 'new BottomTabs(["a", "b"]);\n' }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /no bottom menu in this game/);
});

test('check.mjs never passes a file it cannot read that names a menu, and does not parse a file that names none', () => {
  const dir = game({ 'main.ts': 'export const x = 1;\n', 'broken.ts': 'const nav = new BottomNav(;\n' });
  const r = run('check.mjs', dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /cannot read src\/broken\.ts/);
  assert.match(r.out, /not a pass/);
  const levels = game({ 'main.ts': 'export const x = 1;\n', 'levels.ts': 'const = ;\n' });
  assert.equal(run('check.mjs', levels).code, 0, 'a file with no menu name cannot hold a menu');
});

// ---------------------------------------------------------------------------------------------------------------
// /make-game reaches it

test('make-game, phone-layout and the polish phase make part-by-part icons the default for every bottom menu', () => {
  const make = read('commands/make-game.md');
  assert.ok(make.includes('skills/menu-icons/SKILL.md'), 'make-game names the skill');
  assert.ok(make.includes('node <pluginRoot>/skills/menu-icons/check.mjs {gameDir}'), 'make-game runs the check before done');
  assert.ok(read('skills/phone-layout/SKILL.md').includes('skills/menu-icons/SKILL.md'), 'phone-layout points the tab bar there');
  const polish = read('skills/phases/polish/SKILL.md');
  assert.ok(polish.includes('skills/menu-icons/SKILL.md'), 'the polish phase points the bottom nav there');
  assert.ok(polish.includes('menu-icons/check.mjs {gameDir}'), 'the polish phase runs the check before the play gate');
  const skill = read('skills/menu-icons/SKILL.md');
  assert.match(skill, /^---\nname: menu-icons\ndescription: \S.{40,}\n---\n/);
  assert.doesNotMatch(skill + read('skills/menu-icons/apply.mjs') + read('skills/menu-icons/check.mjs')
    + ['partMotion', 'partRoles', 'tabIconMotion'].map((f) => read(`skills/menu-icons/shell/${f}.ts`)).join(''),
  /\bfleet\b|\bi_[a-z0-9]{8}\b|\/home\/|\/Users\/|gamebyte-ai\//i, 'ships nothing internal');
});
