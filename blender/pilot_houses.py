# -*- coding: utf-8 -*-
# PILOTE BLENDER → PIXEL ART — trois habitations (hut, stonehouse, tenement).
# Lot 5 de docs/PLAN-LUMIERE-RELIEF.md (2026-09-14). Route A : Blender rend
# DIRECTEMENT à la taille du sprite, en aplats (3 tons par matière), sans
# anti-aliasing, fond transparent, SANS ombre portée (l'ombre est le travail du
# moteur depuis l'ombre solaire validée par Raph).
#
# Usage (headless, sans ouvrir Blender) :
#   blender -b -P blender/pilot_houses.py -- --out blender/out
#
# CONVENTIONS DE LA SCÈNE (elles fixent la grille de pixels une fois pour toutes) :
#   · 1 tuile monde = 1 unité Blender ; la caméra ortho (60°, 0, 45°) projette le
#     carré unité en losange 2:1 — exactement ISO_X = 1, ISO_Y = 0,5 du jeu.
#   · DENSITÉ : dans le jeu une habitation 1×1 est blittée ×1,135 à zoom 1 pour un
#     losange de 64 px → en pixels SOURCE le losange fait 64/1,135 = 56,4 px de
#     large, donc 1 unité = 56,4/√2 = 39,9 px. PX_PER_UNIT ci-dessous.
#   · LUMIÈRE : soleil écran HAUT-GAUCHE (la DA). Vecteurs de la caméra :
#     droite = (0,707 ; 0,707 ; 0), haut = (−0,354 ; 0,354 ; 0,866). Faces visibles :
#     −y (à GAUCHE de l'écran) et +x (à DROITE). Le soleil vient de
#     (−0,35 ; −0,6 ; 0,75) normalisé → toit clair, mur gauche moyen, mur droit
#     sombre — la grammaire des sprites actuels (« face droite à l'ombre »).
#   · Pas d'ombre portée ni d'occlusion : `use_shadow = False`, monde noir.
#   · 3 TONS par matière : Diffuse → Shader to RGB → ColorRamp CONSTANT
#     (sombre 0,55 / moyen 0,78 / clair 1,0) × couleur de base → Emission.
#     Le soleil vaut π W/m² pour que la sortie du Diffuse soit exactement cos θ.
#   · Couleurs de base = les teintes DOMINANTES relevées sur les PNG actuels
#     (pngjs, 2026-09-14) : c'est ce qui garde la famille dans la palette.
import bpy, bmesh, math, os, sys
from mathutils import Vector

PX_PER_UNIT = 39.9
SUN_FROM = Vector((-0.35, -0.6, 0.75)).normalized()
TONES = [(0.0, 0.55), (0.2, 0.78), (0.7, 1.0)]     # (seuil cos θ, facteur)

def argv_after():
    a = sys.argv
    return a[a.index('--') + 1:] if '--' in a else []

def argv_out():
    rest = argv_after()
    return rest[rest.index('--out') + 1] if '--out' in rest else 'blender/out'

# --scale N : rend N fois plus grand (même cadrage) — la source haute définition
# de la route B (IA → pixel art), jamais blittée telle quelle dans le jeu.
def argv_scale():
    rest = argv_after()
    return float(rest[rest.index('--scale') + 1]) if '--scale' in rest else 1.0

def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

