"""Stage 3 for the Triceratops asset (issue #21): author the idle / walk / eat clips and export GLB.

  blender -b -P scripts/assets/blender/triceratops_anim.py -- <rig.blend> <out.glb> [--test <outPrefix>] [--check]

Procedural, analytic animation (no hand keyframing), same approach as the T. rex clips:
  * walk - 2.2 s in-place four-beat (lateral sequence) cycle. Each foot's toe tip is planted on a fixed ground
           point during stance (70 % duty) and moves back at exactly the cycle speed (0.78 m/s), so feet do not
           slide. Every leg is an analytic two-bone IK (hind knee forward, fore elbow back). The body bobs four
           times per cycle, rolls toward the supported side, the tail counter-swings.
  * idle - 4.0 s breathing loop: chest/neck pitch, tail sway, weight shift, head drift, all four feet planted.
  * eat  - 5.0 s: the head lowers to the ground, the beak chomps three times (jaw + head nod), the head rises.
Every clip is baked per frame onto the deform bones; the last frame equals the first so it loops.
--check prints the lowest deformed vertex (ground clearance) per clip and any IK solve that had to clamp.
"""
import math
import sys

import bpy
from mathutils import Euler, Matrix, Vector

FPS = 30
FRONT_X, HIND_X = 0.85, 0.95
WALK_T = 2.2
DUTY = 0.70
STRIDE = 1.20                       # m of ground a stance foot travels back
WALK_SPEED = STRIDE / (WALK_T * DUTY)
TIP_REST = {"hind": Vector((0.0, 0.38, 0.05)), "front": Vector((0.0, -1.22, 0.05))}
TAIL_CHAIN = ["tail1", "tail2", "tail3", "tail4", "tail5", "tail6"]
LEGS = {  # leg id: (kind, side sign, bones upper/lower/foot/toes, root bone, pole, x, gait phase)
    "LH": ("hind", 1.0, ("thigh.L", "shin.L", "foot.L", "toes.L"), "hips", Vector((0, -1, 0)), HIND_X, 0.0),
    "LF": ("front", 1.0, ("arm_u.L", "arm_l.L", "hand.L", "fingers.L"), "spine2", Vector((0, 1, 0)), FRONT_X, 0.25),
    "RH": ("hind", -1.0, ("thigh.R", "shin.R", "foot.R", "toes.R"), "hips", Vector((0, -1, 0)), HIND_X, 0.5),
    "RF": ("front", -1.0, ("arm_u.R", "arm_l.R", "hand.R", "fingers.R"), "spine2", Vector((0, 1, 0)), FRONT_X, 0.75),
}
CLAMPED = []


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.pb = arm.pose.bones
        self.rest_m = {b.name: b.matrix_local.copy() for b in arm.data.bones}
        self.head = {b.name: b.head_local.copy() for b in arm.data.bones}
        self.tail = {b.name: b.tail_local.copy() for b in arm.data.bones}
        self.T = {}

    def reset(self):
        self.T = {}

    def fk(self, name, parent, euler=(0, 0, 0), offset=(0, 0, 0), scale=1.0):
        """Rotate `name` about its head by euler (armature axes, radians); inherit parent transform."""
        h = self.head[name]
        D = Euler(euler, "XYZ").to_matrix().to_4x4()
        if scale != 1.0:
            D = D @ Matrix.Scale(scale, 4)
        Tl = Matrix.Translation(offset) @ Matrix.Translation(h) @ D @ Matrix.Translation(-h)
        T = (self.T[parent] if parent else Matrix.Identity(4)) @ Tl
        self.T[name] = T
        self._set(name, T)
        return T

    def _set(self, name, T):
        rest = self.rest_m[name]
        par = self.arm.data.bones[name].parent
        if par is None:
            base = rest
        else:
            ppose = self.T[par.name] @ self.rest_m[par.name] if par.name in self.T else self.rest_m[par.name]
            base = ppose @ self.rest_m[par.name].inverted() @ rest
        self.pb[name].matrix_basis = base.inverted() @ (T @ rest)

    def place(self, name, new_head, new_tail):
        rh = self.head[name]
        rd = (self.tail[name] - rh).normalized()
        nd = (Vector(new_tail) - Vector(new_head)).normalized()
        R = rd.rotation_difference(nd).to_matrix().to_4x4()
        T = Matrix.Translation(new_head) @ R @ Matrix.Translation(-rh)
        self.T[name] = T
        self._set(name, T)
        return T


