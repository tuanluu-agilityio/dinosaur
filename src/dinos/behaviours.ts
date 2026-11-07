// Pure movement and clip logic for the dinosaur runtime. No three.js here so it is unit-testable.
// Ground plane is x/z; heading 0 faces +z, positive heading turns toward +x.
import type { SpeciesId } from '../content/schema';

export interface Vec2 { x: number; z: number }
export type Rng = () => number;
export type ClipId = 'idle' | 'walk' | 'eat' | 'roar' | 'run';

/** Root speed (m/s) of each species' in-place walk clip; moving at this speed prevents foot sliding. */
export const WALK_SPEED: Record<SpeciesId, number> = {
  tyrannosaurus: 1.2, triceratops: 0.78, pachycephalosaurus: 0.7, ankylosaurus: 0.7, edmontosaurus: 0.9,
};
export const FADE_SECONDS = 0.4;
export const IDLE_SPEED = 0.1;
export const HERD_MIN = 3;
export const HERD_MAX = 8;

export interface Agent { x: number; z: number; heading: number; speed: number; target: number; timer: number; moving: boolean }
export const newAgent = (x: number, z: number, heading = 0): Agent => ({ x, z, heading, speed: 0, target: heading, timer: 0, moving: false });

export function ellipsePolygon(cx: number, cz: number, rx: number, rz: number, n = 24): Vec2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * rz };
  });
}

export function pointInPolygon(x: number, z: number, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function centroid(poly: readonly Vec2[]): Vec2 {
  let x = 0, z = 0;
  for (const p of poly) { x += p.x; z += p.z; }
  return { x: x / poly.length, z: z / poly.length };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function turnToward(h: number, target: number, maxStep: number): number {
  const d = wrap(target - h);
  return wrap(h + Math.max(-maxStep, Math.min(maxStep, d)));
}

/** < 0.1 m/s is standing (idle, or eat for grazers); otherwise walk. */
export const clipForSpeed = (speed: number, grazer: boolean): ClipId => (speed < IDLE_SPEED ? (grazer ? 'eat' : 'idle') : 'walk');

/** Picks a clip the model really has: eat/roar fall back to idle, run to walk. */
export function resolveClip(available: readonly string[], want: ClipId): ClipId | null {
  const chain: Record<ClipId, ClipId[]> = {
    idle: ['idle'], walk: ['walk', 'idle'], eat: ['eat', 'idle'], roar: ['roar', 'idle'], run: ['run', 'walk', 'idle'],
  };
  return chain[want].find((c) => available.includes(c)) ?? null;
}

/** Asks for a cross-fade only when the clip changes. The first clip starts without a fade. */
export class ClipFader {
  current: ClipId | null = null;
  request(clip: ClipId): number | null {
    if (clip === this.current) return null;
    const first = this.current === null;
    this.current = clip;
    return first ? 0 : FADE_SECONDS;
  }
}

export interface WanderOptions { pauseChance?: number; moveTime?: [number, number]; pauseTime?: [number, number]; turnRate?: number }
export interface Behaviour { step(a: Agent, dt: number): void }

const between = (rng: Rng, [lo, hi]: [number, number]) => lo + (hi - lo) * rng();

/** Random walk that stays inside `area` (steers away from the border, never steps outside). */
export function createWander(area: readonly Vec2[], walkSpeed: number, rng: Rng, o: WanderOptions = {}): Behaviour {
  const pauseChance = o.pauseChance ?? 0.35;
  const moveTime = o.moveTime ?? [4, 10];
  const pauseTime = o.pauseTime ?? [3, 8];
  const turnRate = o.turnRate ?? 0.9;
  const c = centroid(area);
  const LOOK = 4;
  return {
    step(a, dt) {
      // Large dt (tab was hidden) is split so movement and the border check stay accurate.
      let left = dt;
      while (left > 0) {
        const h = Math.min(left, 0.25);
        left -= h;
        a.timer -= h;
        if (a.timer <= 0) {
          if (rng() < pauseChance) { a.moving = false; a.timer = between(rng, pauseTime); }
          else { a.moving = true; a.timer = between(rng, moveTime); a.target = a.heading + (rng() - 0.5) * 2.4; }
        }
        if (a.moving && !pointInPolygon(a.x + Math.sin(a.heading) * LOOK, a.z + Math.cos(a.heading) * LOOK, area)) {
          a.target = Math.atan2(c.x - a.x, c.z - a.z) + (rng() - 0.5) * 0.6;
        }
        a.heading = turnToward(a.heading, a.target, turnRate * h);
        a.speed = a.moving ? walkSpeed : 0;
        if (a.moving) {
          const nx = a.x + Math.sin(a.heading) * walkSpeed * h;
          const nz = a.z + Math.cos(a.heading) * walkSpeed * h;
          if (pointInPolygon(nx, nz, area)) { a.x = nx; a.z = nz; }
          else { a.speed = 0; a.target = Math.atan2(c.x - a.x, c.z - a.z); }
        }
      }
    },
  };
}

/** Mostly standing and eating, with short walks to the next patch. */
export const createGraze = (area: readonly Vec2[], walkSpeed: number, rng: Rng): Behaviour =>
  createWander(area, walkSpeed, rng, { pauseChance: 0.8, moveTime: [2, 4], pauseTime: [6, 14] });

export interface Herd { step(dt: number): void }

/**
 * Members[0] leads (wanders); the rest follow loosely. Every member keeps 3-8 m from its nearest neighbour:
 * moves that would break the 3 m minimum are rejected, and the leader waits when a follower is falling behind.
 */
export function createHerd(members: Agent[], area: readonly Vec2[], walkSpeed: number, rng: Rng): Herd {
  const leader = members[0];
  const lead = createWander(area, walkSpeed, rng, { pauseChance: 0.4 });
  const nearest = (self: Agent, ox = self.x, oz = self.z) => {
    let best: Agent | null = null, bd = Infinity;
    for (const m of members) {
      if (m === self) continue;
      const d = Math.hypot(m.x - ox, m.z - oz);
      if (d < bd) { bd = d; best = m; }
    }
    return { m: best, d: bd };
  };
  return {
    step(dt) {
      const px = leader.x, pz = leader.z, ph = leader.heading;
      lead.step(leader, dt);
      // Reject leader moves that crowd a follower, or that leave the herd (waits for the stragglers).
      if (nearest(leader).d < HERD_MIN + 0.6 || nearest(leader).d > 6) {
        const crowded = nearest(leader).d < HERD_MIN + 0.6;
        if (crowded || nearest(leader).d > 6) { leader.x = px; leader.z = pz; leader.heading = ph; leader.speed = 0; leader.moving = false; leader.timer = 1; }
      }
      for (let i = 1; i < members.length; i++) {
        const f = members[i];
        const { m, d } = nearest(f);
        let dirX = 0, dirZ = 0, go = false, speed = walkSpeed;
        if (m && d < 4) { dirX = f.x - m.x; dirZ = f.z - m.z; go = true; }
        else if (m && d > 5.5) { dirX = leader.x - f.x; dirZ = leader.z - f.z; go = true; speed = walkSpeed * 1.1; }
        f.speed = 0;
        if (!go) continue;
        f.heading = turnToward(f.heading, Math.atan2(dirX, dirZ), 1.5 * dt);
        const nx = f.x + Math.sin(f.heading) * speed * dt, nz = f.z + Math.cos(f.heading) * speed * dt;
        if (!pointInPolygon(nx, nz, area) || nearest(f, nx, nz).d < HERD_MIN) continue;
        f.x = nx; f.z = nz; f.speed = speed;
      }
    },
  };
}
