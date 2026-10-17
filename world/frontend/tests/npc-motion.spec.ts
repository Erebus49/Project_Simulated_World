import { expect, test } from '@playwright/test';
import { NpcMotionPlayer } from '../src/game/NpcMotion';
import type { Person } from '../src/types';

const resident = (x: number, sampledAt: number, revision = 1): Person => ({
  id: 'caretaker', name: '周师傅', role: '守夜人', color: '#aaa', location: 'stage', visible: true,
  position: { x, y: 180 }, moving: true,
  motion: { revision, sampled_at: sampledAt, phase: 'walking', path: [{ x: 500, y: 180 }],
    speed: 24, work_left: 12, task_id: 'caretaker-0' },
});
const farAway = '';

test('a single approved path plays at constant speed between 800ms server updates', () => {
  const playback = new NpcMotionPlayer();
  let person = resident(350, 100), previous = 350;
  const advances: number[] = [];
  playback.update('game', [person], 0, 0, false, farAway);
  for (let frame = 1; frame <= 144; frame++) {
    const elapsed = frame / 60;
    if (frame % 48 === 0) person = resident(350 + elapsed * 24, 100 + elapsed);
    const pose = playback.update('game', [person], elapsed * 1000, 1 / 60, false, farAway).caretaker;
    advances.push(pose.position.x - previous); previous = pose.position.x;
  }
  expect(Math.min(...advances)).toBeGreaterThan(.37);
  expect(Math.max(...advances)).toBeLessThan(.43);
  expect(previous).toBeCloseTo(407.6, 1);
});

test('delayed and duplicate samples do not stop or reverse a walking resident', () => {
  const playback = new NpcMotionPlayer();
  let person = resident(350, 100), previous = 350;
  playback.update('game', [person], 0, 0, false, farAway);
  const steps: number[] = [];
  for (let frame = 1; frame <= 120; frame++) {
    if (frame === 60) person = resident(350 + .85 * 24, 100.85); // 150ms old on arrival
    if (frame === 110) person = resident(350 + 1.68 * 24, 101.68);
    const pose = playback.update('game', [person], frame * 1000 / 60, 1 / 60, false, farAway).caretaker;
    steps.push(pose.position.x - previous); previous = pose.position.x;
  }
  expect(Math.min(...steps)).toBeGreaterThan(.15);
  expect(Math.max(...steps)).toBeLessThan(.8);
});

test('pause and resume do not fast-forward the path, sessions reset, work is stationary', () => {
  const playback = new NpcMotionPlayer();
  const person = resident(350, 100);
  playback.update('first', [person], 0, 0, false, farAway);
  const pose = playback.update('first', [person], 200, .2, false, farAway).caretaker;
  for (let frame = 1; frame <= 120; frame++) {
    expect(playback.update('first', [person], 200 + frame * 1000 / 60, 1 / 60, true, farAway).caretaker.position.x).toBe(pose.position.x);
  }
  const resumed = playback.update('first', [person], 2200 + 1000 / 60, 1 / 60, false, farAway).caretaker;
  expect(resumed.position.x - pose.position.x).toBeCloseTo(.4, 3);
  expect(playback.update('second', [resident(370, 200)], 2300, 0, false, farAway).caretaker.position.x).toBe(370);
  const worker = resident(370, 201, 2); worker.motion!.phase = 'working'; worker.motion!.path = [];
  for (let frame = 1; frame <= 30; frame++) {
    const working = playback.update('second', [worker], 2300 + frame * 1000 / 60, 1 / 60, false, farAway).caretaker;
    expect(working.moving).toBe(false);
    expect(working.position.x).toBe(370);
  }
});

test('path bends execute in order and stop at the final working location', () => {
  const playback = new NpcMotionPlayer();
  const person = resident(350, 100);
  person.motion!.path = [{ x: 374, y: 180 }, { x: 374, y: 204 }];
  playback.update('game', [person], 0, 0, false, farAway);
  const bend = playback.update('game', [person], 1500, 1.5, false, farAway).caretaker;
  expect(bend.position).toEqual({ x: 374, y: 192 });
  const end = playback.update('game', [person], 2500, 1, false, farAway).caretaker;
  expect(end.position).toEqual({ x: 374, y: 204 });
  expect(end.phase).toBe('working'); expect(end.moving).toBe(false);
});

test('only the conversation partner pauses while another resident continues their path', () => {
  const playback = new NpcMotionPlayer();
  const people = [resident(350, 100), { ...resident(350, 100), id: 'reporter' }];
  playback.update('game', people, 0, 0, false);
  const walking = playback.update('game', people, 200, .2, false);
  expect(walking.caretaker.position.x).toBeCloseTo(354.8);
  const talking = playback.update('game', people, 400, .2, false, 'caretaker');
  expect(talking.caretaker.position.x).toBe(walking.caretaker.position.x);
  expect(talking.caretaker.phase).toBe('paused');
  expect(talking.reporter.position.x).toBeGreaterThan(walking.reporter.position.x);
  const resumed = playback.update('game', people, 600, .2, false);
  expect(resumed.caretaker.position.x).toBeGreaterThan(talking.caretaker.position.x);
});
