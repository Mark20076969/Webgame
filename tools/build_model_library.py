"""
Túlélőjáték modellkönyvtár – Blender 4.x
Futtatás: Blender -> Scripting fül -> Open -> ez a fájl -> Run Script
Eredmény: a jelenet egy "Library" gyűjteménybe kerül, és exportálódik egy GLB fájlba
(a home mappába: survival_models.glb). Nincs textúra, csak színes anyagok.
"""
import bpy, bmesh, math, random, os
from mathutils import Matrix, Vector

CUT = 0.5          # vágás magassága a fán (lokális méter)
SPACING = 4.0      # a modellek közti távolság a kirakóban
EXPORT_PATH = os.path.join(os.path.expanduser("~"), "survival_models.glb")

# ---------------------------------------------------------------- takarítás
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for block in (bpy.data.meshes, bpy.data.materials):
    for b in list(block):
        if b.users == 0:
            block.remove(b)

lib = bpy.data.collections.get("Library")
if lib is None:
    lib = bpy.data.collections.new("Library")
    bpy.context.scene.collection.children.link(lib)

# ---------------------------------------------------------------- anyagok
def mat(name, rgb, rough=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    return m

M_BARK   = mat("Bark",       (0.25, 0.16, 0.09))
M_PINE   = mat("PineLeaf",   (0.06, 0.20, 0.09))
M_LEAF   = mat("Leaf",       (0.17, 0.36, 0.08))
M_CUT    = mat("WoodCut",    (0.65, 0.47, 0.27))
M_ROCK   = mat("RockMat",    (0.42, 0.40, 0.37))
M_BUSH   = mat("BushLeaf",   (0.12, 0.30, 0.07))
M_GRASS  = mat("Grass",      (0.22, 0.42, 0.10))
M_DRY    = mat("DryGrass",   (0.50, 0.45, 0.20))
M_YELLOW = mat("PetalYellow",(0.95, 0.80, 0.10))
M_WHITE  = mat("PetalWhite", (0.92, 0.92, 0.88))
M_FCEN   = mat("FlowerCenter",(0.85, 0.45, 0.05))
M_STEM   = mat("MushroomStem",(0.85, 0.80, 0.68))
M_RED    = mat("MushroomRed",(0.70, 0.08, 0.06))
M_BROWN  = mat("MushroomBrown",(0.38, 0.22, 0.10))

# ---------------------------------------------------------------- építőelemek
def tag(bm, before, mi):
    new = [f for f in bm.faces if f not in before]
    for f in new:
        f.material_index = mi
        f.smooth = False
    return new

def cone(bm, mi, pos, r1, r2, h, seg=8, rot=None):
    M = Matrix.Translation(pos) @ (rot if rot is not None else Matrix.Identity(4))
    before = set(bm.faces)
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r1, radius2=r2, depth=h, matrix=M)
    return tag(bm, before, mi)

def ico(bm, mi, pos, r, scale=(1.0, 1.0, 1.0)):
    M = Matrix.Translation(pos) @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
    before = set(bm.faces)
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r, matrix=M)
    return tag(bm, before, mi)

