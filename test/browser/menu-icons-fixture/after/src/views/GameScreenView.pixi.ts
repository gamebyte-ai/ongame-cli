import * as PIXI from 'pixi.js';
import { ScreenView } from '@gamebyte/gamelabsjs/core';
import type { IGameScreenView } from './IGameScreenView';
import { BottomNav } from '../shell/BottomNav';
import { TabIconMotion } from '../shell/tabIconMotion';
import { rigFromRoles } from '../shell/partRoles';
import { shopIcon, homeIcon, settingsIcon } from '../shell/menuIcons';

/** Petal Market lobby: three destinations on the template's bottom menu. */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly titleText = new PIXI.Text({ text: 'Petal Market', style: { fill: 0xffffff, fontSize: 30, fontFamily: 'system-ui', fontWeight: '800' } });
  private readonly detail = new PIXI.Text({ text: '', style: { fill: 0xffe9c7, fontSize: 18, fontFamily: 'system-ui', align: 'center' } });
  private readonly backdrop = new PIXI.Graphics();
  private readonly shop = shopIcon();
  private readonly home = homeIcon();
  private readonly settings = settingsIcon();
  private readonly nav = new BottomNav([
    { id: 'shop', label: 'Shop', icon: () => this.shop.view },
    { id: 'home', label: 'Home', icon: () => this.home.view },
    { id: 'settings', label: 'Settings', icon: () => this.settings.view },
], 'home', { bar: 0x5b2a3c, rim: 0x8c4a63, selected: 0xe8577e, selectedRim: 0xffa7c0 });
  private readonly icons = new TabIconMotion(this.nav, {
    shop: { icon: this.shop, rig: rigFromRoles('stall', { body: 'wobble', parts: { awning: 'flap', wheel: 'spin', rose: 'pop', tulip: 'pop' } }) },
    home: { icon: this.home, rig: rigFromRoles('house', { body: 'hop', parts: { roof: 'hop', door: 'swing', light: 'glow', bush: 'pop' } }) },
    settings: { icon: this.settings, rig: rigFromRoles('coin', { body: 'wobble', parts: { gear: 'spin', sparkle: 'glow' } }) },
  });
  private w = 390; private h = 844;
  private readonly tick = (ticker: PIXI.Ticker) => { const dt = ticker.deltaMS / 1000; this.nav.update(dt); this.icons.update(dt); };
  private select(id: string): void { this.nav.setActive(id); this.refresh(); }
  private refresh(): void {
    this.detail.text = this.nav.active === 'shop' ? 'Fresh petals, every morning.' : this.nav.active === 'home' ? 'Your market stall waits.' : 'Sound, music and Calm.';
  }
  public override postInitialize(): void {
    super.postInitialize();
    this.titleText.anchor.set(0.5); this.detail.anchor.set(0.5);
    this.addChild(this.backdrop, this.titleText, this.detail, this.nav);
    this.nav.onSelect = id => this.select(id);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.nav.setReducedMotion(reduced); this.icons.setReducedMotion(reduced);
    PIXI.Ticker.shared.add(this.tick);
    const g = window as any;
    g.__menu = { nav: this.nav, icons: this.icons, select: (id: string) => this.select(id) };
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
  public override destroy(options?: PIXI.DestroyOptions): void { PIXI.Ticker.shared.remove(this.tick); this.icons.destroy(); super.destroy(); }
}
