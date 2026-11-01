"""Stage 3 for the Pachycephalosaurus asset (issue #24): author the idle / walk clips and export GLB.

  blender -b -P scripts/assets/blender/pachycephalosaurus_anim.py -- <rig.blend> <out.glb> [--test <outPrefix>|--diag]

Procedural, analytic animation (the source's only clip is a travelling leap, so it is not shipped):
  * walk - 1.75 s in-place cycle at 0.7 m/s ground speed. Each foot's toe tip is planted on a fixed ground
           point during stance (60 % duty) and moves back at exactly the cycle speed, so feet do not slide.
           Analytic two-bone IK (knee forward, ankle back). Hips bob twice per cycle, pelvis yaws a few
           degrees, the stiff (ossified-tendon) tail counter-swings a little, short arms swing a few degrees,
           the head stays nearly level (dome steadied).
  * idle - 4.0 s breathing loop: chest/neck pitch, slight tail sway, weight shift, small head drift.
Frame rate is 24 fps (same as the evidence renders) so frame numbers, seconds and video time agree.
Every clip is baked per frame onto the deform bones; the last key equals the first so it loops.
"""
import math
import sys

import bpy
from mathutils import Euler, Matrix, Vector

FPS = 24
LEG_X = 0.34
WALK_T = 1.75
WALK_SPEED = 0.7                   # m/s of ground the stance foot travels back
DUTY = 0.6
STRIDE = WALK_SPEED * WALK_T * DUTY  # foot travel during stance (m)
TIP_REST = Vector((0.0, -0.32, 0.10))   # yz of toe tip (x added per side) = rest pose
TAIL_CHAIN = ["tail1", "tail2", "tail3", "tail4", "tail5", "tail6"]
LIFT = 0.10                        # swing-phase toe clearance (m)


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
        self.T = {}   # name -> posed transform (rest space -> posed space)

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
        """Write matrix_basis directly (pose = parent_pose @ parent_rest^-1 @ rest @ basis)."""
        rest = self.rest_m[name]
        par = self.arm.data.bones[name].parent
        if par is None:
            base = rest
        else:
            ppose = self.T[par.name] @ self.rest_m[par.name] if par.name in self.T else self.rest_m[par.name]
            base = ppose @ self.rest_m[par.name].inverted() @ rest
        self.pb[name].matrix_basis = base.inverted() @ (T @ rest)

    def place(self, name, new_head, new_tail):
        """Aim bone `name` from new_head to new_tail (minimal rotation from rest)."""
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


def leg_ik(rig, side, tip, alpha, psi):
    """Pose one leg: toe tip at `tip` (world), heel raised by `alpha`, toes bent by `psi` (rad)."""
    tn = {n: f"{n}.{side}" for n in ("thigh", "shin", "foot", "toes")}
    H = rig.T["hips"] @ rig.head[tn["thigh"]]
    ankle0, toe0 = rig.head[tn["foot"]], rig.tail[tn["toes"]]
    foot_vec = rig.head[tn["toes"]] - ankle0
    toe_vec = toe0 - rig.head[tn["toes"]]
    A = tip + rot_x(ankle0 - toe0, alpha)    # rigid foot rotated about the toe tip
    l1 = (rig.tail[tn["thigh"]] - rig.head[tn["thigh"]]).length
    l2 = (rig.tail[tn["shin"]] - rig.head[tn["shin"]]).length
    d_vec = A - H
    d = min(max(d_vec.length, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    u = d_vec.normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 1e-6))
    pole = Vector((0, -1, 0))
    n = pole - u * pole.dot(u)
    n.normalize()
    K = H + u * a + n * h
    A = H + u * d
    rig.place(tn["thigh"], H, K)
    rig.place(tn["shin"], K, A)
    foot_end = A + rot_x(foot_vec, alpha)
    rig.place(tn["foot"], A, foot_end)
    rig.place(tn["toes"], foot_end, foot_end + rot_x(toe_vec, alpha + psi))


