// Places dinosaurs on the terrain, drives their behaviours and answers click/hover picking.
import { Raycaster, Vector2, Vector3, type Camera, type Object3D, type Scene } from 'three/webgpu';
import { CLEARING, terrainHeight } from '../world/terrain';
import type { SpeciesId } from '../content/schema';
import type { Dino } from './dino';
import {
  WALK_SPEED, clipForSpeed, createGraze, createHerd, createWander, ellipsePolygon, newAgent, pointInPolygon,
  type Agent, type Behaviour, type Herd, type Rng, type Vec2,
} from './behaviours';

export type BehaviourKind = 'wander' | 'herd' | 'graze';

interface Entry {
  dino: Dino;
  kind: BehaviourKind;
  agent: Agent;
  behaviour: Behaviour | null;
  since: number; // seconds since the clip last changed (dwell, so clips do not flicker at the speed threshold)
  paused: boolean;
}

/** Dinosaurs live in the clearing, kept 4 m inside its edge so they never reach the trees. */
export const defaultArea = (): Vec2[] => ellipsePolygon(CLEARING.x, CLEARING.z, CLEARING.rx - 4, CLEARING.rz - 4, 28);

const MIN_DWELL = 1.2;
const KEEP_APART = 10;

function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DinoWorld {
  readonly dinos: Dino[] = [];
  /** Hook for the atmosphere task (contact shadows): called whenever a dino is placed or moved. */
  onDinoMoved: ((d: Dino, x: number, y: number, z: number) => void) | null = null;
  /** Called after `replace` swapped a dino for another model of the same animal (the page moves per-dino bookkeeping over). */
  onDinoReplaced: ((from: Dino, to: Dino) => void) | null = null;
  /** Hover label element and the species-name lookup (the page fills it from the bilingual species content). */
  label: HTMLElement | null = null;
  commonName: (id: SpeciesId) => string = (id) => id;

  private readonly scene: Scene;
  private readonly area: Vec2[];
  private readonly rng: Rng;
  private readonly entries: Entry[] = [];
  private readonly herds = new Map<SpeciesId, Herd>();
  private readonly ray = new Raycaster();
  private readonly proxies: Object3D[] = [];
  private hovered: Dino | null = null;
  private readonly _v = new Vector3();

  constructor(scene: Scene, area: Vec2[] = defaultArea(), seed = 1337) {
    this.scene = scene;
    this.area = area;
    this.rng = seeded(seed);
  }

  add(d: Dino, behaviour: BehaviourKind): void {
    const walk = WALK_SPEED[d.id];
    const mates = this.entries.filter((e) => e.kind === 'herd' && e.dino.id === d.id);
    let x: number, z: number;
    if (behaviour === 'herd' && mates.length > 0) {
      // Join the herd 4.2-5.4 m from its leader.
      const lead = mates[0].agent;
      const a0 = this.rng() * Math.PI * 2;
      let tries = 0;
      do {
        const r = 4.2 + this.rng() * 1.2;
        x = lead.x + Math.cos(a0 + tries) * r;
        z = lead.z + Math.sin(a0 + tries) * r;
        tries++;
      } while (tries < 40 && (!pointInPolygon(x, z, this.area) || this.crowds(x, z, 3.4)));
    } else {
      [x, z] = this.freeSpot(14);
    }
    const agent = newAgent(x, z, this.rng() * Math.PI * 2);
    const entry: Entry = { dino: d, kind: behaviour, agent, behaviour: null, since: 0, paused: false };
    if (behaviour === 'wander') entry.behaviour = createWander(this.area, walk, this.rng);
    else if (behaviour === 'graze') entry.behaviour = createGraze(this.area, walk, this.rng);
    this.entries.push(entry);
    if (behaviour === 'herd') {
      const members = this.entries.filter((e) => e.kind === 'herd' && e.dino.id === d.id).map((e) => e.agent);
      this.herds.set(d.id, createHerd(members, this.area, walk, this.rng));
    }
    this.dinos.push(d);
    this.proxies.push(d.proxy);
    this.scene.add(d.root);
    this.apply(entry);
    d.play(clipForSpeed(0, behaviour === 'graze'));
    d.desync(this.rng() * 2);
  }

  /**
   * Swaps `from` for `to` (another model of the same species, e.g. the high-detail variant) in place: same spot, heading, behaviour,
   * pause state, clip and clip time, so the animal does not jump. `from` is disposed. Returns false if `from` is not in the world.
   */
  replace(from: Dino, to: Dino): boolean {
    const entry = this.entries.find((e) => e.dino === from);
    if (!entry) return false;
    entry.dino = to;
    this.dinos[this.dinos.indexOf(from)] = to;
    this.proxies[this.proxies.indexOf(from.proxy)] = to.proxy;
    if (this.hovered === from) this.hovered = to;
    to.root.position.copy(from.root.position);
    to.root.rotation.y = from.root.rotation.y;
    to.matchPose(from);
    this.scene.add(to.root);
    to.root.updateMatrixWorld(true);
    this.onDinoReplaced?.(from, to);
    from.dispose();
    return true;
  }

  /** Nearest dinosaur hit by the ray through `ndc`, tested against the capsule proxies only. */
  pick(ndc: Vector2, camera: Camera): Dino | null {
    for (const d of this.dinos) d.root.updateMatrixWorld(true);
    this.ray.setFromCamera(ndc, camera);
    const hit = this.ray.intersectObjects(this.proxies, false)[0];
    return (hit?.object.userData.dino as Dino | undefined) ?? null;
  }

  /** Updates the hover label for a pointer at `ndc` / (clientX, clientY). Returns the hovered dino. */
  hover(ndc: Vector2, camera: Camera, clientX: number, clientY: number): Dino | null {
    const d = this.pick(ndc, camera);
    this.hovered = d;
    const el = this.label;
    if (el) {
      if (d) {
        el.textContent = this.commonName(d.id);
        el.style.transform = `translate(${Math.round(clientX + 14)}px, ${Math.round(clientY + 14)}px)`;
        el.style.display = 'block';
      } else el.style.display = 'none';
    }
    return d;
  }

  get hoveredDino(): Dino | null { return this.hovered; }

  /** World position of a dino's root (shared vector, copy if you keep it). */
  positionOf(d: Dino): Vector3 { return this._v.copy(d.root.position); }

  /** Freezes or releases a dino's walking, e.g. while the camera orbits it. */
  setPaused(d: Dino, paused: boolean): void {
    const e = this.entries.find((x) => x.dino === d);
    if (e) e.paused = paused;
  }

  update(dt: number): void {
    for (const e of this.entries) {
      if (e.paused || !e.behaviour) continue;
      const a = e.agent, px = a.x, pz = a.z;
      e.behaviour.step(a, dt);
      // Solo animals keep clear of other species (a T. rex does not stroll through a herd): undo the step and turn away.
      const other = this.nearestOther(e, a.x, a.z);
      if (other && Math.hypot(other.agent.x - a.x, other.agent.z - a.z) < KEEP_APART) {
        a.x = px; a.z = pz; a.speed = 0;
        a.target = Math.atan2(a.x - other.agent.x, a.z - other.agent.z);
        a.moving = true;
        a.timer = Math.max(a.timer, 2);
      }
    }
    for (const [id, h] of this.herds) {
      const members = this.entries.filter((e) => e.kind === 'herd' && e.dino.id === id);
      const saved = members.map((m) => ({ ...m.agent }));
      h.step(dt);
      // Same rule as solo animals: a herd that would walk into another species stops and turns its leader away.
      const hit = members.map((m) => this.nearestOther(m, m.agent.x, m.agent.z)).find((o, i) => o && Math.hypot(o.agent.x - members[i].agent.x, o.agent.z - members[i].agent.z) < KEEP_APART);
      if (hit) {
        members.forEach((m, i) => Object.assign(m.agent, saved[i], { speed: 0 }));
        const lead = members[0].agent;
        lead.target = Math.atan2(lead.x - hit.agent.x, lead.z - hit.agent.z);
        lead.moving = true;
        lead.timer = Math.max(lead.timer, 2);
      }
    }
    for (const e of this.entries) {
      if (e.paused) e.agent.speed = 0;
      e.since += dt;
      const want = clipForSpeed(e.agent.speed, e.kind === 'graze');
      if (want !== e.dino.currentClip && e.since >= MIN_DWELL) { e.dino.play(want); e.since = 0; }
      this.apply(e);
      e.dino.update(dt);
    }
  }

  private apply(e: Entry): void {
    const { x, z, heading } = e.agent;
    const y = terrainHeight(x, z);
    e.dino.root.position.set(x, y, z);
    e.dino.root.rotation.y = heading;
    this.onDinoMoved?.(e.dino, x, y, z);
  }

  private nearestOther(e: Entry, x: number, z: number): Entry | null {
    let best: Entry | null = null, bd = Infinity;
    for (const o of this.entries) {
      if (o.dino.id === e.dino.id) continue;
      const d = Math.hypot(o.agent.x - x, o.agent.z - z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  private crowds(x: number, z: number, d: number): boolean {
    return this.entries.some((e) => Math.hypot(e.agent.x - x, e.agent.z - z) < d);
  }

  private freeSpot(minDist: number): [number, number] {
    const xs = this.area.map((p) => p.x), zs = this.area.map((p) => p.z);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    let best: [number, number] = [CLEARING.x, CLEARING.z], bestD = -1;
    for (let i = 0; i < 60; i++) {
      const x = x0 + (x1 - x0) * this.rng(), z = z0 + (z1 - z0) * this.rng();
      if (!pointInPolygon(x, z, this.area)) continue;
      const d = this.entries.length ? Math.min(...this.entries.map((e) => Math.hypot(e.agent.x - x, e.agent.z - z))) : Infinity;
      if (d >= minDist) return [x, z];
      if (d > bestD) { bestD = d; best = [x, z]; }
    }
    return best;
  }
}
