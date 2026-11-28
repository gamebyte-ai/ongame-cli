import * as PIXI from 'pixi.js';
import { ScreenView } from '@gamebyte/gamelabsjs/core';
import type { IGameScreenView } from './IGameScreenView';
import { BottomNav } from '../shell/BottomNav';

/** Petal Market lobby: three destinations on the template's bottom menu. */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly titleText = new PIXI.Text({ text: 'Petal Market', style: { fill: 0xffffff, fontSize: 30, fontFamily: 'system-ui', fontWeight: '800' } });
  private readonly detail = new PIXI.Text({ text: '', style: { fill: 0xffe9c7, fontSize: 18, fontFamily: 'system-ui', align: 'center' } });
  private readonly backdrop = new PIXI.Graphics();
  private readonly nav = new BottomNav([
    { id: 'shop', label: 'Shop', icon: () => new PIXI.Graphics().roundRect(-15, -12, 30, 29, 5).fill(0xffd16a).arc(0, -12, 9, Math.PI, 0).stroke({ color: 0xfff3c2, width: 4 }) },
    { id: 'home', label: 'Home', icon: () => new PIXI.Graphics().poly([-18, 0, 0, -18, 18, 0, 12, 0, 12, 17, -12, 17, -12, 0]).fill(0xb8e6ff) },
    { id: 'settings', label: 'Settings', icon: () => new PIXI.Graphics().circle(0, 0, 16).fill(0xf2c14e).circle(0, 0, 7).fill(0x8a5a1c) },
  ], 'home', { bar: 0x5b2a3c, rim: 0x8c4a63, selected: 0xe8577e, selectedRim: 0xffa7c0 });
  private w = 390; private h = 844;
  private readonly tick = (ticker: PIXI.Ticker) => this.nav.update(ticker.deltaMS / 1000);
  private select(id: string): void { this.nav.setActive(id); this.refresh(); }
  private refresh(): void {
    this.detail.text = this.nav.active === 'shop' ? 'Fresh petals, every morning.' : this.nav.active === 'home' ? 'Your market stall waits.' : 'Sound, music and Calm.';
  }
  public override postInitialize(): void {
    super.postInitialize();
    this.titleText.anchor.set(0.5); this.detail.anchor.set(0.5);
    this.addChild(this.backdrop, this.titleText, this.detail, this.nav);
    this.nav.onSelect = id => this.select(id);
    this.nav.setReducedMotion(matchMedia('(prefers-reduced-motion: reduce)').matches);
    PIXI.Ticker.shared.add(this.tick);
    const g = window as any;
    g.__menu = { nav: this.nav, select: (id: string) => this.select(id) };
    if (g.__game) g.__game.hitAreas = () => this.nav.model.snapshot().tabs.map(t => ({ id: `tab-${t.id}`, ...t.hit }));
    this.refresh(); this.onResize(this.w, this.h, 1);
  }
  public setTitle(_title: string): void {}
  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr); this.w = width; this.h = height;
    this.backdrop.clear().rect(0, 0, width, height).fill(0x3a1c2a);
    this.titleText.position.set(width / 2, 90); this.detail.position.set(width / 2, 150);
    this.nav.resize(width, height);
  }
  public override destroy(options?: PIXI.DestroyOptions): void { PIXI.Ticker.shared.remove(this.tick); super.destroy(); }
}
