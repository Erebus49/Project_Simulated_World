import { WORLD_HEIGHT, WORLD_WIDTH, type Point } from './terrain.js';

const CELL = 8, COLS = WORLD_WIDTH / CELL, ROWS = WORLD_HEIGHT / CELL;
/** Bounded A* plus line-of-sight simplification; no diagonal cutting through walls. */
export function findPath(start: Point, end: Point, passable: (x: number, y: number) => boolean): Point[] {
  const point = (id: number) => ({ x: id % COLS * CELL + CELL / 2, y: Math.floor(id / COLS) * CELL + CELL / 2 });
  const cell = (p: Point) => Math.max(0, Math.min(ROWS - 1, Math.floor(p.y / CELL))) * COLS + Math.max(0, Math.min(COLS - 1, Math.floor(p.x / CELL)));
  function nearest(p: Point) {
    const base = cell(p), choices: number[] = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const id = base + dy * COLS + dx, q = point(id);
      if (id >= 0 && id < COLS * ROWS && passable(q.x, q.y)) choices.push(id);
    }
    return choices.sort((a, b) => Math.hypot(point(a).x - p.x, point(a).y - p.y) - Math.hypot(point(b).x - p.x, point(b).y - p.y))[0];
  }
  const source = nearest(start), goal = nearest(end);
  if (source === undefined || goal === undefined) return [];
  const target = point(goal), open = [source], closed = new Set<number>(), previous = new Map<number, number>(), costs = new Map([[source, 0]]);
  const estimate = (id: number) => { const q = point(id); return (costs.get(id) ?? Infinity) + Math.hypot(q.x - target.x, q.y - target.y); };
  for (let visits = 0; open.length && visits < COLS * ROWS; visits++) {
    open.sort((a, b) => estimate(a) - estimate(b));
    const id = open.shift()!;
    if (id === goal) {
      const raw: Point[] = []; let at: number | undefined = id;
      while (at !== undefined) { raw.unshift(point(at)); at = previous.get(at); }
      const result: Point[] = []; let anchor = start, index = 0;
      const clear = (a: Point, b: Point) => {
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
        for (let i = 1; i <= steps; i++) if (!passable(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps)) return false;
        return true;
      };
      while (index < raw.length) {
        let furthest = index;
        while (furthest + 1 < raw.length && clear(anchor, raw[furthest + 1]!)) furthest++;
        anchor = raw[furthest]!; result.push(anchor); index = furthest + 1;
      }
      if (passable(end.x, end.y) && clear(anchor, end)) result.push({ ...end });
      return result;
    }
    closed.add(id); const p = point(id);
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
      const x = p.x + dx! * CELL, y = p.y + dy! * CELL;
      if (!passable(x,y) || dx && dy && (!passable(x,p.y) || !passable(p.x,y))) continue;
      const next = cell({ x,y }), cost = (costs.get(id) ?? 0) + Math.hypot(dx!,dy!) * CELL;
      if (closed.has(next) || cost >= (costs.get(next) ?? Infinity)) continue;
      previous.set(next,id); costs.set(next,cost); if (!open.includes(next)) open.push(next);
    }
  }
  return [];
}