def rot_x(v, ang):
    c, s = math.cos(ang), math.sin(ang)
    return Vector((v.x, v.y * c - v.z * s, v.y * s + v.z * c))


def leg_ik(rig, leg, tip, alpha, psi):
    """Pose one leg: toe tip at `tip` (armature space), heel raised by `alpha`, toes bent by `psi` (rad)."""
    kind, side, names, root, pole, x, _ = LEGS[leg]
    up, lo, ft, tz = names
    H = rig.T[root] @ rig.head[up]
    ankle0, toe0 = rig.head[ft], rig.tail[tz]
    foot_vec = rig.head[tz] - ankle0
    toe_vec = toe0 - rig.head[tz]
    A = tip + rot_x(ankle0 - toe0, alpha)
    l1 = (rig.tail[up] - rig.head[up]).length
    l2 = (rig.tail[lo] - rig.head[lo]).length
    d_vec = A - H
    d_raw = d_vec.length
    d = min(max(d_raw, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    if d != d_raw:
        CLAMPED.append((leg, d_raw, l1 + l2))
    u = d_vec.normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 1e-6))
    n = pole - u * pole.dot(u)
    n.normalize()
    K = H + u * a + n * h
    A = H + u * d
    rig.place(up, H, K)
    rig.place(lo, K, A)
    foot_end = A + rot_x(foot_vec, alpha)
    rig.place(ft, A, foot_end)
    rig.place(tz, foot_end, foot_end + rot_x(toe_vec, alpha + psi))


def rest_tip(leg):
    kind, side, _, _, _, x, _ = LEGS[leg]
    t = TIP_REST[kind]
    return Vector((side * x, t.y, t.z))


def stand_legs(rig):
    for leg in LEGS:
        leg_ik(rig, leg, rest_tip(leg), 0.0, 0.0)


def pose_tail(rig, yaw_amp, phase, pitch=0.0, lag=0.55):
    prev = "hips"
    for i, n in enumerate(TAIL_CHAIN):
        ang = yaw_amp * math.sin(phase - lag * (i + 1)) * (0.6 + 0.12 * i)
        rig.fk(n, prev, (pitch / len(TAIL_CHAIN), 0, ang))
        prev = n


def walk_frame(rig, t):
    rig.reset()
    tau = 2 * math.pi * t
    step = math.cos(8 * math.pi * (t - 0.125))      # four steps per cycle
    bob = 0.025 * step - 0.07
    roll = math.radians(1.6) * math.sin(tau * 2)
    yaw = math.radians(2.0) * math.sin(tau)
    pitch = math.radians(0.8) * step
    rig.fk("hips", None, (pitch, roll, yaw), (0.03 * math.sin(tau * 2), 0, bob))
    rig.fk("spine1", "hips", (-pitch * 0.4, -roll * 0.3, -yaw * 0.8))
    rig.fk("spine2", "spine1", (-pitch * 0.4, -roll * 0.3, -yaw * 0.6))
    rig.fk("neck1", "spine2", (math.radians(1.5) * math.sin(8 * math.pi * t + 0.8), 0, yaw * 0.8))
    rig.fk("neck2", "neck1", (math.radians(-1.2) * math.sin(8 * math.pi * t + 1.1), 0, yaw * 0.5))
    rig.fk("head", "neck2", (math.radians(1.5) * math.sin(8 * math.pi * t + 1.4), 0, 0))
    rig.fk("jaw", "head", (0, 0, 0))
    pose_tail(rig, math.radians(7.0), tau + math.pi, pitch=math.radians(-1.0) * step)
    for leg, (kind, side, names, root, pole, x, off) in LEGS.items():
        ph = (t + off) % 1.0
        r = rest_tip(leg)
        lift = 0.26 if kind == "front" else 0.22
        if ph < DUTY:                                # stance: tip fixed on the ground, moving back
            k = ph / DUTY
            ty = r.y - STRIDE / 2 + STRIDE * k
            tz = r.z
            heel = smooth((k - 0.8) / 0.2) * math.radians(14.0)
            psi = -heel * 0.5
        else:                                        # swing
            u = (ph - DUTY) / (1 - DUTY)
            ty = r.y + STRIDE / 2 - STRIDE * smooth(u)
            tz = r.z + lift * math.sin(math.pi * min(u * 1.1, 1.0)) ** 1.3
            heel = math.radians(14.0) * (1 - smooth(u * 2.5))
            psi = math.radians(18.0) * math.sin(math.pi * min(u * 1.1, 1.0)) - heel * 0.5 * (1 - smooth(u * 3.0))
        leg_ik(rig, leg, Vector((r.x, ty, tz)), heel, psi)