# ── MATIÈRES ──────────────────────────────────────────────────────────────────
_mats = {}
def mat(name, rgb, tex=None):
    """tex = None (aplat) ou dict(kind='brick'|'stripes', scale, k) : un GRAIN
    procédural multiplié sous la couleur de base, en coordonnées OBJET (il suit
    la géométrie, pas la caméra) — tuiles, pierre, briques, chaume. `k` = clarté
    du joint (0,75 = joint sombre discret) ; `scale` en briques par unité monde
    (39,9 px/unité → scale 12 ≈ une brique de 3 px)."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emis = nt.nodes.new('ShaderNodeEmission')
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    cr = ramp.color_ramp
    # 2 éléments par défaut : on en pose exactement len(TONES)
    while len(cr.elements) < len(TONES):
        cr.elements.new(0.5)
    for el, (pos, k) in zip(cr.elements, TONES):
        el.position = pos
        el.color = (k, k, k, 1.0)
    s2rgb = nt.nodes.new('ShaderNodeShaderToRGB')
    diff = nt.nodes.new('ShaderNodeBsdfDiffuse')
    diff.inputs['Color'].default_value = (1, 1, 1, 1)
    diff.inputs['Roughness'].default_value = 0.0
    base = tuple(srgb_to_linear(v) for v in rgb) + (1.0,)
    mix.inputs[6].default_value = base          # A
    if tex:
        coord = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping')
        sc = float(tex.get('scale', 12))
        mp.inputs['Scale'].default_value = (sc, sc, sc)
        nt.links.new(coord.outputs['Object'], mp.inputs['Vector'])
        k = float(tex.get('k', 0.75))
        if tex.get('kind') == 'stripes':
            wave = nt.nodes.new('ShaderNodeTexWave')
            wave.wave_type = 'BANDS'
            wave.bands_direction = tex.get('dir', 'Z')
            wave.wave_profile = 'SAW'
            wave.inputs['Scale'].default_value = 1.0
            nt.links.new(mp.outputs['Vector'], wave.inputs['Vector'])
            ramp2 = nt.nodes.new('ShaderNodeValToRGB')
            ramp2.color_ramp.interpolation = 'CONSTANT'
            ramp2.color_ramp.elements[0].position = 0.0
            ramp2.color_ramp.elements[0].color = (1, 1, 1, 1)
            ramp2.color_ramp.elements[1].position = 0.7
            ramp2.color_ramp.elements[1].color = (k, k, k, 1)
            nt.links.new(wave.outputs['Fac'], ramp2.inputs['Fac'])
            texout = ramp2.outputs['Color']
        else:
            br = nt.nodes.new('ShaderNodeTexBrick')
            br.inputs['Color1'].default_value = (1, 1, 1, 1)
            br.inputs['Color2'].default_value = (0.9, 0.9, 0.9, 1)
            br.inputs['Mortar'].default_value = (k, k, k, 1)
            br.inputs['Scale'].default_value = 1.0
            br.inputs['Mortar Size'].default_value = float(tex.get('mortar', 0.06))
            br.inputs['Brick Width'].default_value = float(tex.get('bw', 0.5))
            br.inputs['Row Height'].default_value = float(tex.get('rh', 0.25))
            nt.links.new(mp.outputs['Vector'], br.inputs['Vector'])
            texout = br.outputs['Color']
        tmix = nt.nodes.new('ShaderNodeMix')
        tmix.data_type = 'RGBA'
        tmix.blend_type = 'MULTIPLY'
        tmix.inputs['Factor'].default_value = 1.0
        tmix.inputs[6].default_value = base
        nt.links.new(texout, tmix.inputs[7])
        nt.links.new(tmix.outputs[2], mix.inputs[6])
    nt.links.new(diff.outputs['BSDF'], s2rgb.inputs['Shader'])
    nt.links.new(s2rgb.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], mix.inputs[7])   # B
    nt.links.new(mix.outputs[2], emis.inputs['Color'])
    emis.inputs['Strength'].default_value = 1.0
    nt.links.new(emis.outputs['Emission'], out.inputs['Surface'])
    _mats[name] = m
    return m

# ── GÉOMÉTRIE (from_pydata + normales recalculées) ────────────────────────────
_objs = []
def mesh_obj(name, verts, faces, m):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(m)
    bpy.context.scene.collection.objects.link(ob)
    _objs.append(ob)
    return ob

def box(name, cx, cy, z0, sx, sy, z1, m):
    x0, x1, y0, y1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_obj(name, v, f, m)

def gable_x(name, cx, cy, sx, sy, z0, z1, m):
    """Toit à deux pans, faîte le long de X (les pans regardent ±y)."""
    x0, x1, y0, y1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, cy, z1), (x1, cy, z1)]
    f = [(0, 1, 5, 4), (2, 3, 4, 5), (0, 3, 4), (1, 2, 5), (0, 1, 2, 3)]
    return mesh_obj(name, v, f, m)

def gable_y(name, cx, cy, sx, sy, z0, z1, m):
    """Toit à deux pans, faîte le long de Y (les pans regardent ±x)."""
    x0, x1, y0, y1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (cx, y0, z1), (cx, y1, z1)]
    f = [(0, 3, 5, 4), (1, 2, 5, 4), (0, 1, 4), (3, 2, 5), (0, 1, 2, 3)]
    return mesh_obj(name, v, f, m)

def cyl(name, cx, cy, r, z0, z1, m, n=16):
    v = [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z0) for i in range(n)]
    v += [(x, y, z1) for (x, y, _) in v]
    f = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    f += [tuple(range(n)), tuple(range(n, 2 * n))]
    return mesh_obj(name, v, f, m)

def cone(name, cx, cy, r, z0, z1, m, n=16):
    v = [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z0) for i in range(n)]
    v.append((cx, cy, z1))
    f = [(i, (i + 1) % n, n) for i in range(n)] + [tuple(range(n))]
    return mesh_obj(name, v, f, m)

# ── LES TROIS MAISONS ─────────────────────────────────────────────────────────
def build_hut():
    daub = mat('daub', (207, 144, 104))
    thatch = mat('thatch', (223, 224, 138), dict(kind='stripes', scale=14, k=0.78, dir='Z'))
    wood = mat('wood_dark', (74, 47, 34))
    cyl('hut_wall', 0, 0, 0.34, 0, 0.36, daub)
    cone('hut_roof', 0, 0, 0.48, 0.32, 0.92, thatch)
    box('hut_door', 0.0, -0.345, 0.0, 0.16, 0.03, 0.26, wood)      # sur la face −y (gauche écran)

def sphere(name, cx, cy, cz, r, m, n=10, rings=6):
    """Sphère basse déf (buisson)."""
    v = []; f = []
    for i in range(1, rings):
        ph = math.pi * i / rings
        for j in range(n):
            th = 2 * math.pi * j / n
            v.append((cx + r * math.sin(ph) * math.cos(th), cy + r * math.sin(ph) * math.sin(th), cz + r * math.cos(ph)))
    top = len(v); v.append((cx, cy, cz + r))
    bot = len(v); v.append((cx, cy, cz - r))
    for i in range(rings - 2):
        for j in range(n):
            a = i * n + j; b = i * n + (j + 1) % n
            f.append((a, b, b + n, a + n))
    for j in range(n):
        f.append((top, (j + 1) % n, j))
        base = (rings - 2) * n
        f.append((bot, base + j, base + (j + 1) % n))
    return mesh_obj(name, v, f, m)

def beam(name, p0, p1, n, t, d, m):
    """Poutre/dalle inclinée : de p0 à p1, épaisseur t (transverse), saillie d
    le long de la normale n (vers l'extérieur, à partir de la ligne p0-p1)."""
    p0, p1, n = Vector(p0), Vector(p1), Vector(n).normalized()
    u = (p1 - p0).normalized()
    v = n.cross(u).normalized()
    v_ = v * (t / 2); n_ = n * d
    verts = []
    for p in (p0, p1):
        verts += [tuple(p - v_), tuple(p + v_), tuple(p + v_ + n_), tuple(p - v_ + n_)]
    faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_obj(name, verts, faces, m)

def roof_slab(name, y_eave, z_eave, z_ridge, length_x, thick, m):
    """Un pan de toit : de la ligne d'égout (y_eave, z_eave) au faîte (0, z_ridge),
    long de length_x le long de X, épais de thick vers le HAUT (extérieur)."""
    u = Vector((0, -y_eave, z_ridge - z_eave)).normalized()
    n = u.cross(Vector((1, 0, 0)))
    if n.z < 0:
        n = -n
    return beam(name, (0, y_eave, z_eave), (0, 0, z_ridge), n, length_x, thick, m)

def window(name, cx, cy, z0, z1, w, axis, m_frame, m_glass, m_sill, out_sign=-1):
    """Fenêtre à croisillons : cadre, vitrage, meneau + traverse, appui. axis 'y'
    = percée dans un mur regardant ±y (cx varie), 'x' = mur regardant ±x."""
    f = 0.018; g = 0.012
    if axis == 'y':
        box(name + '_f', cx, cy, z0, w, 0.02, z1, m_frame)
        box(name + '_g', cx, cy + out_sign * 0.006, z0 + f, w - 2 * f, 0.02, z1 - f, m_glass)
        box(name + '_m', cx, cy + out_sign * 0.010, z0 + f, g, 0.02, z1 - f, m_frame)
        box(name + '_t', cx, cy + out_sign * 0.010, (z0 + z1) / 2 - g / 2, w - 2 * f, 0.02, (z0 + z1) / 2 + g / 2, m_frame)
        box(name + '_s', cx, cy + out_sign * 0.012, z0 - 0.025, w + 0.04, 0.045, z0, m_sill)
    else:
        box(name + '_f', cx, cy, z0, 0.02, w, z1, m_frame)
        box(name + '_g', cx + out_sign * 0.006, cy, z0 + f, 0.02, w - 2 * f, z1 - f, m_glass)
        box(name + '_m', cx + out_sign * 0.010, cy, z0 + f, 0.02, g, z1 - f, m_frame)
        box(name + '_t', cx + out_sign * 0.010, cy, (z0 + z1) / 2 - g / 2, 0.02, w - 2 * f, (z0 + z1) / 2 + g / 2, m_frame)
        box(name + '_s', cx + out_sign * 0.012, cy, z0 - 0.025, 0.045, w + 0.04, z0, m_sill)

def build_stonehouse():
    """v3 « charpente » : pans de toit séparés (pignon APPARENT à colombages
    côté +x), chevrons sous l'égout, croix de Saint-André, fenêtres à
    croisillons avec appui, lucarne charpentée, cheminée à chapeau, buissons."""
    stone = mat('stone', (124, 130, 140), dict(kind='brick', scale=10, k=0.8, bw=0.6, rh=0.3, mortar=0.05))
    plinth = mat('plinth', (92, 96, 104), dict(kind='brick', scale=8, k=0.78, bw=0.8, rh=0.4, mortar=0.06))
    plaster = mat('plaster', (216, 205, 180))
    slate = mat('slate', (58, 92, 104), dict(kind='brick', scale=16, k=0.72, bw=0.5, rh=0.35, mortar=0.06))
    ridge = mat('ridge', (78, 112, 124))
    timber = mat('timber', (77, 67, 56)); rafter = mat('rafter', (96, 80, 60))
    door = mat('door', (107, 69, 48)); frame = mat('frame', (58, 50, 42))
    glass = mat('glass_warm', (223, 214, 190))
    leaf = mat('leaf', (150, 180, 60)); leaf2 = mat('leaf2', (110, 150, 50))
    W = 0.78; J = 0.03; WU = W + 2 * J                      # rez / étage (encorbellement)
    e = WU / 2 + 0.012                                       # plan des poutres en saillie
    ZR, ZU, ZP = 0.10, 0.38, 0.68                            # soubassement, plancher étage, sablière haute
    # ── MAÇONNERIE ───────────────────────────────────────────────────────────
    box('sh_plinth', 0, 0, 0.0, W + 0.06, W + 0.06, ZR, plinth)
    box('sh_wall', 0, 0, ZR, W, W, ZU, stone)
    box('sh_upper', 0, 0, ZU, WU, WU, ZP, plaster)
    # ── COLOMBAGES ───────────────────────────────────────────────────────────
    box('sh_sill', 0, 0, ZU, WU + 0.03, WU + 0.03, ZU + 0.04, timber)      # sablière basse
    box('sh_plate', 0, 0, ZP - 0.03, WU + 0.03, WU + 0.03, ZP, timber)     # sablière haute
    for x in (-0.32, -0.12, 0.12, 0.32):
        box('sh_post_y%d' % int(x * 100), x, -e, ZU + 0.04, 0.035, 0.025, ZP - 0.03, timber)
    for y in (-0.32, -0.12, 0.12, 0.32):
        box('sh_post_x%d' % int(y * 100), e, y, ZU + 0.04, 0.025, 0.035, ZP - 0.03, timber)
    # croix de Saint-André dans la travée centrale de chaque face
    beam('sh_x1', (-0.12, -e, ZU + 0.04), (0.12, -e, ZP - 0.03), (0, -1, 0), 0.028, 0.02, timber)
    beam('sh_x2', (0.12, -e, ZU + 0.04), (-0.12, -e, ZP - 0.03), (0, -1, 0), 0.028, 0.02, timber)
    beam('sh_x3', (e, -0.12, ZU + 0.04), (e, 0.12, ZP - 0.03), (1, 0, 0), 0.028, 0.02, timber)
    beam('sh_x4', (e, 0.12, ZU + 0.04), (e, -0.12, ZP - 0.03), (1, 0, 0), 0.028, 0.02, timber)
    # ── TOIT : deux pans, pignon apparent, faîtage, chevrons ─────────────────
    # Débord réduit (0,22 → 0,16 / 0,26 → 0,18) : la v3 sortait à 59 px de large
    # pour 48 au sprite actuel, et le jeu met à l'échelle sur la LARGEUR.
    YE, ZE, ZRG, LX = -(W + 0.16) / 2, ZP, 1.10, W + 0.18
    roof_slab('sh_roof_s', YE, ZE, ZRG, LX, 0.05, slate)
    roof_slab('sh_roof_n', -YE, ZE, ZRG, LX, 0.05, slate)
    box('sh_ridge', 0, 0, ZRG + 0.03, LX + 0.02, 0.06, ZRG + 0.06, ridge)
    gable_x('sh_gable', 0, 0, WU, WU, ZP, 1.08, plaster)                    # pignons enduits
    gx = WU / 2 + 0.012                                                   # charpente du pignon +x
    box('sh_g_tie', gx, 0, ZP, 0.025, WU, ZP + 0.035, timber)
    box('sh_g_king', gx, 0, ZP + 0.035, 0.025, 0.035, 1.055, timber)
    beam('sh_g_r1', (gx, -WU / 2 + 0.01, ZP + 0.02), (gx, 0, 1.07), (1, 0, 0), 0.035, 0.025, rafter)
    beam('sh_g_r2', (gx, WU / 2 - 0.01, ZP + 0.02), (gx, 0, 1.07), (1, 0, 0), 0.035, 0.025, rafter)
    beam('sh_g_s1', (gx, -0.22, ZP + 0.035), (gx, -0.02, 0.92), (1, 0, 0), 0.025, 0.02, timber)
    beam('sh_g_s2', (gx, 0.22, ZP + 0.035), (gx, 0.02, 0.92), (1, 0, 0), 0.025, 0.02, timber)
    window('sh_gw', gx + 0.004, 0.0, 0.76, 0.90, 0.13, 'x', frame, glass, timber, +1)
    for x in (-0.36, -0.18, 0.0, 0.18, 0.36):                            # chevrons sous l'égout sud
        box('sh_rafter%d' % int(x * 100), x, YE + 0.05, ZE - 0.045, 0.04, 0.10, ZE, rafter)
    for y in (-0.36, -0.18, 0.0, 0.18, 0.36):                            # abouts de pannes côté pignon +x
        zt = ZE + 0.02 + 0.84 * (0.5 - abs(y))
        box('sh_purlin%d' % int(y * 100), LX / 2 - 0.02, y, zt - 0.06, 0.06, 0.04, zt - 0.01, rafter)
    # ── LUCARNE charpentée sur le pan sud ────────────────────────────────────
    DX, DY = -0.14, -0.30
    box('sh_dormer', DX, DY, ZP, 0.22, 0.22, 0.90, plaster)
    box('sh_d_post1', DX - 0.10, DY - 0.115, ZP + 0.02, 0.025, 0.02, 0.90, timber)
    box('sh_d_post2', DX + 0.10, DY - 0.115, ZP + 0.02, 0.025, 0.02, 0.90, timber)
    window('sh_dw', DX, DY - 0.115, 0.76, 0.87, 0.12, 'y', frame, glass, timber, -1)
    # Toit de lucarne : faîte le long de Y (perpendiculaire à l'égout), deux
    # pans regardant ±x — la v3.0 les faisait regarder ±y, d'où une lucarne
    # écrasée en boîte.
    beam('sh_d_roof1', (DX - 0.15, DY - 0.13, 0.87), (DX, DY - 0.13, 1.00), (-0.7, 0, 0.7), 0.30, 0.04, slate)
    beam('sh_d_roof2', (DX + 0.15, DY - 0.13, 0.87), (DX, DY - 0.13, 1.00), (0.7, 0, 0.7), 0.30, 0.04, slate)
    box('sh_d_ridge', DX, DY - 0.13, 1.00, 0.04, 0.30, 1.03, ridge)
    # ── CHEMINÉE ─────────────────────────────────────────────────────────────
    box('sh_chimney', 0.24, 0.12, 0.8, 0.13, 0.13, 1.22, stone)
    box('sh_chimney_cap', 0.24, 0.12, 1.22, 0.17, 0.17, 1.26, plinth)
    box('sh_chimney_pot', 0.24, 0.12, 1.26, 0.06, 0.06, 1.30, plinth)
    # ── PORTE, MARCHE, FENÊTRES ──────────────────────────────────────────────
    yf = -W / 2 - 0.018
    box('sh_door_frame', -0.04, yf, ZR, 0.20, 0.03, 0.40, frame)
    box('sh_door', -0.04, yf - 0.006, ZR, 0.15, 0.03, 0.36, door)
    box('sh_door_bar', -0.04, yf - 0.012, 0.28, 0.15, 0.02, 0.30, frame)
    box('sh_step', -0.04, yf - 0.02, 0.0, 0.22, 0.06, ZR, plinth)
    ye = -e - 0.012
    window('sh_w1', -0.22, ye, 0.47, 0.62, 0.15, 'y', frame, glass, timber, -1)
    window('sh_w2', 0.22, ye, 0.47, 0.62, 0.15, 'y', frame, glass, timber, -1)
    window('sh_w3', W / 2 + 0.018, 0.05, 0.18, 0.32, 0.14, 'x', frame, glass, plinth, +1)
    window('sh_w4', e + 0.012, 0.22, 0.47, 0.62, 0.15, 'x', frame, glass, timber, +1)
    window('sh_w5', e + 0.012, -0.22, 0.47, 0.62, 0.15, 'x', frame, glass, timber, +1)
    # ── BUISSONS ─────────────────────────────────────────────────────────────
    sphere('sh_bush', -0.30, -0.52, 0.10, 0.13, leaf)
    sphere('sh_bush2', -0.43, -0.44, 0.08, 0.10, leaf2)

def build_tenement():
    brick = mat('brick', (176, 106, 72), dict(kind='brick', scale=14, k=0.72, bw=0.5, rh=0.25, mortar=0.05))
    base = mat('brick_dark', (74, 47, 34), dict(kind='brick', scale=10, k=0.8, bw=0.7, rh=0.35, mortar=0.05))
    roof = mat('roof_flat', (58, 53, 52)); trim = mat('trim', (180, 168, 144))
    glass = mat('glass_dark', (33, 26, 29)); door = mat('door', (107, 69, 48))
    W = 0.92
    box('tn_base', 0, 0, 0.0, W, W, 0.5, base)
    box('tn_body', 0, 0, 0.5, W, W, 2.0, brick)
    box('tn_cornice', 0, 0, 2.0, W + 0.06, W + 0.06, 2.08, trim)
    box('tn_roof', 0, 0, 2.08, W - 0.04, W - 0.04, 2.1, roof)
    box('tn_door', -0.02, -W / 2 - 0.015, 0.0, 0.18, 0.03, 0.34, door)
    for fl in range(4):
        z0 = 0.62 + fl * 0.5 if fl else 0.12
        z1 = z0 + 0.24
        for x in (-0.28, 0.22):
            if fl == 0 and x == -0.28:
                continue
            box('tn_wy%d%d' % (fl, int(x * 100)), x, -W / 2 - 0.015, z0, 0.14, 0.03, z1, glass)
        for y in (-0.26, 0.2):
            box('tn_wx%d%d' % (fl, int(y * 100)), W / 2 + 0.015, y, z0, 0.03, 0.14, z1, glass)

HOUSES = {
    'hut': (build_hut, 64, 64),
    'stonehouse': (build_stonehouse, 64, 96),
    'tenement': (build_tenement, 80, 128),
}

# ── SCÈNE, CAMÉRA, SOLEIL, RENDU ──────────────────────────────────────────────
def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    _objs.clear()

def setup_render(scene, w, h):
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    r = scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
    r.film_transparent = True
    r.filter_size = 0.0                    # aucun anti-aliasing du filtre
    # ⚠ Blender TRAME la sortie 8 bits par défaut (dither_intensity 1) : un aplat
    # rendu sortait à 48 teintes et la quantification en faisait du bruit.
    r.dither_intensity = 0.0
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '8'
    r.image_settings.compression = 15
    try:
        scene.eevee.taa_render_samples = 1
    except Exception:
        pass
    for attr in ('use_gtao', 'use_bloom', 'use_soft_shadows'):
        try:
            setattr(scene.eevee, attr, False)
        except Exception:
            pass
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    # Monde noir : aucune lumière ambiante, la rampe ne lit que le soleil.
    w_ = scene.world or bpy.data.worlds.new('World')
    scene.world = w_
    w_.use_nodes = True
    bg = w_.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0, 0, 0, 1)
        bg.inputs['Strength'].default_value = 0.0

