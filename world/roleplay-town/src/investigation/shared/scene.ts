import type { ActorId, LocationId } from './types.js';

export interface Point { x: number; y: number }
export const SCENE_SIZE = { width: 1000, height: 640 } as const;
export const INTERACTION_RANGE = 74;

/** Local scene coordinates are shared by the 2D map and the server's action checks. */
export const CLUE_POINTS: Record<string, Point> = {
  'home-geiger': { x: 690, y: 424 }, broadcast: { x: 480, y: 332 }, 'night-detour': { x: 155, y: 438 },
  'crash-medical': { x: 710, y: 358 }, 'cargo-hole': { x: 540, y: 405 }, 'yard-magnets': { x: 730, y: 390 },
  'magnetic-pattern': { x: 540, y: 260 }, 'motel-victim': { x: 720, y: 340 }, 'archive-magnetism': { x: 350, y: 340 },
  'nasa-map': { x: 600, y: 295 }, 'radiation-trail': { x: 640, y: 300 }, 'well-brood': { x: 790, y: 380 },
  'patrol-report': { x: 560, y: 430 },
};

export const OPERATION_POINTS: Record<string, Point> = {
  'request-support': { x: 680, y: 300 }, 'prepare-magnets': { x: 730, y: 390 },
  'deploy-magnet': { x: 650, y: 350 }, 'neutralize-brood': { x: 800, y: 390 },
  handover: { x: 490, y: 210 }, evacuate: { x: 860, y: 320 },
};

export const EXIT_POINTS: Partial<Record<LocationId, Partial<Record<LocationId, Point>>>> = {
  'hargrave-home': { scrapyard: { x: 58, y: 302 }, 'gove-motel': { x: 500, y: 576 }, 'crash-site': { x: 940, y: 310 } },
  scrapyard: { 'hargrave-home': { x: 940, y: 492 }, 'gove-motel': { x: 460, y: 576 } },
  'crash-site': { 'hargrave-home': { x: 70, y: 510 }, 'command-post': { x: 480, y: 576 }, 'lomax-farm': { x: 940, y: 500 } },
  'gove-motel': { 'hargrave-home': { x: 500, y: 64 }, scrapyard: { x: 65, y: 325 }, 'command-post': { x: 940, y: 340 }, checkpoint: { x: 500, y: 576 } },
  'command-post': { 'gove-motel': { x: 60, y: 340 }, 'crash-site': { x: 450, y: 64 }, checkpoint: { x: 300, y: 576 }, 'lomax-farm': { x: 940, y: 330 } },
  'lomax-farm': { 'crash-site': { x: 60, y: 320 }, 'command-post': { x: 940, y: 330 } },
  checkpoint: { 'gove-motel': { x: 500, y: 64 }, 'command-post': { x: 500, y: 576 } },
};

const actorAnchors: Record<string, Point> = {
  avery: { x: 445, y: 478 }, morgan: { x: 500, y: 478 }, reed: { x: 555, y: 478 },
  hargrave: { x: 525, y: 345 }, pete: { x: 590, y: 472 }, buddy: { x: 310, y: 470 },
  hudson: { x: 560, y: 458 }, drako: { x: 620, y: 458 },
};
export function actorStartPoint(actorId: ActorId, locationId: LocationId): Point {
  if (['avery', 'morgan', 'reed'].includes(actorId)) return actorAnchors[actorId]!;
  if (actorId === 'hargrave' || actorId === 'pete') return actorAnchors[actorId]!;
  if (actorId === 'buddy' && locationId === 'scrapyard') return actorAnchors.buddy!;
  if (actorId === 'hudson' && locationId === 'command-post') return actorAnchors.hudson!;
  if (actorId === 'drako' && locationId === 'command-post') return actorAnchors.drako!;
  return { x: 500, y: 450 };
}

export function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); }