def idle_frame(rig, t):
    rig.reset()
    tau = 2 * math.pi * t
    breath = math.sin(tau)
    rig.fk("hips", None, (math.radians(0.3) * breath, math.radians(0.5) * math.sin(tau), math.radians(0.6) * math.sin(tau)),
           (0.012 * math.sin(tau), 0, 0.010 * breath))
    rig.fk("spine1", "hips", (math.radians(0.5) * breath, 0, -math.radians(0.4) * math.sin(tau)))
    rig.fk("spine2", "spine1", (math.radians(0.8) * breath, 0, -math.radians(0.4) * math.sin(tau)), scale=1.0 + 0.010 * breath)
    rig.fk("neck1", "spine2", (math.radians(-0.8) * breath + math.radians(1.0) * math.sin(tau + 0.8), 0, math.radians(2.0) * math.sin(tau + 0.6)))
    rig.fk("neck2", "neck1", (math.radians(0.8) * math.sin(tau + 1.1), 0, math.radians(2.0) * math.sin(tau + 0.9)))
    rig.fk("head", "neck2", (math.radians(1.5) * math.sin(tau + 1.4), 0, math.radians(3.0) * math.sin(tau + 1.3)))
    rig.fk("jaw", "head", (math.radians(0.6) * (0.5 + 0.5 * breath), 0, 0))
    pose_tail(rig, math.radians(3.5), tau, lag=0.45)
    stand_legs(rig)


EAT = {"spine1": 4.0, "spine2": 8.0, "neck1": 24.0, "neck2": 22.0, "head": 10.0}   # degrees, nose down at full lower


def eat_frame(rig, t):
    rig.reset()
    tau = 2 * math.pi * t
    env = smooth(t / 0.18) * (1 - smooth((t - 0.82) / 0.18))        # head lowered
    gate = smooth((t - 0.2) / 0.05) * (1 - smooth((t - 0.78) / 0.05))
    cyc = 2 * math.pi * 3 * (t - 0.18) / 0.64
    chew = math.sin(cyc) * gate
    rig.fk("hips", None, (math.radians(-0.5) * env, 0, 0), (0, 0, 0.0))
    rig.fk("spine1", "hips", (math.radians(EAT["spine1"]) * env, 0, 0))
    rig.fk("spine2", "spine1", (math.radians(EAT["spine2"]) * env, 0, 0))
    rig.fk("neck1", "spine2", (math.radians(EAT["neck1"]) * env, 0, math.radians(2.0) * math.sin(tau) * env))
    rig.fk("neck2", "neck1", (math.radians(EAT["neck2"]) * env + math.radians(1.2) * chew, 0, math.radians(1.5) * math.sin(tau) * env))
    rig.fk("head", "neck2", (math.radians(EAT["head"]) * env - math.radians(2.0) * chew, 0, 0))
    rig.fk("jaw", "head", (math.radians(8.0) * (0.5 - 0.5 * math.cos(cyc)) * gate, 0, 0))
    pose_tail(rig, math.radians(2.5), tau, pitch=math.radians(1.0) * env, lag=0.45)
    stand_legs(rig)


CLIPS = {"idle": (idle_frame, 4.0), "walk": (walk_frame, WALK_T), "eat": (eat_frame, 5.0)}