def setup_camera(scene, w, h, target):
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(w, h) / PX_PER_UNIT
    cam_data.clip_start, cam_data.clip_end = 0.01, 100
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(60), 0, math.radians(45))
    view = Vector((-0.6124, 0.6124, -0.5))          # direction de visée pour (60°, 0, 45°)
    cam.location = target - view * 20
    scene.camera = cam

def setup_sun(scene):
    ld = bpy.data.lights.new('sun', 'SUN')
    ld.energy = math.pi                               # Diffuse → exactement cos θ
    ld.angle = 0.0
    try:
        ld.use_shadow = False
    except Exception:
        pass
    sun = bpy.data.objects.new('sun', ld)
    scene.collection.objects.link(sun)
    sun.rotation_euler = SUN_FROM.to_track_quat('Z', 'Y').to_euler()
    sun.location = SUN_FROM * 10

def render_house(name, out_dir, scale=1.0):
    build, w, h = HOUSES[name]
    w, h = int(round(w * scale)), int(round(h * scale))
    global PX_PER_UNIT
    PX_PER_UNIT = 39.9 * scale
    clear_scene()
    scene = bpy.context.scene
    setup_render(scene, w, h)
    build()
    # Cible = centre de la boîte englobante des objets, pour cadrer sans calcul
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for ob in _objs:
        for v in ob.data.vertices:
            p = ob.matrix_world @ v.co
            lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
            hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
    target = (lo + hi) / 2
    setup_camera(scene, w, h, target)
    setup_sun(scene)
    os.makedirs(out_dir, exist_ok=True)
    scene.render.filepath = os.path.join(out_dir, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDU', name, w, h, scene.render.filepath)
    # PASSE D'IDENTITÉ : chaque matière en aplat unique (R = index·8), même
    # géométrie, même caméra, sans lumière — pour le contour/rehaut en post.
    ids = {}
    for i, (mname, m) in enumerate(_mats.items()):
        nt = m.node_tree
        outn = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        em = nt.nodes.new('ShaderNodeEmission')
        g = srgb_to_linear((i + 1) * 8)
        em.inputs['Color'].default_value = (g, g, g, 1)
        em.inputs['Strength'].default_value = 1.0
        nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
        ids[mname] = (i + 1) * 8
    scene.render.filepath = os.path.join(out_dir, name + '.ids.png')
    bpy.ops.render.render(write_still=True)
    import json
    with open(os.path.join(out_dir, name + '.ids.json'), 'w') as fh:
        json.dump(ids, fh)
    _mats.clear()

if __name__ == '__main__':
    out = argv_out()
    sc = argv_scale()
    rest = argv_after()
    only = rest[rest.index('--only') + 1] if '--only' in rest else None
    for n in HOUSES:
        if only and n != only:
            continue
        render_house(n, out, sc)
    print('PILOTE OK', bpy.app.version_string)