def to_mesh(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    return me

# ---------------------------------------------------------------- kirakó
cursor = {}
def spawn(name, me, row, z=0.0, **props):
    x = cursor.get(row, 0.0)
    cursor[row] = x + SPACING
    o = bpy.data.objects.new(name, me)
    o.location = (x, row * SPACING * 2, z)
    for k, v in props.items():
        o[k] = v
    lib.objects.link(o)
    return o

def next_slot(row):
    return cursor.get(row, 0.0)

def spawn_at(name, me, row, x, z=0.0, **props):
    o = bpy.data.objects.new(name, me)
    o.location = (x, row * SPACING * 2, z)
    for k, v in props.items():
        o[k] = v
    lib.objects.link(o)
    return o

# ---------------------------------------------------------------- fák
def full_tree(kind, variant, seed):
    random.seed(seed)
    bm = bmesh.new()
    if kind == "pine":
        j = 0.15 * variant
        cone(bm, 0, (0, 0, 0.50), 0.13, 0.10, 1.0, 6)
        cone(bm, 1, (0, 0, 1.65), 1.15 + j, 0.05, 1.7)
        cone(bm, 1, (0, 0, 2.45), 0.90 + j, 0.05, 1.5)
        cone(bm, 1, (0, 0, 3.25), 0.58 + j, 0.02, 1.3)
        mats = [M_BARK, M_PINE, M_CUT]
    else:
        s = 1.0 + 0.15 * variant
        cone(bm, 0, (0, 0, 0.9), 0.18, 0.12, 1.8, 6)
        ico(bm, 1, (0, 0, 2.6), 1.2, (s, s, 0.85))
        ico(bm, 1, (0, 0, 3.3), 0.8, (0.9, 0.9 * s, 0.9))
        for v in bm.verts:
            if v.co.z > 1.6:
                v.co += Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * 0.18
        mats = [M_BARK, M_LEAF, M_CUT]
    return to_mesh(f"tmp_{kind}_{variant}", bm, mats)

def split_tree(src, base):
    out = {}
    for part in ("stump", "top"):
        bm = bmesh.new()
        bm.from_mesh(src)
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, CUT), plane_no=(0, 0, 1),
                               clear_inner=(part == "top"), clear_outer=(part == "stump"))
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        bnd = [e for e in bm.edges if e.is_boundary]
        r = bmesh.ops.holes_fill(bm, edges=bnd, sides=16)
        for f in r["faces"]:
            f.material_index = 2
            f.smooth = False
        if part == "top":
            for v in bm.verts:
                v.co.z -= CUT          # origó a vágás pontjára
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        out[part] = to_mesh(f"{base}_{part}", bm, list(src.materials))
    return out

for kind, label in (("pine", "pine"), ("broad", "broad")):
    for variant, letter in ((0, "a"), (1, "b")):
        base = f"{label}_{letter}"
        src = full_tree(kind, variant, seed=10 + variant + (5 if kind == "broad" else 0))
        parts = split_tree(src, base)
        bpy.data.meshes.remove(src)
        x = next_slot(0)
        spawn_at(f"{base}_stump", parts["stump"], 0, x, 0.0, type=label)
        spawn_at(f"{base}_top", parts["top"], 0, x, CUT, type=label, cut_height=CUT)
        cursor[0] = x + SPACING

# ---------------------------------------------------------------- rönkök, ágak
ROT_Y = Matrix.Rotation(math.radians(90), 4, 'Y')   # fekvő henger (x tengely mentén)

def make_log(name, length, radius):
    bm = bmesh.new()
    cone(bm, 0, (0, 0, radius), radius, radius, length, 8, ROT_Y)
    bm.normal_update()
    for f in bm.faces:
        if abs(f.normal.x) > 0.9:
            f.material_index = 2
    return to_mesh(name, bm, [M_BARK, M_BARK, M_CUT])

spawn("log_long",  make_log("log_long", 2.4, 0.20), 1)
spawn("log_short", make_log("log_short", 1.0, 0.17), 1)

bm = bmesh.new()
cone(bm, 0, (0, 0, 0.05), 0.06, 0.03, 1.3, 6, ROT_Y)
spawn("branch", to_mesh("branch", bm, [M_BARK]), 1)

# ---------------------------------------------------------------- sziklák
def make_rock(name, r, sx, sy, sz, seed):
    random.seed(seed)
    bm = bmesh.new()
    ico(bm, 0, (0, 0, 0), r, (sx, sy, sz))
    for v in bm.verts:
        v.co *= random.uniform(0.82, 1.2)
    min_z = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z = max(0.0, v.co.z - min_z - 0.15 * r * sz)
    return to_mesh(name, bm, [M_ROCK])

