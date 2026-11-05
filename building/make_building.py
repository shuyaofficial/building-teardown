"""商業ビルの外観を Building Tools で組み、building/building.glb に書き出す。

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python building/make_building.py

10階建て・階高 3.8 m（elevator/refs.md と同じ）。正面は Blender の -Y（glTF では +Z）。
床・壁・窓・扉・屋上の縁は Building Tools（building/vendor/building_tools, v1.0.13）の演算子で作る。
屋上の室外機と、札の位置を示す anchor_* の空オブジェクトだけは Blender の標準機能で置く。
乱数は使わない（間取りは RECTANGULAR、seed も 1 に固定）。何度実行しても同じ GLB が出る。
"""

import hashlib
import io
import os
import sys
import urllib.request
import zipfile

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(HERE, "vendor")

# Building Tools（ranjian0/building_tools, MIT）。リポジトリには入れず、無ければリリースの zip を取ってくる。
# 中身は手を入れずにそのまま使う（Blender 5.2.0 で、ここで使う演算子はすべて修正なしで動いた）。
BT_RELEASE = "v1.0.13"
BT_URL = "https://github.com/ranjian0/building_tools/releases/download/v1.0.13/building_tools_v1.0.13.zip"
BT_SHA256 = "8e805d629f87a361d0743967610322655391e3c6e86ec58dd75e26d7a4972c48"


