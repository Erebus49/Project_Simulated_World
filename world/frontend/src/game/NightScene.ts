import Phaser from 'phaser';
import mapData from '../maps/night-town.json';
import { CHARACTER_ATLAS, TOWN_ATLAS, characterTiles } from '../townArt';
import type { Game, Point } from '../types';
import { NIGHT_COMPOSITE } from './nightShader';
import { NpcMotionPlayer, type NpcPose } from './NpcMotion';

const WORLD_WIDTH = mapData.width * mapData.tilewidth;
const WORLD_HEIGHT = mapData.height * mapData.tileheight;

export type WorldFrame = { state: Game | null; position: Point; moving: boolean; direction: string; selected: string; disabled: boolean; effects: boolean; paused: boolean };
export type CameraFrame = { x: number; y: number; zoom: number; width: number; height: number };
export type SceneBridge = {
  read: () => WorldFrame;
  step: (seconds: number, time: number) => void;
  camera: (frame: CameraFrame) => void;
  ready: (renderer: string) => void;
  interact: (id: string) => void;
  error: (message: string) => void;
  poses: (poses: Record<string, NpcPose>) => void;
};

export class BootScene extends Phaser.Scene {
  constructor(private bridge: SceneBridge) { super('Boot'); }
  preload() {
    this.load.spritesheet('town', TOWN_ATLAS, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('people', CHARACTER_ATLAS, { frameWidth: 16, frameHeight: 16 });
    this.load.on('loaderror', () => this.bridge.error('本地像素素材加载失败，请刷新重试。'));
  }
  create() {
    this.textures.get('town').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('people').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.scene.start('Night');
  }
}

export class NightScene extends Phaser.Scene {
  private terrain!: Phaser.GameObjects.RenderTexture;
  private world!: Phaser.GameObjects.RenderTexture;
  private glow!: Phaser.GameObjects.RenderTexture;
  private composite?: Phaser.GameObjects.Shader;
  private player!: Phaser.GameObjects.Image;
  private characters = new Map<string, Phaser.GameObjects.Image>();
  private halos: Phaser.GameObjects.Image[] = [];
  private pixels!: Phaser.GameObjects.Graphics;
  private gate!: Phaser.GameObjects.Image;
  private accumulator = 0;
  private simulationTime = 0;
  private powerOff = false;
  private anomalyCount = 0;
  private damage = 0;
  private lastCamera = '';
  private sceneFrame = 0;
  private fallbackWorld?: Phaser.GameObjects.Image;
  private fallbackGlow?: Phaser.GameObjects.Image;
  private npcMotion = new NpcMotionPlayer();
  private nextPosePublish = 0;
  constructor(private bridge: SceneBridge) { super('Night'); }

