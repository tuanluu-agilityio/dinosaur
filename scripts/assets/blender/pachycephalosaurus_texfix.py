"""Stage 1b for the Pachycephalosaurus asset (issue #24): local texture repair.

  blender -b -P scripts/assets/blender/pachycephalosaurus_texfix.py -- <prep.blend> <out.blend> [--debug <dir>]

The source UVs stretch or mirror the skin texture in a few places (belly midline, inner thigh, metatarsus seam,
pale smooth brow). Only those regions are repaired; nothing is blurred or flattened:
  * each region has a vertex weight (smooth falloff), interpolated per texel by rasterising the triangles
    of the (decimated) mesh into the original UV layout;
  * the replacement is a patch of healthy scale texture (colour and normal) cut from a nearby well-mapped
    area of the same atlas, box-projected from 3D at its own native texel density (mirror-tiled), tone-matched
    to the region's own mean colour, and cross-faded in with the weight;
  * the normal map is re-projected the same way (donor normal re-expressed in the target tangent frame).
UVs, geometry and every texel outside the regions are untouched.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

W = H = 2048


def sstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ---- regions: weight(P, N) -> 0..1 on vertices; donor = (centre, radius) of a healthy area; cond = texel test
def w_belly(p, n):
    if p[2] > 1.20 or n[2] > -0.15:
        return 0.0
    return float(sstep(abs(p[1] + 0.05), 0.80, 0.70) * (1 - sstep(abs(p[0]), 0.09, 0.19)) * sstep(-n[2], 0.15, 0.45))


def w_thigh(p, n):
    sx = 1.0 if p[0] > 0 else -1.0
    if not (0.45 < p[2] < 1.15) or not (-0.45 < p[1] < 0.5):
        return 0.0
    inward = -n[0] * sx
    return float(sstep(abs(p[0]), 0.10, 0.16) * (1 - sstep(abs(p[0]), 0.30, 0.40)) * sstep(inward, 0.15, 0.5)
                 * sstep(p[2], 0.45, 0.60) * (1 - sstep(p[2], 1.00, 1.15)))


def w_shin(p, n):
    if not (0.05 < p[2] < 0.75) or abs(p[0]) < 0.12:
        return 0.0
    return float(sstep(p[2], 0.30, 0.38) * (1 - sstep(p[2], 0.55, 0.70)) * sstep(p[1], -0.35, -0.2) * (1 - sstep(p[1], 0.30, 0.45)))


EYES = []   # filled from the two small islands


def w_brow(p, n):
    if not EYES:
        return 0.0
    sx = 1.0 if p[0] > 0 else -1.0
    e = EYES[0] if EYES[0][0] * sx > 0 else EYES[1]
    c = Vector((e[0], e[1] - 0.02, e[2] + 0.05))
    d = (Vector(p) - c).length
    return float(1 - sstep(d, 0.07, 0.12)) * float(sstep(n[2], -0.1, 0.3))


RECTS = {"belly": (800, 1388, 886, 1489)}

REGIONS = [
    # name, weight fn, donor centre (x,y,z), donor radius, texel condition on original colour
    ("belly", w_belly, (0.26, 0.05, 1.0), 0.07, None),
    ("thigh", w_thigh, (0.40, -0.05, 0.9), 0.07, None),
    ("shin", w_shin, (0.40, -0.05, 0.78), 0.09, None),
    ("brow", w_brow, (0.12, -1.25, 1.75), 0.06, "pale"),
]


def cover(tris_uv):
    """boolean texel mask covered by the given UV triangles (px coordinates)"""
    m = np.zeros((H, W), dtype=bool)
    for UV in tris_uv:
        x0, y0 = np.floor(UV.min(0)).astype(int) - 1; x1, y1 = np.ceil(UV.max(0)).astype(int) + 1
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W - 1), min(y1, H - 1)
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (UV[1, 1] - UV[2, 1]) * (UV[0, 0] - UV[2, 0]) + (UV[2, 0] - UV[1, 0]) * (UV[0, 1] - UV[2, 1])
        if abs(d) < 1e-9:
            continue
        l0 = ((UV[1, 1] - UV[2, 1]) * (gx - UV[2, 0]) + (UV[2, 0] - UV[1, 0]) * (gy - UV[2, 1])) / d
        l1 = ((UV[2, 1] - UV[0, 1]) * (gx - UV[2, 0]) + (UV[0, 0] - UV[2, 0]) * (gy - UV[2, 1])) / d
        ins = (l0 >= 0) & (l1 >= 0) & (l0 + l1 <= 1)
        m[y0:y1 + 1, x0:x1 + 1] |= ins
    return m


def donor_patch(mesh, uv, centre, radius):
    """Largest fully covered square of UV texels (<= 200 px) among the faces within 2.2x radius of centre
    (one well-mapped island, no padding/gap texels); returns lo, hi (px), native texel density (px/m)."""
    c = Vector(centre)
    tris, areas3, areasuv = [], 0.0, 0.0
    for poly in mesh.polygons:
        vs = [mesh.vertices[i].co for i in poly.vertices]
        cen = sum(vs, Vector()) / 3
        if (cen - c).length > radius * 2.2:
            continue
        us = [uv[l].uv for l in poly.loop_indices]
        tris.append(np.array([(u.x * W, u.y * H) for u in us]))
        if (cen - c).length <= radius:
            areas3 += (vs[1] - vs[0]).cross(vs[2] - vs[0]).length / 2
            areasuv += abs((us[1] - us[0]).cross(us[2] - us[0])) / 2 * W * H
    dens = math.sqrt(areasuv / max(areas3, 1e-9))
    m = cover(tris).astype(np.int32)
    # erode by 3 px so border texels (bleed/padding) are excluded
    e = m.copy()
    for dy in (-3, 0, 3):
        for dx in (-3, 0, 3):
            e &= np.roll(np.roll(m, dy, 0), dx, 1)
    ii = np.pad(e.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    best = (0, 0, 0)
    for sz in range(200, 24, -8):
        sums = ii[sz:, sz:] - ii[:-sz, sz:] - ii[sz:, :-sz] + ii[:-sz, :-sz]
        hit = np.argwhere(sums == sz * sz)
        if len(hit):
            # prefer the candidate nearest the median UV of the sphere faces
            mid = np.median(np.concatenate(tris), 0)
            k = np.argmin(((hit[:, 0] - mid[1]) ** 2 + (hit[:, 1] - mid[0]) ** 2))
            best = (hit[k][1], hit[k][0], sz)
            break
    x, y, sz = best
    return np.array([x, y], float), np.array([x + sz, y + sz], float), dens, len(tris)


def tri_wave(x):
    """mirror-repeat of x (in patch units) into [0,1]"""
    x = np.mod(x, 2.0)
    return np.where(x > 1.0, 2.0 - x, x)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    src, out = argv[0], argv[1]
    dbg = argv[argv.index("--debug") + 1] if "--debug" in argv else None
    bpy.ops.wm.open_mainfile(filepath=src)
    ob = bpy.data.objects["Pachycephalosaurus"]
    me = ob.data
    uv = me.uv_layers.active.data
    base = bpy.data.images["pachycephalosaurus_basecolor"]
    nrm = bpy.data.images["pachycephalosaurus_normal"]
    bc = np.empty(W * H * 4, dtype=np.float32); base.pixels.foreach_get(bc); bc = bc.reshape(H, W, 4)
    nm = np.empty(W * H * 4, dtype=np.float32); nrm.pixels.foreach_get(nm); nm = nm.reshape(H, W, 4)
    bc0, nm0 = bc.copy(), nm.copy()

    # eyes = the small separate islands
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    seen = set(); comps = []
    for v in bm.verts:
        if v.index in seen:
            continue
        st, comp = [v], []
        seen.add(v.index)
        while st:
            c = st.pop(); comp.append(c.index)
            for e in c.link_edges:
                o = e.other_vert(c)
                if o.index not in seen:
                    seen.add(o.index); st.append(o)
        comps.append(comp)
    bm.free()
    comps.sort(key=len)
    eye_verts = set()
    for comp in comps[:2]:
        if len(comp) < 4000:
            pts = [me.vertices[i].co for i in comp]
            EYES.append(tuple(sum(pts, Vector()) / len(pts)))
            eye_verts.update(comp)
    print("eyes", EYES, [len(c) for c in comps[:3]])

    verts = [v.co for v in me.vertices]
    norms = [v.normal for v in me.vertices]
    for name, wf, dc, dr, cond in REGIONS:
        wv = np.array([0.0 if i in eye_verts else wf(verts[i], norms[i]) for i in range(len(verts))])
        print(name, "verts weighted", int((wv > 0.01).sum()))
        lo, hi, dens, nf = donor_patch(me, uv, dc, dr)
        if name in RECTS:                   # hand-picked clean rectangle of the atlas (px, y from the bottom)
            lo, hi = np.array(RECTS[name][:2], float), np.array(RECTS[name][2:], float) + 4
        size = hi - lo
        print(name, "donor uv px", lo, hi, "density px/m", dens, "faces", nf)
        # donor patch (shrink 2px from the edges so island borders do not bleed in)
        lo = lo + 2; hi = hi - 2; size = hi - lo
        ys, xs = int(lo[1]), int(lo[0])
        dcol = bc0[ys:int(hi[1]), xs:int(hi[0]), :3]
        dmean = dcol.reshape(-1, 3).mean(0)
        if dbg:
            os.makedirs(dbg, exist_ok=True)
            im = bpy.data.images.new("d", dcol.shape[1], dcol.shape[0])
            buf = np.ones((dcol.shape[0], dcol.shape[1], 4), dtype=np.float32); buf[..., :3] = dcol
            im.pixels.foreach_set(buf.ravel()); im.filepath_raw = os.path.join(dbg, f"donor-{name}.png"); im.file_format = "PNG"; im.save()
        # region mean colour of the original, where weight is high
        acc, cnt = np.zeros(3), 0
        regions_tri = []
        for poly in me.polygons:
            idx = poly.vertices
            ww = wv[list(idx)]
            if ww.max() < 0.01:
                continue
            regions_tri.append((poly, ww))
        print(name, "triangles", len(regions_tri))
        tone_acc = []
        for pass_ in (0, 1):
            for poly, ww in regions_tri:
                i0, i1, i2 = poly.vertices
                P = np.array([verts[i0], verts[i1], verts[i2]], dtype=np.float64)
                N = np.array([norms[i0], norms[i1], norms[i2]], dtype=np.float64)
                UV = np.array([[uv[l].uv.x * W, uv[l].uv.y * H] for l in poly.loop_indices])
                x0, y0 = np.floor(UV.min(0)).astype(int) - 1; x1, y1 = np.ceil(UV.max(0)).astype(int) + 1
                x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W - 1), min(y1, H - 1)
                gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
                d = (UV[1, 1] - UV[2, 1]) * (UV[0, 0] - UV[2, 0]) + (UV[2, 0] - UV[1, 0]) * (UV[0, 1] - UV[2, 1])
                if abs(d) < 1e-9:
                    continue
                l0 = ((UV[1, 1] - UV[2, 1]) * (gx - UV[2, 0]) + (UV[2, 0] - UV[1, 0]) * (gy - UV[2, 1])) / d
                l1 = ((UV[2, 1] - UV[0, 1]) * (gx - UV[2, 0]) + (UV[0, 0] - UV[2, 0]) * (gy - UV[2, 1])) / d
                l2 = 1 - l0 - l1
                m = (l0 > -0.03) & (l1 > -0.03) & (l2 > -0.03)
                if not m.any():
                    continue
                L = np.stack([l0[m], l1[m], l2[m]], 1)
                wt = np.clip(L @ ww, 0, 1)
                px = L @ P
                nn = L @ N
                nn /= np.linalg.norm(nn, axis=1, keepdims=True) + 1e-12
                tx, ty = gx[m].astype(int), gy[m].astype(int)
                orig = bc0[ty, tx, :3]
                if pass_ == 0:
                    tone_acc.append(orig[wt > 0.3])
                    continue
                # box projection of the 3D position at the donor's native density
                a = np.argmax(np.abs(nn), 1)
                ax1 = np.where(a == 0, 1, 0); ax2 = np.where(a == 2, 1, 2)
                pu = px[np.arange(len(px)), ax1]; pv = px[np.arange(len(px)), ax2]
                def tap(tu, tv, seed):
                    iu, iv = np.floor(tu).astype(int), np.floor(tv).astype(int)
                    hsh = ((iu * 73856093) ^ (iv * 19349663) ^ (a * 83492791) ^ seed) & 0xFFFF
                    fu, fv = np.mod(tu, 1.0), np.mod(tv, 1.0)     # translation only (mirroring made kaleidoscopes)
                    rot = (hsh >> 1) & 1                            # per-tile 90 degree turn breaks up the repetition
                    su = np.where(rot == 1, fv, fu); sv = np.where(rot == 1, 1.0 - fu, fv)
                    return ((lo[0] + su * (size[0] - 1)).astype(int), (lo[1] + sv * (size[1] - 1)).astype(int), fu, fv)
                tu = pu * dens / size[0]; tv = pv * dens / size[1]
                dxA, dyA, fu, fv = tap(tu, tv, 0)
                dxB, dyB, _, _ = tap(tu + 0.5, tv + 0.5, 0x5A5A)
                tent = lambda f: 1 - np.abs(2 * f - 1)           # 1 at the tile centre, 0 at its edges
                wa = (tent(fu) * tent(fv))[:, None]               # cross-fade the two tilings so no tile edge shows
                dcolx = (bc0[dyA, dxA, :3] * wa + bc0[dyB, dxB, :3] * (1 - wa)) * tone
                al = wt.copy()
                if cond == "pale":
                    lum = orig @ np.array([0.3, 0.55, 0.15])
                    al *= sstep(lum, 0.22, 0.34)
                al = np.clip(al, 0, 1)[:, None]
                bc[ty, tx, :3] = orig * (1 - al) + np.clip(dcolx, 0, 1) * al
                # normal: donor tangent-space normal expressed in the target tangent frame
                dn = (nm0[dyA, dxA, :3] * 2 - 1) * wa + (nm0[dyB, dxB, :3] * 2 - 1) * (1 - wa)
                dn /= np.linalg.norm(dn, axis=1, keepdims=True) + 1e-9
                Nv = nn
                e1 = np.zeros_like(Nv); e2 = np.zeros_like(Nv)
                e1[np.arange(len(px)), ax1] = 1; e2[np.arange(len(px)), ax2] = 1
                e1 -= Nv * (e1 * Nv).sum(1, keepdims=True); e1 /= np.linalg.norm(e1, axis=1, keepdims=True) + 1e-9
                e2 -= Nv * (e2 * Nv).sum(1, keepdims=True); e2 /= np.linalg.norm(e2, axis=1, keepdims=True) + 1e-9
                Nw = dn[:, :1] * e1 + dn[:, 1:2] * e2 + dn[:, 2:3] * Nv
                Nw /= np.linalg.norm(Nw, axis=1, keepdims=True) + 1e-9
                # target tangent frame from the triangle's UV derivatives
                dp1, dp2 = P[1] - P[0], P[2] - P[0]
                du1, du2 = UV[1] - UV[0], UV[2] - UV[0]
                det = du1[0] * du2[1] - du2[0] * du1[1]
                if abs(det) < 1e-12:
                    continue
                T = (dp1 * du2[1] - dp2 * du1[1]) / det
                B = (-dp1 * du2[0] + dp2 * du1[0]) / det
                Tn = np.tile(T, (len(px), 1)); Bn = np.tile(B, (len(px), 1))
                Tn -= Nv * (Tn * Nv).sum(1, keepdims=True); Tn /= np.linalg.norm(Tn, axis=1, keepdims=True) + 1e-9
                Bn -= Nv * (Bn * Nv).sum(1, keepdims=True) + Tn * (Bn * Tn).sum(1, keepdims=True); Bn /= np.linalg.norm(Bn, axis=1, keepdims=True) + 1e-9
                tn = np.stack([(Nw * Tn).sum(1), (Nw * Bn).sum(1), (Nw * Nv).sum(1)], 1)
                o = nm0[ty, tx, :3] * 2 - 1
                mix = o * (1 - al) + tn * al
                mix /= np.linalg.norm(mix, axis=1, keepdims=True) + 1e-9
                nm[ty, tx, :3] = mix * 0.5 + 0.5
            if pass_ == 0:
                allc = np.concatenate(tone_acc) if tone_acc else np.zeros((1, 3))
                rmean = allc.mean(0) if len(allc) else dmean
                tone = np.clip(rmean / np.maximum(dmean, 1e-3), 0.7, 1.4)
                print(name, "tone", tone)
    base.pixels.foreach_set(bc.ravel()); base.pack()
    nrm.pixels.foreach_set(nm.ravel()); nrm.pack()
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("saved", out)


main()