def pose_arms(rig, swing, bend=0.0):
    for side, sgn in (("L", 1), ("R", -1)):
        rig.fk(f"arm_u.{side}", "spine2", (swing * sgn, 0, 0))
        rig.fk(f"arm_l.{side}", f"arm_u.{side}", (bend, 0, 0))
        rig.fk(f"hand.{side}", f"arm_l.{side}", (0, 0, 0))


def pose_tail(rig, yaw_amp, phase, pitch=0.0, lag=0.35):
    prev = "hips"
    for i, n in enumerate(TAIL_CHAIN):
        ang = yaw_amp * math.sin(phase - lag * (i + 1)) * (0.6 + 0.12 * i)
        rig.fk(n, prev, (pitch / len(TAIL_CHAIN), 0, ang))
        prev = n


def stand_legs(rig):
    for side, sgn in (("L", 1.0), ("R", -1.0)):
        leg_ik(rig, side, Vector((sgn * LEG_X, TIP_REST.y, TIP_REST.z)), 0.0, 0.0)


def walk_frame(rig, t):
    """t in [0,1): cycle phase."""
    rig.reset()
    tau = 2 * math.pi * t
    s2 = math.cos(4 * math.pi * (t - 0.3))      # +1 at each mid-stance
    bob = 0.03 * s2 - 0.01
    sway = 0.02 * math.sin(tau)
    yaw = math.radians(3.5) * math.sin(tau)
    pitch = math.radians(1.0) * s2
    rig.fk("hips", None, (pitch, 0, yaw), (sway, 0, bob))
    rig.fk("spine1", "hips", (-pitch * 0.5, 0, -yaw * 0.7))
    rig.fk("spine2", "spine1", (-pitch * 0.5, 0, -yaw * 0.5))
    rig.fk("neck1", "spine2", (math.radians(2.0) * math.sin(4 * math.pi * t + 1.0), 0, yaw * 0.6))
    rig.fk("neck2", "neck1", (math.radians(-2.0) * math.sin(4 * math.pi * t + 1.0), 0, yaw * 0.3))
    rig.fk("head", "neck2", (math.radians(1.5) * math.sin(4 * math.pi * t + 1.6), 0, 0))
    pose_tail(rig, math.radians(5.0), tau + math.pi, pitch=math.radians(-1.0) * s2)
    pose_arms(rig, math.radians(6.0) * math.sin(tau), math.radians(2.0))
    for side, sgn, off in (("L", 1.0, 0.0), ("R", -1.0, 0.5)):
        ph = (t + off) % 1.0
        sx = sgn * LEG_X
        if ph < DUTY:                       # stance: tip planted, moving back with the ground
            k = ph / DUTY
            ty = TIP_REST.y - STRIDE / 2 + STRIDE * k
            tz = TIP_REST.z
            heel = smooth((k - 0.75) / 0.25) * math.radians(16.0)   # heel lifts before toe-off
            psi = -heel
        else:                               # swing
            u = (ph - DUTY) / (1 - DUTY)
            ty = TIP_REST.y + STRIDE / 2 - STRIDE * smooth(u)
            tz = TIP_REST.z + LIFT * math.sin(math.pi * min(u * 1.15, 1.0)) ** 1.3
            heel = math.radians(16.0) * (1 - smooth(u * 2.0)) - math.radians(3.0) * smooth((u - 0.4) / 0.6) * (1 - smooth((u - 0.85) / 0.15))
            psi = math.radians(20.0) * math.sin(math.pi * min(u * 1.1, 1.0)) - heel * (1 - smooth(u * 3.0))
        leg_ik(rig, side, Vector((sx, ty, tz)), heel, psi)


