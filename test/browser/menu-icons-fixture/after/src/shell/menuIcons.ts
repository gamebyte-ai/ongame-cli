import * as PIXI from 'pixi.js';
import { partedIcon, type PartedIcon } from './tabIconMotion';

/** Game-owned menu icons: every part is its own Graphics whose origin is its joint. All inside 36x36, centred on (0, 0). */
const at = (g: PIXI.Graphics, x: number, y: number): PIXI.Graphics => { g.position.set(x, y); return g; };

export function shopIcon(): PartedIcon {
  const art = new PIXI.Container();
  const stall = new PIXI.Graphics()
    .rect(-15, -9, 3, 25).fill(0x6b3f1d).rect(12, -9, 3, 25).fill(0x6b3f1d)
    .roundRect(-16, 2, 32, 14, 3).fill(0xffb347).stroke({ color: 0x8a4b12, width: 1.5 });
  // awning: joint at its top edge
  const awning = at(new PIXI.Graphics(), 0, -17);
  for (let i = 0; i < 4; i++) {
    awning.poly([-16 + i * 8, 0, -8 + i * 8, 0, -8 + i * 8, 9, -16 + i * 8, 9]).fill(i % 2 ? 0xffffff : 0xff3b3b);
    awning.circle(-12 + i * 8, 9, 4).fill(i % 2 ? 0xffffff : 0xff3b3b);
  }
  // wheel: joint at its axle
  const wheel = at(new PIXI.Graphics(), -8, 10);
  wheel.circle(0, 0, 5).fill(0x1d3b8a).circle(0, 0, 3.5).fill(0xffffff);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; wheel.moveTo(Math.cos(a) * 3.5, Math.sin(a) * 3.5).lineTo(-Math.cos(a) * 3.5, -Math.sin(a) * 3.5).stroke({ color: 0x1d3b8a, width: 1.2 }); }
  wheel.circle(0, 0, 1.3).fill(0xffd600);
  // flowers: joint at the stem base on the counter top
  const rose = at(new PIXI.Graphics(), 1, 2);
  rose.moveTo(0, 0).lineTo(0, -6).stroke({ color: 0x1fa84a, width: 1.8 }).circle(0, -8, 4).fill(0xff2e7e).circle(0, -8, 1.6).fill(0xffd6e8);
  const tulip = at(new PIXI.Graphics(), 9, 2);
  tulip.moveTo(0, 0).lineTo(0, -5).stroke({ color: 0x1fa84a, width: 1.8 }).poly([-3.5, -9, -3, -4, 3, -4, 3.5, -9, 1.5, -7, 0, -10, -1.5, -7]).fill(0xffe600);
  art.addChild(stall, wheel, rose, tulip, awning);
  return partedIcon(art, { awning, wheel, rose, tulip });
}

export function homeIcon(): PartedIcon {
  const art = new PIXI.Container();
  const wall = new PIXI.Graphics().rect(-12, -4, 24, 20).fill(0xfff1d6).stroke({ color: 0x8a5a2b, width: 1.5 });
  // lit room behind the door
  const room = new PIXI.Graphics().rect(-9, 4, 8, 12).fill(0xffe066);
  // door: hinge on its left side
  const door = at(new PIXI.Graphics(), -9, 10);
  door.rect(0, -6, 8, 12).fill(0x2f7bff).circle(6, 0, 1).fill(0xffe600);
  // window light: rests at alpha 0
  const light = at(new PIXI.Graphics(), 6, 5);
  light.rect(-4, -4, 8, 8).fill(0xffff66).stroke({ color: 0xff9900, width: 1.5 }); light.alpha = 0;
  const windowFrame = new PIXI.Graphics().rect(2, 1, 8, 8).fill(0x7fd8ff).stroke({ color: 0x2f7bff, width: 1.5 });
  // roof: joint at bottom centre of the roof
  const roof = at(new PIXI.Graphics(), 0, -3);
  roof.poly([-17, 0, 0, -14, 17, 0]).fill(0xff3b3b).stroke({ color: 0x9c1b1b, width: 1.5 });
  // bush: joint at its base
  const bush = at(new PIXI.Graphics(), 13, 16);
  bush.circle(-1, -3, 3.5).fill(0x1fc24a).circle(3, -4, 3).fill(0x16a03a).circle(0, -6, 2.5).fill(0x4be06a);
  art.addChild(wall, room, windowFrame, door, light, bush, roof);
  return partedIcon(art, { roof, door, light, bush });
}

export function settingsIcon(): PartedIcon {
  const art = new PIXI.Container();
  const coin = new PIXI.Graphics().circle(0, 0, 17).fill(0xffc400).stroke({ color: 0xb36b00, width: 2 }).circle(0, 0, 13).fill(0xffe36b);
  // gear: joint at its centre
  const gear = at(new PIXI.Graphics(), 0, 0);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; gear.circle(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 2.2).fill(0x2f7bff); }
  gear.circle(0, 0, 8).fill(0x2f7bff).circle(0, 0, 3.2).fill(0xffe36b).circle(0, 0, 8).stroke({ color: 0x14308a, width: 1 });
  // sparkle: rests at alpha 0
  const sparkle = at(new PIXI.Graphics(), 10, -10);
  sparkle.poly([0, -7, 1.8, -1.8, 7, 0, 1.8, 1.8, 0, 7, -1.8, 1.8, -7, 0, -1.8, -1.8]).fill(0xffffff).stroke({ color: 0xff7a00, width: 1 }); sparkle.alpha = 0;
  art.addChild(coin, gear, sparkle);
  return partedIcon(art, { gear, sparkle });
}