def fetch_building_tools():
    if os.path.isfile(os.path.join(VENDOR, "building_tools", "__init__.py")):
        return
    print(f"Building Tools {BT_RELEASE} を取得: {BT_URL}")
    with urllib.request.urlopen(BT_URL, timeout=60) as r:
        data = r.read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != BT_SHA256:
        raise RuntimeError(f"zip の SHA-256 が違う: {digest}")
    os.makedirs(VENDOR, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            if not name.startswith("building_tools/") or ".." in name.split("/"):
                raise RuntimeError(f"zip に想定外のパス: {name}")
        z.extractall(VENDOR)


fetch_building_tools()
sys.dont_write_bytecode = True  # vendor/ に __pycache__ を残さない
sys.path.insert(0, VENDOR)
import building_tools  # noqa: E402

OUT = os.path.join(HERE, "building.glb")

# ---------------------------------------------------------------- 寸法（m）
FLOORS = 10
STOREY = 3.8  # 階高（elevator/refs.md）
SLAB = 0.3  # 各階の床スラブ。壁の高さ = STOREY - SLAB
WIDTH = 18.0  # 正面の幅（X）
DEPTH = 14.0  # 奥行（Y）
FRONT_Y = -DEPTH / 2
SIDE_X = WIDTH / 2
CORE = (-5.6, 3.9)  # 昇降路の中心（裏の左寄り）。機械室はこの真上
PH = (3.6, 3.4, 3.0)  # 機械室の幅・奥行・高さ

# 1階正面の割り付け（X の区切り）。左から ガラス / 自動ドア / ガラス / シャッター
FRONT_CUTS = (-3.0, 1.0, 3.6)
# 右側面（+X）1階の区切り（Y）。奥側が駐車場の入口
SIDE_CUTS = (0.6,)

# ---------------------------------------------------------------- 色（building-kit/ui.js の紙色に合わせる）
PALETTE = {
    "wall": ("#d6ccbc", 0.85, 0.0),
    "band": ("#b4a794", 0.8, 0.0),
    "frame": ("#6c645a", 0.5, 0.3),
    "glass": ("#7f949c", 0.15, 0.2),
    "roof": ("#c4baa9", 0.9, 0.0),
    "shutter": ("#a7a196", 0.45, 0.5),
    "dark": ("#3d3833", 0.9, 0.0),
    "unit": ("#ece7dd", 0.6, 0.0),
}

# Building Tools の材料グループ → 色。part は割り付けた面の用途（新しい面は元の面の値を受け継ぐ）
PART_NONE, PART_GLASS, PART_DOOR, PART_SHUTTER, PART_PARKING = 0, 1, 2, 3, 4
GROUP_COLOR = {
    "walls": "wall",
    "slabs": "band",
    "columns": "band",
    "roof": "roof",
    "roof_hangs": "band",
    "frame": "frame",
    "window": "glass",
    "window_panes": "glass",
    "window_bars": "frame",
    "door": "glass",
    "door_panes": "glass",
    "door_panels": "frame",
    "door_louvers": "shutter",
}


def hex_rgba(h):
    h = h.lstrip("#")
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def make_materials():
    mats = {}
    for name, (col, rough, metal) in PALETTE.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = hex_rgba(col)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        mats[name] = m
    return mats


# ---------------------------------------------------------------- 編集モードの補助
def edit(obj):
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    return bmesh.from_edit_mesh(obj.data)


def part_layer(bm):
    layer = bm.faces.layers.int.get("part")
    return layer if layer is not None else bm.faces.layers.int.new("part")


def select_faces(obj, pred):
    """pred(face, part) に合う面だけを選ぶ。選んだ数を返す。
    面選択モードにしておく。頂点モードのままだと、隣り合う2枚を選んだときに間の面まで選ばれる。"""
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    bm = bmesh.from_edit_mesh(obj.data)
    bm.select_mode = {"FACE"}
    layer = part_layer(bm)
    for f in bm.faces:
        f.select_set(False)
    hits = [f for f in bm.faces if pred(f, f[layer])]
    for f in hits:
        f.select_set(True)
    bm.select_flush_mode()
    bmesh.update_edit_mesh(obj.data)
    return len(hits)


def height(f):
    zs = [v.co.z for v in f.verts]
    return max(zs) - min(zs)


def zmid(f):
    return f.calc_center_median().z


def is_wall(f, storey):
    """storey 階（1始まり）の壁の面か。スラブの小口は高さが足りないので外れる。"""
    return height(f) > STOREY - SLAB - 0.05 and abs(zmid(f) - (STOREY * (storey - 1) + SLAB + (STOREY - SLAB) / 2)) < 0.1


def facing(f, axis, sign):
    return f.normal[axis] * sign > 0.9


def run(op, **props):
    r = op(props=props)
    if r != {"FINISHED"}:
        raise RuntimeError(f"{op.idname()} returned {r}")


def cut_face(obj, pred, axis, cuts, parts):
    """pred で選んだ1枚の壁を、axis 方向の cuts で縦に割り、左から parts の用途を付ける。"""
    bm = bmesh.from_edit_mesh(obj.data)
    layer = part_layer(bm)
    for c in cuts:
        face = next(f for f in bm.faces if pred(f, f[layer]) and min(v.co[axis] for v in f.verts) < c < max(v.co[axis] for v in f.verts))
        geom = [face, *face.edges, *face.verts]
        co = [0.0, 0.0, 0.0]
        co[axis] = c
        no = [0.0, 0.0, 0.0]
        no[axis] = 1.0
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
        bm.faces.ensure_lookup_table()
    # 区切りの順に用途を付ける
    edges = [-1e9, *cuts, 1e9]
    for f in bm.faces:
        if not pred(f, f[layer]):
            continue
        mid = f.calc_center_median()[axis]
        for i in range(len(parts)):
            if edges[i] < mid < edges[i + 1]:
                f[layer] = parts[i]
    bmesh.update_edit_mesh(obj.data)


# ---------------------------------------------------------------- 建物本体
def build_tower():
    run(bpy.ops.btools.add_floorplan, type="RECTANGULAR", seed=1, width=WIDTH, length=DEPTH)
    obj = bpy.context.view_layer.objects.active or bpy.data.objects[-1]
    obj.name = "tower"
    edit(obj)
    run(bpy.ops.btools.add_floors, floor_count=FLOORS, floor_height=STOREY - SLAB, add_slab=True, slab_thickness=SLAB, slab_outset=0.12)

    # 1階正面: ガラス / 自動ドア / ガラス / シャッター
    front1 = lambda f, p: facing(f, 1, -1) and is_wall(f, 1)  # noqa: E731
    cut_face(obj, front1, 0, FRONT_CUTS, (PART_GLASS, PART_DOOR, PART_GLASS, PART_SHUTTER))
    # 右側面1階: 手前は壁、奥が駐車場の入口
    side1 = lambda f, p: facing(f, 0, 1) and is_wall(f, 1)  # noqa: E731
    cut_face(obj, side1, 1, SIDE_CUTS, (PART_NONE, PART_PARKING))

    # 店舗のガラス面（縦の方立で3枚に割る。pane_count は分割の本数で、_y が縦の線）
    select_faces(obj, lambda f, p: p == PART_GLASS and front1(f, p))
    run(
        bpy.ops.btools.add_window,
        size_offset={"size": (5.4, 2.9), "offset": (0.0, 0.1)},
        array={"count": 1},
        frame_thickness=0.12,
        frame_depth=0.08,
        window_depth=0.1,
        fill_type="GLASS_PANES",
        glass_fill={"pane_count_x": 0, "pane_count_y": 2, "pane_margin": 0.05, "pane_depth": 0.02},
    )
    # 両引きの自動ドア: ガラスを縦に2枚に割って左右の戸に見せる（double_door は枠が付かず1枚に見えたので使わない）
    select_faces(obj, lambda f, p: p == PART_DOOR and front1(f, p))
    run(
        bpy.ops.btools.add_door,
        size_offset={"size": (2.6, 2.5), "offset": (0.0, 0.0)},
        array={"count": 1},
        frame_thickness=0.12,
        frame_depth=0.1,
        door_depth=0.12,
        double_door=False,
        fill_type="GLASS_PANES",
        glass_fill={"pane_count_x": 0, "pane_count_y": 1, "pane_margin": 0.07, "pane_depth": 0.02},
    )
    # 店舗のシャッター（横桟の並んだ巻き上げシャッター）
    select_faces(obj, lambda f, p: p == PART_SHUTTER and front1(f, p))
    run(
        bpy.ops.btools.add_door,
        size_offset={"size": (4.2, 2.9), "offset": (0.0, 0.0)},
        array={"count": 1},
        frame_thickness=0.14,
        frame_depth=0.12,
        door_depth=0.08,
        double_door=False,
        fill_type="LOUVER",
        louver_fill={"louver_count": 12, "louver_margin": 0.04, "louver_depth": 0.03, "louver_border": 0.0},
    )
    # 機械式駐車場の入口（奥の暗い開口）
    select_faces(obj, lambda f, p: p == PART_PARKING and side1(f, p))
    run(
        bpy.ops.btools.add_door,
        size_offset={"size": (3.2, 2.6), "offset": (0.0, 0.0)},
        array={"count": 1},
        frame_thickness=0.2,
        frame_depth=0.15,
        door_depth=0.9,
        double_door=False,
        fill_type="NONE",
    )

    # 2〜10階の窓（正面と裏は5連、側面は4連）
    for axis, sign, count in ((1, -1, 5), (1, 1, 5), (0, 1, 4), (0, -1, 4)):
        select_faces(obj, lambda f, p, a=axis, s=sign: facing(f, a, s) and any(is_wall(f, k) for k in range(2, FLOORS + 1)))
        run(
            bpy.ops.btools.add_window,
            size_offset={"size": (2.3, 1.9), "offset": (0.0, 0.15)},
            array={"count": count},
            frame_thickness=0.1,
            frame_depth=0.06,
            window_depth=0.08,
            fill_type="NONE",
        )

    # 屋上: 平らな屋根に縁（パラペット）を立てる
    top = STOREY * FLOORS
    select_faces(obj, lambda f, p: f.normal.z > 0.9 and abs(zmid(f) - top) < 1e-3)
    run(bpy.ops.btools.add_roof, type="FLAT", thickness=0.15, outset=0.12, add_border=True, border=0.25)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def build_machine_room():
    """屋上の機械室（エレベーターの巻上機の部屋）。昇降路の真上に置く。"""
    bpy.ops.object.mode_set(mode="OBJECT")
    run(bpy.ops.btools.add_floorplan, type="RECTANGULAR", seed=1, width=PH[0], length=PH[1])
    obj = bpy.context.view_layer.objects.active or bpy.data.objects[-1]
    obj.name = "machine_room"
    edit(obj)
    run(bpy.ops.btools.add_floors, floor_count=1, floor_height=PH[2], add_slab=False)
    # 換気のガラリ（室外機のある +X の面）と点検扉（正面側の -Y の面）
    select_faces(obj, lambda f, p: facing(f, 0, 1) and height(f) > 1)
    run(
        bpy.ops.btools.add_window,
        size_offset={"size": (1.4, 0.8), "offset": (0.0, 0.6)},
        array={"count": 1},
        frame_thickness=0.06,
        frame_depth=0.04,
        window_depth=0.04,
        fill_type="LOUVER",
        louver_fill={"louver_count": 5, "louver_margin": 0.04, "louver_depth": 0.03, "louver_border": 0.0},
    )
    select_faces(obj, lambda f, p: facing(f, 1, -1) and height(f) > 1)
    run(
        bpy.ops.btools.add_door,
        size_offset={"size": (0.9, 2.1), "offset": (0.0, 0.0)},
        array={"count": 1},
        frame_thickness=0.06,
        frame_depth=0.05,
        door_depth=0.04,
        fill_type="PANELS",
        panel_fill={"panel_count_x": 1, "panel_count_y": 2, "panel_border_size": 0.08, "panel_margin": 0.06, "panel_depth": 0.02},
    )
    select_faces(obj, lambda f, p: f.normal.z > 0.9 and zmid(f) > PH[2] - 1e-3)
    run(bpy.ops.btools.add_roof, type="FLAT", thickness=0.12, outset=0.1, add_border=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.location = (CORE[0], CORE[1], STOREY * FLOORS)
    return obj


def build_ac_units(mats):
    """空調の室外機3台（Blender の標準の立方体と円柱）。屋上の手前右に並べる。"""
    parts = []
    for i in range(3):
        x = 2.4 + i * 1.7
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 1.6, STOREY * FLOORS + 0.15 + 0.85))
        body = bpy.context.active_object
        body.scale = (1.3, 0.8, 1.7)
        body.data.materials.append(mats["unit"])
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.3, depth=0.08, location=(x, 1.6, STOREY * FLOORS + 0.15 + 1.74))
        fan = bpy.context.active_object
        fan.data.materials.append(mats["dark"])
        parts += [body, fan]
    # 台（架台）
    bpy.ops.mesh.primitive_cube_add(size=1, location=(4.1, 1.6, STOREY * FLOORS + 0.075))
    base = bpy.context.active_object
    base.scale = (5.4, 1.2, 0.15)
    base.data.materials.append(mats["band"])
    parts.append(base)
    for o in parts:
        o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return parts


