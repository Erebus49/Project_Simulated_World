import type { NpcMotion, Person, Point } from '../types';

type Track = {
  sample: Point; plan: NpcMotion | null; receivedAt: number; sampledAt: number;
  visual: Point; offset: Point; walking: boolean; flipX: boolean; elapsed: number;
};
export type NpcPose = { position: Point; moving: boolean; flipX: boolean; phase: string; taskId: string; progress: number };

function onPath(start: Point, path: Point[], distance: number) {
  let point = { ...start };
  for (const target of path) {
    const length = Math.hypot(target.x - point.x, target.y - point.y);
    if (length > distance && length > .00001) {
      return { position: { x: point.x + (target.x - point.x) * distance / length,
        y: point.y + (target.y - point.y) * distance / length }, finished: false };
    }
    distance -= length; point = { ...target };
  }
  return { position: point, finished: true };
}

/** Predict the server-approved path at render frequency, never tween rapidly
 * between sparse coordinate samples. Smooth small network corrections while
 * preserving continuous velocity. No new jobs or world facts are invented. */
export class NpcMotionPlayer {
  private tracks = new Map<string, Track>();
  private session = '';

  reset(session: string) { this.session = session; this.tracks.clear(); }

  update(session: string, people: Person[], now: number, seconds: number, paused: boolean, talkingTo = ''): Record<string, NpcPose> {
    if (session !== this.session) this.reset(session);
    const result: Record<string, NpcPose> = {};
    for (const person of people) {
      if (!person.position || person.id === 'player') continue;
      const motion = person.motion || null;
      let track = this.tracks.get(person.id);
      if (!track) {
        track = { sample: { ...person.position }, plan: motion, receivedAt: now, sampledAt: motion?.sampled_at ?? -1,
          visual: { ...person.position }, offset: { x: 0, y: 0 }, walking: false, flipX: false, elapsed: 0 };
        this.tracks.set(person.id, track);
      } else if (motion && (motion.sampled_at > track.sampledAt || motion.revision !== track.plan?.revision)) {
        // A refresh of the same sample must not restart the motion clock.
        // Advance the OLD plan to this exact render instant first. Anchoring a
        // new packet at last frame's position would lose a frame of velocity
        // on every update and can even cause a backwards correction.
        let continued = track.visual;
        if (!paused && person.id !== talkingTo && motion.phase === 'walking' && track.plan?.phase === 'walking') {
          const ahead = onPath(track.sample, track.plan.path, Math.max(0, now - track.receivedAt) / 1000 * track.plan.speed);
          continued = { x: ahead.position.x + track.offset.x, y: ahead.position.y + track.offset.y };
        }
        track.offset = { x: continued.x - person.position.x, y: continued.y - person.position.y };
        if (Math.hypot(track.offset.x, track.offset.y) > 70) track.offset = { x: 0, y: 0 };
        track.sample = { ...person.position }; track.plan = motion;
        track.receivedAt = now; track.sampledAt = motion.sampled_at;
      }
      const talking = person.id === talkingTo;
      const active = !paused && !talking && track.plan?.phase === 'walking';
      if (paused || talking) track.receivedAt += seconds * 1000;
      const before = track.visual;
      let phase = track.plan?.phase || 'working';
      if (!paused) {
        const elapsed = Math.max(0, (now - track.receivedAt) / 1000);
        const path = track.plan?.phase === 'walking' ? track.plan.path : [];
        const predicted = onPath(track.sample, path, elapsed * (track.plan?.speed || 24));
        const correction = Math.exp(-seconds / .28);
        track.offset.x *= correction; track.offset.y *= correction;
        // Only an explicit conversation stops this resident. Proximity alone
        // must not freeze their work, or everyone near the spawn stays idle.
        if (!talking) track.visual = { x: predicted.position.x + track.offset.x, y: predicted.position.y + track.offset.y };
        if (predicted.finished && phase === 'walking') phase = 'working';
        track.walking = !!active && !predicted.finished;
        if (Math.abs(track.visual.x - before.x) > .015) track.flipX = track.visual.x < before.x;
      } else track.walking = false;
      if (track.walking) track.elapsed += seconds;
      result[person.id] = { position: { ...track.visual }, moving: track.walking, flipX: track.flipX,
        phase: talking ? 'paused' : phase, taskId: track.plan?.task_id || '', progress: track.elapsed };
    }
    return result;
  }
}
