import { useCallback, useEffect, useRef, useState } from 'react';
import type { Game, Point } from './types';

export const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const startPoint = { x: 239, y: 211 };
const keys: Record<string, [number, number]> = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
const isEditing = () => document.activeElement?.matches('input,textarea,select,[contenteditable=true]');

export function useExploration(game: Game | null, enabled: boolean, persist: (point: Point) => Promise<Game>, onInteract: (id: string) => void) {
  const [position, setPosition] = useState<Point>(startPoint), [moving, setMoving] = useState(false), [direction, setDirection] = useState('down');
  const current = useRef<Point>(startPoint), acknowledged = useRef<Point>(startPoint);
  const preferredTarget = useRef('');
  const [, publishTarget] = useState(0);
  const pressed = useRef(new Set<string>()), inFlight = useRef<Promise<void> | null>(null);
  const settings = useRef({ game, enabled, persist, onInteract });
  settings.current = { game, enabled, persist, onInteract };
  const nearbyTargets = () => {
    const world = settings.current.game;
    const candidates = [...(world?.mystery?.anchors || []), ...(world?.people.filter(p => p.id !== 'player' && p.position).map(p => ({ id: p.id, name: p.name, ...p.position! })) || [])];
    const reachable = candidates.map(p => ({ ...p, distance: gap(current.current, p) })).filter(p => p.distance <= (world?.mystery?.anchors.some(a => a.id === p.id) ? 27 : 31));
    // A resident passing in front of a desk must not steal E from the object
    // the player is standing next to. People still have their clickable names.
    const closeObject = reachable.filter(p => world?.mystery?.anchors.some(a => a.id === p.id) && p.distance <= 18).sort((a, b) => a.distance - b.distance)[0];
    const ordered = reachable.sort((a, b) => a.distance - b.distance);
    return closeObject ? [closeObject, ...ordered.filter(p => p.id !== closeObject.id)] : ordered;
  };
  const nearest = () => {
    const targets = nearbyTargets();
    if (!targets.some(target => target.id === preferredTarget.current)) preferredTarget.current = '';
    return targets.find(target => target.id === preferredTarget.current) || targets[0];
  };
  const cycleTarget = () => {
    if (!settings.current.enabled || isEditing()) return;
    const targets = nearbyTargets(), currentTarget = nearest();
    if (targets.length < 2) return;
    preferredTarget.current = targets[(targets.findIndex(target => target.id === currentTarget?.id) + 1) % targets.length].id;
    publishTarget(value => value + 1);
  };
  const sync = async () => {
    if (inFlight.current) return inFlight.current;
    if (gap(current.current, acknowledged.current) < .2) return;
    const sent = { ...current.current }, gameId = settings.current.game?.id;
    const task = (async () => {
      try {
        const updated = await settings.current.persist(sent);
        if (settings.current.game?.id !== gameId) return;
        acknowledged.current = updated.player_position || sent;
      } catch {
        if (settings.current.game?.id !== gameId) return;
        current.current = { ...acknowledged.current }; setPosition(current.current); pressed.current.clear();
      }
    })();
    inFlight.current = task;
    await task;
    inFlight.current = null;
  };
  const flush = async () => {
    pressed.current.clear();
    if (inFlight.current) await inFlight.current;
    await sync();
  };
  const interact = async (id?: string) => {
    if (!settings.current.enabled || isEditing()) return;
    const target = id ? [...(settings.current.game?.mystery?.anchors || []), ...(settings.current.game?.people.filter(p => p.position).map(p => ({ id: p.id, name: p.name, ...p.position! })) || [])].find(p => p.id === id) : nearest();
    if (!target || gap(current.current, target) > 31) return;
    await flush();
    settings.current.onInteract(target.id);
  };
  const actions = useRef({ sync, interact, cycleTarget });
  actions.current = { sync, interact, cycleTarget };

  useEffect(() => {
    const initial = settings.current.game?.player_position || startPoint;
    current.current = { ...initial }; acknowledged.current = { ...initial };
    preferredTarget.current = '';
    pressed.current.clear(); setPosition(initial); setMoving(false);
  }, [game?.id]);
  useEffect(() => { if (!enabled) { pressed.current.clear(); setMoving(false); } }, [enabled]);
  const simulation = useRef({ lastSync: 0, lastPublish: 0, stopped: true });
  const advance = (delta: number, now: number) => {
      const { enabled: active, game: world } = settings.current;
      let dx = 0, dy = 0;
      if (active && !isEditing()) pressed.current.forEach(code => { const vector = keys[code]; if (vector) { dx += vector[0]; dy += vector[1]; } });
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 0 && world?.mystery) {
        const amount = 68 * delta / magnitude;
        const canWalk = (p: Point) => {
          const scene = world.mystery!, bounds = scene.world_size || { width: 768, height: 480 };
          const allowed = scene.obstacles ? p.x >= 5 && p.x <= bounds.width - 5 && p.y >= 5 && p.y <= bounds.height - 5 &&
            !scene.obstacles.some(([l, t, r, b]) => p.x >= l - 2 && p.x <= r + 2 && p.y >= t - 2 && p.y <= b + 2) :
            scene.walkable.some(([l, t, r, b]) => p.x >= l && p.x <= r && p.y >= t && p.y <= b);
          return allowed && gap(p, acknowledged.current) <= 32;
        };
        let next = { x: current.current.x + dx * amount, y: current.current.y + dy * amount };
        if (!canWalk(next)) {
          next = { x: current.current.x + dx * amount, y: current.current.y };
          if (!canWalk(next)) next = { x: current.current.x, y: current.current.y + dy * amount };
        }
        if (canWalk(next)) {
          current.current = next;
          // The Phaser scene reads exact motion directly at 60Hz. DOM labels and
          // journals only need 20Hz updates, avoiding a full React tree per frame.
          if (now - simulation.current.lastPublish >= 50) { setPosition({ ...next }); simulation.current.lastPublish = now; }
        }
        setDirection(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
        if (simulation.current.stopped) { setMoving(true); simulation.current.stopped = false; }
      } else if (!simulation.current.stopped) { setMoving(false); setPosition({ ...current.current }); simulation.current.stopped = true; void actions.current.sync(); }
      if (now - simulation.current.lastSync > 190 && active) { simulation.current.lastSync = now; void actions.current.sync(); }
  };
  const advanceRef = useRef(advance); advanceRef.current = advance;
  const advanceFrame = useCallback((delta: number, now: number) => advanceRef.current(delta, now), []);
  const readMotion = useCallback(() => ({ position: current.current, acknowledged: acknowledged.current, enabled: settings.current.enabled }), []);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && isEditing() && !document.querySelector('[role=dialog]')) {
        (document.activeElement as HTMLElement)?.blur(); pressed.current.clear(); return;
      }
      if (!settings.current.enabled || isEditing() || event.ctrlKey || event.altKey || event.metaKey || document.querySelector('[role=dialog]')) return;
      if (keys[event.code]) { event.preventDefault(); pressed.current.add(event.code); }
      if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); void actions.current.interact(); }
      if (event.code === 'KeyQ' && !event.repeat) { event.preventDefault(); actions.current.cycleTarget(); }
    };
    const up = (event: KeyboardEvent) => pressed.current.delete(event.code);
    const reset = () => { pressed.current.clear(); void actions.current.sync(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', reset); pressed.current.clear(); };
  }, []);
  return { position, moving, direction, nearest: nearest(), targetCount: nearbyTargets().length, cycleTarget, flush, interact, advanceFrame, readMotion,
    press: (code: string) => { if (settings.current.enabled) pressed.current.add(code); }, release: (code: string) => pressed.current.delete(code),
    clear: () => pressed.current.clear() };
}