rock_specs = [
    ("rock_s1", 0.30, 1.0, 1.0, 0.70, 1), ("rock_s2", 0.28, 1.2, 0.9, 0.65, 2),
    ("rock_m1", 0.60, 1.0, 1.1, 0.75, 3), ("rock_m2", 0.55, 1.2, 0.9, 0.80, 4),
    ("rock_l1", 1.10, 1.0, 1.0, 0.80, 5), ("rock_l2", 1.00, 1.3, 0.9, 0.70, 6),
]
for name, r, sx, sy, sz, seed in rock_specs:
    spawn(name, make_rock(name, r, sx, sy, sz, seed), 2)

# ---------------------------------------------------------------- bokrok
def make_bush(name, seed):
    random.seed(seed)
    bm = bmesh.new()
    ico(bm, 0, (0.0, 0.0, 0.40), 0.50, (1.0, 1.0, 0.80))
    ico(bm, 0, (0.40, 0.10, 0.30), 0.35, (1.0, 1.0, 0.90))
    ico(bm, 0, (-0.35, -0.10, 0.28), 0.30, (1.0, 1.0, 0.90))
    for v in bm.verts:
        v.co += Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.3, 0.3))) * 0.06
        v.co.z = max(0.0, v.co.z)
    return to_mesh(name, bm, [M_BUSH])

spawn("bush_a", make_bush("bush_a", 31), 3)
spawn("bush_b", make_bush("bush_b", 32), 3)

# ---------------------------------------------------------------- fű csomó
def make_grass(name, mat_, seed):
    random.seed(seed)
    bm = bmesh.new()
    for _ in range(7):
        ang = random.uniform(0, math.tau)
        tilt = random.uniform(0.0, 0.35)
        h = random.uniform(0.35, 0.60)
        rot = Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X')
        base = Vector((random.uniform(-0.06, 0.06), random.uniform(-0.06, 0.06), 0.0))
        pos = base + (rot @ Vector((0, 0, h / 2)))
        cone(bm, 0, pos, 0.035, 0.004, h, 3, rot)
    return to_mesh(name, bm, [mat_])

spawn("grass_green", make_grass("grass_green", M_GRASS, 41), 3)
spawn("grass_dry",   make_grass("grass_dry",   M_DRY,   42), 3)

# ---------------------------------------------------------------- virágok
def make_flower(name, petal_mat):
    bm = bmesh.new()
    cone(bm, 0, (0, 0, 0.175), 0.015, 0.012, 0.35, 4)
    ico(bm, 1, (0, 0, 0.36), 0.085, (1.0, 1.0, 0.35))
    ico(bm, 2, (0, 0, 0.375), 0.03)
    return to_mesh(name, bm, [M_GRASS, petal_mat, M_FCEN])

spawn("flower_yellow", make_flower("flower_yellow", M_YELLOW), 3)
spawn("flower_white",  make_flower("flower_white",  M_WHITE),  3)

# ---------------------------------------------------------------- gombák
def make_mushroom(name, cap_mat):
    bm = bmesh.new()
    cone(bm, 0, (0, 0, 0.06), 0.04, 0.03, 0.12, 6)
    ico(bm, 1, (0, 0, 0.12), 0.09, (1.0, 1.0, 0.60))
    for v in bm.verts:
        v.co.z = max(0.0, v.co.z)
    return to_mesh(name, bm, [M_STEM, cap_mat])

spawn("mushroom_red",   make_mushroom("mushroom_red",   M_RED),   3)
spawn("mushroom_brown", make_mushroom("mushroom_brown", M_BROWN), 3)

# ---------------------------------------------------------------- összegzés + export
objs = list(lib.objects)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
print(f"[Könyvtár] {len(objs)} objektum, összesen {tris} háromszög")
for o in objs:
    print("  ", o.name)

try:
    bpy.ops.export_scene.gltf(filepath=EXPORT_PATH, export_format='GLB',
                              export_extras=True, export_apply=True)
    print("[Könyvtár] GLB exportálva:", EXPORT_PATH)
except Exception as e:
    print("[Könyvtár] Az export nem sikerült, használd a File > Export > glTF 2.0 menüt:", e)