def idle_frame(rig, t):
    rig.reset()
    tau = 2 * math.pi * t
    breath = math.sin(tau)
    rig.fk("hips", None, (math.radians(0.3) * breath, 0, math.radians(0.6) * math.sin(tau)), (0.008 * math.sin(tau), 0, 0.006 * breath))
    rig.fk("spine1", "hips", (math.radians(0.6) * breath, 0, -math.radians(0.4) * math.sin(tau)))
    rig.fk("spine2", "spine1", (math.radians(1.0) * breath, 0, -math.radians(0.4) * math.sin(tau)), scale=1.0 + 0.012 * breath)
    rig.fk("neck1", "spine2", (math.radians(-1.0) * breath, 0, math.radians(2.0) * math.sin(tau + 0.6)))
    rig.fk("neck2", "neck1", (math.radians(0.8) * breath, 0, math.radians(2.5) * math.sin(tau + 0.9)))
    rig.fk("head", "neck2", (math.radians(1.2) * math.sin(tau + 1.2), 0, math.radians(3.0) * math.sin(tau + 1.2)))
    pose_tail(rig, math.radians(2.0), tau, lag=0.3)
    pose_arms(rig, math.radians(2.0) * breath, math.radians(1.0))
    stand_legs(rig)


CLIPS = {"idle": (idle_frame, 4.0), "walk": (walk_frame, WALK_T)}


def author(arm):
    rig = Rig(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    if arm.animation_data is None:
        arm.animation_data_create()
    deform = [b.name for b in arm.data.bones if b.use_deform]
    for name, (fn, secs) in CLIPS.items():
        n = int(round(secs * FPS))
        action = bpy.data.actions.new(name)
        arm.animation_data.action = action
        for f in range(n + 1):                      # frame n == frame 0 so the clip loops cleanly
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
        print("clip", name, n + 1, "keys", secs, "s")
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def diag(arm, mesh):
    """Print the lowest foot vertex over the walk cycle (foot-on-ground / planting check)."""
    rig = Rig(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for k in range(0, 21):
        t = k / 20
        walk_frame(rig, t)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        e = mesh.evaluated_get(dg)
        vs = [v.co for v in e.data.vertices]
        for side in ("L", "R"):
            sx = 1 if side == "L" else -1
            foot = [v for v in vs if v.x * sx > 0.1 and v.z < 0.45 and v.y < 0.25]
            lo = min(foot, key=lambda v: v.z)
            print(f"diag t={t:.2f} {side} lowest foot vert z={lo.z:.3f} y={lo.y:.3f}")
    bpy.ops.object.mode_set(mode="OBJECT")


def test(arm, prefix):
    rig = Rig(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (.5, .5, .5, 1)
    sc.world = w
    for n, e, r in (("k", 3, (math.radians(50), 0, math.radians(35))), ("f", 1, (math.radians(60), 0, math.radians(-140)))):
        lt = bpy.data.lights.new(n, "SUN")
        lt.energy = e
        o = bpy.data.objects.new(n, lt)
        o.rotation_euler = r
        sc.collection.objects.link(o)
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cd.ortho_scale = 6.0
    co = bpy.data.objects.new("c", cd)
    sc.collection.objects.link(co)
    sc.camera = co
    sc.render.resolution_x = sc.render.resolution_y = 800
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    for nm, fn, t in [("walk0", walk_frame, 0.0), ("walk3", walk_frame, 0.3), ("walk6", walk_frame, 0.65), ("idle", idle_frame, 0.25)]:
        fn(rig, t)
        bpy.context.view_layer.update()
        co.location = (-13, 0.8, 1.4)
        co.rotation_euler = (Vector((0, 0.8, 1.4)) - co.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = f"{prefix}_{nm}.png"
        bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    src, out = argv[0], argv[1]
    bpy.ops.wm.open_mainfile(filepath=src)
    arm = bpy.data.objects["Armature"]
    mesh = bpy.data.objects["Pachycephalosaurus"]
    if "--test" in argv:
        test(arm, argv[argv.index("--test") + 1])
        return
    if "--diag" in argv:
        diag(arm, mesh)
        return
    bpy.context.scene.render.fps = FPS
    author(arm)
    arm.animation_data.action = None   # park each action on its own NLA track so the exporter writes all
    for action in [a for a in bpy.data.actions if a.name in CLIPS]:
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
    print("exported", out)


main()