def assign_materials(obj, mats):
    """Building Tools の材料グループと part から、統合した8色のどれかを面ごとに当てる。"""
    names = {m.index: m.name for m in obj.bt_materials}
    order = list(PALETTE)
    obj.data.materials.clear()
    for n in order:
        obj.data.materials.append(mats[n])
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    grp = bm.faces.layers.int.get(".bt_material_group_index")
    part = bm.faces.layers.int.get("part")
    for f in bm.faces:
        g = names.get(f[grp], "walls") if grp else "walls"
        p = f[part] if part else PART_NONE
        col = GROUP_COLOR.get(g, "wall")
        if p == PART_SHUTTER and g in ("door", "door_louvers"):
            col = "shutter"
        if p == PART_PARKING and g == "door":
            col = "dark"
        f.material_index = order.index(col)
    bm.to_mesh(obj.data)
    bm.free()


def canonical_mesh(obj):
    """面の並びと各面の始点を座標で決め直したメッシュに差し替える。

    Building Tools は内部で BMFace の set を回すので、面の並びが実行ごとに変わる（形は同じ）。
    そのままだと GLB の三角形の順が毎回変わるので、座標と色で並べ直して同じ GLB が出るようにする。
    """
    me = obj.data
    key = lambda co: (round(co.x, 4), round(co.y, 4), round(co.z, 4))  # noqa: E731
    polys = []
    for p in me.polygons:
        loop = [key(me.vertices[i].co) for i in p.vertices]
        start = loop.index(min(loop))
        loop = loop[start:] + loop[:start]
        polys.append((p.material_index, tuple(loop)))
    polys.sort()
    index = {}
    faces = []
    for _, loop in polys:
        faces.append([index.setdefault(co, len(index)) for co in loop])
    new = bpy.data.meshes.new(me.name)
    new.from_pydata(list(index), [], faces)
    for m in me.materials:
        new.materials.append(m)
    for p, (mat, _) in zip(new.polygons, polys):
        p.material_index = mat
        p.use_smooth = False
    new.validate()
    obj.data = new
    bpy.data.meshes.remove(me)