def prep_pose(arm):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"


def author(arm):
    rig = Rig(arm)
    prep_pose(arm)
    if arm.animation_data is None:
        arm.animation_data_create()
    deform = [b.name for b in arm.data.bones if b.use_deform]
    for name, (fn, secs) in CLIPS.items():
        n = int(round(secs * FPS))
        action = bpy.data.actions.new(name)
        arm.animation_data.action = action
        for f in range(n + 1):
            fn(rig, (f % n) / n)
            bpy.context.view_layer.update()
            for b in deform:
                pb = arm.pose.bones[b]
                loc, rot, scl = pb.matrix_basis.decompose()
                pb.location, pb.rotation_quaternion, pb.scale = loc, rot, scl
                pb.keyframe_insert("location", frame=f + 1, group=b)
                pb.keyframe_insert("rotation_quaternion", frame=f + 1, group=b)
                pb.keyframe_insert("scale", frame=f + 1, group=b)
        action.use_fake_user = True
        print("clip", name, n + 1, "keys")
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def check(arm, mesh):
    rig = Rig(arm)
    prep_pose(arm)
    for name, (fn, secs) in CLIPS.items():
        lo = 1e9
        for k in range(0, 40):
            fn(rig, k / 40)
            bpy.context.view_layer.update()
            ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            m = ev.to_mesh()
            zs = [v.co.z for v in m.vertices]
            lo = min(lo, min(zs))
            tipv = min(m.vertices, key=lambda v: v.co.y)
            if name == "eat" and k % 5 == 0:
                print("  eat", k, "nose(y,z)", round(tipv.co.y, 2), round(tipv.co.z, 2), "min z", round(min(zs), 3))
            ev.to_mesh_clear()
        print("CHECK", name, "lowest vertex z", round(lo, 3), "clamped IK solves", len(CLAMPED))
    if CLAMPED:
        print("  worst clamp", max(CLAMPED, key=lambda c: c[1] - c[2]))


def test(arm, prefix):
    rig = Rig(arm)
    prep_pose(arm)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (.6, .6, .6, 1)
    sc.world = w
    for n, e, r in (("k", 3, (math.radians(50), 0, math.radians(35))), ("f", 1, (math.radians(60), 0, math.radians(-140)))):
        lt = bpy.data.lights.new(n, "SUN")
        lt.energy = e
        o = bpy.data.objects.new(n, lt)
        o.rotation_euler = r
        sc.collection.objects.link(o)
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cd.ortho_scale = 9.5
    co = bpy.data.objects.new("c", cd)
    sc.collection.objects.link(co)
    sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = 1400, 700
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    for nm, fn, t in [("walk0", walk_frame, 0.0), ("walk1", walk_frame, 0.12), ("walk2", walk_frame, 0.37),
                      ("walk3", walk_frame, 0.62), ("eat", eat_frame, 0.45), ("idle", idle_frame, 0.25)]:
        fn(rig, t)
        bpy.context.view_layer.update()
        co.location = (30, 0.4, 1.7)
        co.rotation_euler = (math.radians(90), 0, math.radians(90))
        sc.render.filepath = f"{prefix}_{nm}.png"
        bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    src, out = argv[0], argv[1]
    bpy.ops.wm.open_mainfile(filepath=src)
    arm = bpy.data.objects["Armature"]
    mesh = bpy.data.objects["Triceratops"]
    if "--test" in argv:
        test(arm, argv[argv.index("--test") + 1])
        return
    if "--check" in argv:
        check(arm, mesh)
        return
    bpy.context.scene.render.fps = FPS
    author(arm)
    arm.animation_data.action = None
    for action in list(bpy.data.actions):
        tr = arm.animation_data.nla_tracks.new()
        tr.name = action.name
        st = tr.strips.new(action.name, 1, action)
        st.name = action.name
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    mesh.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=True,
                              export_animation_mode="NLA_TRACKS", export_skins=True, export_yup=True,
                              export_image_format="AUTO", export_force_sampling=True)
    print("exported", out, "walk speed", round(WALK_SPEED, 3))


main()