  create() {
    this.terrain = new Phaser.GameObjects.RenderTexture(this, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.world = new Phaser.GameObjects.RenderTexture(this, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.glow = new Phaser.GameObjects.RenderTexture(this, 0, 0, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.terrain.setOrigin(0); this.world.setOrigin(0); this.glow.setOrigin(0);
    this.terrain.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.world.saveTexture('night-world'); this.glow.saveTexture('night-glow');
    this.world.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.glow.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.buildTerrain();
    this.makeGlowTexture();
    this.player = new Phaser.GameObjects.Image(this, 239, 207, 'people', characterTiles.player).setOrigin(.5, 1);
    this.gate = new Phaser.GameObjects.Image(this, 233, 254, 'people', 68).setOrigin(0);
    this.pixels = this.make.graphics({ x: 0, y: 0 }, false);
    const locations = [[120, 122], [56, 104], [88, 104], [190, 141], [314, 146], [263, 231], [379, 93], [239, 265], [239, 211],
                       [450, 157], [570, 158], [671, 210], [671, 285], [589, 322], [422, 322], [285, 322], [511, 242]];
    this.halos = locations.map(([x, y]) => new Phaser.GameObjects.Image(this, x / 2, y / 2, 'soft-glow'));
    const webgl = this.game.renderer.type === Phaser.WEBGL;
    if (webgl) {
      this.composite = this.add.shader({
        name: 'PineconeNightComposite', fragmentSource: NIGHT_COMPOSITE,
        setupUniforms: (set: (name: string, value: unknown) => void) => {
          const view = this.cameraFrame();
          set('uWorld', 0); set('uGlow', 1); set('uWorldSize', [WORLD_WIDTH, WORLD_HEIGHT]);
          set('uCamera', [view.x, view.y]); set('uView', [view.width, view.height]);
          set('uZoom', view.zoom); set('uTime', this.time.now / 1000);
          set('uDamage', this.damage); set('uEffects', this.bridge.read().effects ? 1 : 0);
        },
      }, 0, 0, this.scale.width, this.scale.height, ['night-world', 'night-glow']).setOrigin(0);
    } else {
      this.fallbackWorld = this.add.image(0, 0, this.world.texture).setOrigin(0).setTint(0x8292b5);
      this.fallbackGlow = this.add.image(0, 0, this.glow.texture).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.25);
    }
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.bridge.read().disabled) return;
      const camera = this.cameraFrame();
      const point = { x: pointer.x / camera.zoom + camera.x, y: pointer.y / camera.zoom + camera.y };
      const state = this.bridge.read().state;
      const targets = [...(state?.mystery?.anchors || []), ...(state?.people.filter(person => person.position).map(person => ({ id: person.id, ...person.position! })) || [])];
      const target = targets.map(item => ({ ...item, distance: Math.hypot(item.x - point.x, item.y - point.y) })).sort((a, b) => a.distance - b.distance)[0];
      if (target && target.distance < 14) this.bridge.interact(target.id);
    });
    this.scale.on('resize', () => { this.composite?.setSize(this.scale.width, this.scale.height); this.publishCamera(); });
    this.game.events.on(Phaser.Core.Events.BLUR, this.resetClock, this);
    this.game.events.on(Phaser.Core.Events.FOCUS, this.resetClock, this);
    this.events.once('shutdown', () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.resetClock, this);
      this.game.events.off(Phaser.Core.Events.FOCUS, this.resetClock, this);
      this.terrain.destroy(); this.world.destroy(); this.glow.destroy(); this.player.destroy(); this.gate.destroy(); this.pixels.destroy();
      this.characters.forEach(character => character.destroy()); this.halos.forEach(halo => halo.destroy());
    });
    this.bridge.ready(webgl ? 'webgl' : 'canvas-fallback');
    this.publishCamera();
  }

  private resetClock() { this.accumulator = 0; }

  private buildTerrain() {
    const objects: Phaser.GameObjects.Image[] = [];
    const addTile = (gid: number, x: number, y: number, width = 16, height = 16, clip?: number[]) => {
      const dungeon = gid >= 1001;
      const image = new Phaser.GameObjects.Image(this, x, y, dungeon ? 'people' : 'town', gid - (dungeon ? 1001 : 1)).setOrigin(0).setDisplaySize(width, height);
      if (clip) {
        const [left, top, w, h] = clip;
        const x0 = Math.max(0, left - x), y0 = Math.max(0, top - y), x1 = Math.min(width, left + w - x), y1 = Math.min(height, top + h - y);
        if (x1 <= x0 || y1 <= y0) { image.destroy(); return; }
        image.setCrop(x0, y0, x1 - x0, y1 - y0);
      }
      objects.push(image);
    };
    for (const layer of mapData.layers) {
      if (!layer.visible) continue;
      if (layer.type === 'tilelayer' && 'data' in layer) {
        const clipValue = layer.properties?.find(property => property.name === 'clipRect')?.value;
        const clip = clipValue ? JSON.parse(clipValue) : undefined;
        layer.data?.forEach((gid, index) => { if (gid) addTile(gid, index % mapData.width * 16 + (layer.offsetx || 0), Math.floor(index / mapData.width) * 16 + (layer.offsety || 0), 16, 16, clip); });
      } else if ('objects' in layer) {
        for (const object of layer.objects || []) {
          if ('gid' in object && object.gid && object.name !== 'South gate') addTile(object.gid, object.x, object.y - (object.height || 16), object.width || 16, object.height || 16);
        }
      }
    }
    this.terrain.draw(objects);
    this.terrain.render();
    objects.forEach(object => object.destroy());
  }

  private makeGlowTexture() {
    const texture = this.textures.createCanvas('soft-glow', 96, 96)!;
    const ctx = texture.context;
    const gradient = ctx.createRadialGradient(48, 48, 1, 48, 48, 48);
    gradient.addColorStop(0, '#fff4dcf0'); gradient.addColorStop(.16, '#fff0d690'); gradient.addColorStop(.5, '#fff0d62a'); gradient.addColorStop(1, '#fff0d600');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 96, 96); texture.refresh(); texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  private cameraFrame(): CameraFrame {
    const { position } = this.bridge.read();
    const width = this.scale.width, height = this.scale.height;
    const zoom = width < 600 ? 3 : Math.max(2, Math.min(4, Math.floor(width / 460)));
    const horizontal = WORLD_WIDTH - width / zoom, vertical = WORLD_HEIGHT - height / zoom;
    return { x: Math.round(horizontal < 0 ? horizontal / 2 : Phaser.Math.Clamp(position.x - width / zoom / 2, 0, horizontal)),
      y: Math.round(vertical < 0 ? vertical / 2 : Phaser.Math.Clamp(position.y - height / zoom * .48, 0, vertical)), zoom, width, height };
  }

  private publishCamera() {
    const camera = this.cameraFrame(), signature = JSON.stringify(camera);
    if (signature !== this.lastCamera) { this.lastCamera = signature; this.bridge.camera(camera); }
    return camera;
  }

  update(time: number, delta: number) {
    this.accumulator = Math.min(this.accumulator + delta, 1000 / 60 * 5);
    const frame = this.bridge.read();
    if (frame.paused) this.accumulator = 0;
    while (this.accumulator >= 1000 / 60) {
      this.simulationTime += 1000 / 60;
      this.bridge.step(1 / 60, this.simulationTime);
      this.accumulator -= 1000 / 60;
    }
    const { state, position, moving, direction, selected, effects, disabled } = this.bridge.read();
    const talkingTo = state?.people.find(person => person.id === selected && person.position && Math.hypot(person.position.x - position.x, person.position.y - position.y) <= 38)?.id || '';
    const poses = this.npcMotion.update(state?.id || '', state?.people || [], time, Math.min(delta / 1000, .1), disabled, talkingTo);
    if (time >= this.nextPosePublish) { this.nextPosePublish = time + 50; this.bridge.poses(poses); }
    this.powerOff = !!state?.mystery?.power_off;
    const anomalies = state?.mystery?.anomalies || 0;
    if (anomalies > this.anomalyCount) this.damage = effects ? .9 : .12;
    this.anomalyCount = anomalies; this.damage = Math.max(0, this.damage - delta / 1500);
    const spriteList: Phaser.GameObjects.Image[] = [];
    for (const person of state?.people || []) {
      if (!person.position || person.id === 'player') continue;
      let image = this.characters.get(person.id);
      if (!image) { image = new Phaser.GameObjects.Image(this, person.position.x, person.position.y - 3, 'people', characterTiles[person.id]).setOrigin(.5, 1); this.characters.set(person.id, image); }
      const pose = poses[person.id];
      const working = pose?.phase === 'working';
      // Walk cycle and small work gestures animate independently of packets.
      const footstep = pose?.moving ? Math.sin(pose.progress * 13) * .6 : 0;
      const gesture = working && effects ? Math.sin(time / 450 + characterTiles[person.id]) * .65 : 0;
      image.setPosition(pose?.position.x ?? person.position.x, (pose?.position.y ?? person.position.y) - 3 - Math.abs(footstep) - gesture);
      image.setFlipX(pose?.flipX || false).setAngle(0);
      if (pose?.moving) image.setScale(1 + footstep * .015, 1 - footstep * .02);
      else image.setScale(1, working ? 1 + gesture * .018 : 1);
      spriteList.push(image);
    }
    this.player.setPosition(Math.round(position.x), Math.round(position.y) - (moving && Math.floor(time / 130) % 2 ? 1 : 0) - 3).setFlipX(direction === 'left');
    this.pixels.clear();
    for (const person of state?.people || []) {
      const pose = poses[person.id];
      if (!pose) continue;
      this.pixels.fillStyle(0x151627, .38).fillEllipse(pose.position.x, pose.position.y - 2, 12, 3);
      if (pose.phase === 'working') {
        const workingX = pose.position.x + 10, workingY = pose.position.y - 14;
        const hand = Math.floor(time / 550) % 2;
        this.pixels.fillStyle(0xd8b18c, .95).fillRect(workingX - 5, workingY + 2 - hand, 2, 2);
        if (person.id === 'reporter' || person.id === 'shopkeeper') {
          this.pixels.fillStyle(0xd5c393, .85).fillRect(workingX - 3, workingY, 5, 4);
          this.pixels.fillStyle(0x625041, .9).fillRect(workingX - 2, workingY + 1 + (Math.floor(time / 700) % 2), 3, 1);
        } else {
          this.pixels.fillStyle(person.id === 'caretaker' ? 0x9cd4b2 : 0xe5bd78, .5 + Math.sin(time / 600) * .2).fillRect(workingX - 2, workingY + 1, 2, 2);
          this.pixels.fillStyle(0xa5b6bd, .9).fillRect(workingX - 3, workingY - hand, 1, 5);
        }
      }
    }
    const focus = state?.mystery?.anchors.find(anchor => anchor.id === selected);
    if (focus) this.pixels.lineStyle(1, 0xe2c58a, .7).strokeRect(focus.x - 9, focus.y - 10, 18, 12);
    this.pixels.fillStyle(0x191329, .5).fillEllipse(Math.round(position.x), Math.round(position.y) - 3, 12, 4);
    if (!this.powerOff) this.pixels.fillStyle(0xf6b29f, .9).fillRect(328, 81, 2, 2).fillRect(438, 81, 2, 2);
    if (effects) for (let i = 0; i < 30; i++) {
      const x = 36 + (i * 79 % (WORLD_WIDTH - 72)), y = 40 + (i * 53 % (WORLD_HEIGHT - 80)) + Math.sin(time / 1900 + i) * 2;
      this.pixels.fillStyle(i % 2 ? 0xb5f5d4 : 0xf4d68d, .16 + (Math.sin(time / 1100 + i) + 1) * .12).fillRect(x, Math.round(y), 1, 1);
    }
    this.world.clear().draw(this.terrain);
    if (!this.powerOff) this.world.draw(this.gate);
    this.world.draw(this.pixels);
    this.world.draw([...spriteList, this.player].sort((a, b) => a.y - b.y));
    this.world.render();
    this.glow.clear();
    this.halos.forEach((halo, index) => {
      const radius = index === 6 ? 66 : index === 8 ? 55 : 32;
      halo.setDisplaySize(radius, radius).setAlpha(index === 6 ? this.powerOff ? 0 : .45 : .7).setTint(index === 6 ? 0xe1798a : index === 7 && this.powerOff ? 0x8ee4c4 : 0xf1ce8e);
      if (index === 8) halo.setPosition(position.x / 2, position.y / 2 - 5).setAlpha(.9);
      if (effects) halo.alpha *= 0.96 + Math.sin(time / 530 + index) * .035;
    });
    this.glow.draw(this.halos);
    this.glow.render();
    const camera = this.publishCamera();
    if (this.fallbackWorld) this.fallbackWorld.setPosition(-camera.x * camera.zoom, -camera.y * camera.zoom).setScale(camera.zoom);
    if (this.fallbackGlow) this.fallbackGlow.setPosition(-camera.x * camera.zoom, -camera.y * camera.zoom).setScale(camera.zoom * 2);
    if (++this.sceneFrame % 60 === 0) this.registry.set('renderDiagnostics', { renderer: this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas', worldFilter: 'NEAREST', glowFilter: 'LINEAR', fixedStep: 60, scene: 'Night', frames: this.sceneFrame });
  }
}