def add_anchor(name, co):
    """札を立てる位置。glTF には名前付きの空ノードとして出る。"""
    e = bpy.data.objects.new(name, None)
    e.location = co
    bpy.context.scene.collection.objects.link(e)
    return e


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    building_tools.register()
    mats = make_materials()

    tower = build_tower()
    room = build_machine_room()
    assign_materials(tower, mats)
    assign_materials(room, mats)
    units = build_ac_units(mats)

    # 1つのメッシュにまとめ、平らな陰影にして書き出す
    bpy.ops.object.select_all(action="DESELECT")
    for o in (tower, room, *units):
        o.select_set(True)
    bpy.context.view_layer.objects.active = tower
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.dissolve_degenerate(threshold=0.0005)
    bpy.ops.object.mode_set(mode="OBJECT")
    tower.name = "building"
    # 並びを座標で決め直す。作業用の属性（part・材料グループ）と UV もここで落ちる
    canonical_mesh(tower)

    top = STOREY * FLOORS
    split = (FRONT_CUTS, SIDE_CUTS)
    add_anchor("anchor_elevator", (CORE[0], CORE[1], top + PH[2] + 0.3))
    add_anchor("anchor_autodoor", ((split[0][0] + split[0][1]) / 2, FRONT_Y - 0.2, 1.6))  # 戸の中ほど
    add_anchor("anchor_shutter", ((split[0][2] + SIDE_X) / 2, FRONT_Y - 0.2, 1.8))  # シャッターの中ほど
    add_anchor("anchor_parking", (SIDE_X + 0.2, (split[1][0] + DEPTH / 2) / 2, 1.6))  # 入口の中ほど
    add_anchor("anchor_aircon", (4.1, 1.6, top + 2.0))

    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_texcoords=False,
        export_normals=False,  # 法線はページ側で面ごとに計算する（平らな陰影なので同じ見た目で GLB が半分以下になる）
        export_materials="EXPORT",
        export_apply=True,
        export_yup=True,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_morph=False,
        export_skins=False,
    )
    faces = len(tower.data.polygons)
    tris = sum(len(p.vertices) - 2 for p in tower.data.polygons)
    print(f"WROTE {OUT} bytes={os.path.getsize(OUT)} faces={faces} tris={tris} verts={len(tower.data.vertices)}")


main()
