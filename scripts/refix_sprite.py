#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""refix_sprite.py — re-grille un sprite du jeu et le remet à sa dimension d'origine EXACTE.

Pourquoi : certains sprites PixelLab sont livrés sur une grille « molle » (pixels
logiques bavés, désalignés, ou upscalés de travers). pixel-art-fixer (Retro
Diffusion, MIT) retrouve la vraie grille (cols × rows), reconstruit le 1x propre,
puis on remonte à W0 × H0 en NEAREST pour que le sprite rentre dans son slot
isoKit (tuile diamant, ancre bottom-center, depth sort) sans bouger d'un pixel.

Garde-fous : backup horodaté vérifié (sha256) avant toute écriture, sortie dans
_sprite_out/ par défaut (JAMAIS en place sans --in-place), rescale NEAREST
uniquement, dimension finale contrôlée au pixel près, dérive d'ancrage (bbox
opaque) mesurée. Un sprite à la fois : à juger dans le jeu réel avant de
généraliser à un set complet.

Setup (une fois) :
    git clone --depth 1 https://github.com/Retro-Diffusion/pixel-art-fixer scripts/pixelfix/pixel-art-fixer
    python -m venv scripts/pixelfix/.venv
    scripts/pixelfix/.venv/Scripts/python -m pip install -r scripts/pixelfix/pixel-art-fixer/python/requirements.txt

Usage :
    python scripts/refix_sprite.py path/to/sprite.png                # test → _sprite_out/ (+ rapport JSON)
    python scripts/refix_sprite.py path/to/sprite.png --oklab        # + remap palette maître (node scripts/remapPalette.mjs --declutter)
    python scripts/refix_sprite.py path/to/sprite.png --in-place     # écrase la source APRÈS backup vérifié
    python scripts/refix_sprite.py path/to/sprite.png --dry-run      # rapport seul, aucune écriture persistante
    ... --oklab-args "--epoch marbre --max 18"                       # options passées telles quelles à remapPalette.mjs
    ... --no-declutter                                               # --oklab sans la passe declutter
    ... --force-step 4                                               # court-circuite la détection (échelle connue)

Le script se relance tout seul dans scripts/pixelfix/.venv si le Python courant
n'a pas les dépendances (numpy/scipy/cv2/Pillow).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent            # scripts/
ROOT = HERE.parent                                # racine du repo
VENV_PY = HERE / "pixelfix" / ".venv" / "Scripts" / "python.exe"
VENDOR = HERE / "pixelfix" / "pixel-art-fixer" / "python"
BACKUP_DIR = ROOT / "_sprite_backups"
OUT_DIR = ROOT / "_sprite_out"
REMAP = HERE / "remapPalette.mjs"


def _ensure_deps() -> None:
    """Relance dans le venv dédié si les deps manquent dans le Python courant."""
    try:
        import numpy  # noqa: F401
        return
    except ImportError:
        pass
    if VENV_PY.exists() and Path(sys.executable).resolve() != VENV_PY.resolve():
        raise SystemExit(subprocess.run([str(VENV_PY), str(Path(__file__).resolve()), *sys.argv[1:]]).returncode)
    sys.exit("deps manquantes (numpy...) : cree le venv, cf. en-tete du script "
             "(scripts/pixelfix/.venv)")


_ensure_deps()

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

if not (VENDOR / "pixelfixer" / "__init__.py").exists():
    sys.exit("pixel-art-fixer introuvable : git clone --depth 1 "
             "https://github.com/Retro-Diffusion/pixel-art-fixer scripts/pixelfix/pixel-art-fixer")
sys.path.insert(0, str(VENDOR))
from pixelfixer.api import InputError, process  # noqa: E402


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def do_backup(src: Path, original_bytes: bytes) -> Path:
    """Copie horodatée dans _sprite_backups/, relue et vérifiée par hash."""
    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dst = BACKUP_DIR / f"{src.stem}.{stamp}.png"
    i = 1
    while dst.exists():
        dst = BACKUP_DIR / f"{src.stem}.{stamp}-{i}.png"
        i += 1
    dst.write_bytes(original_bytes)
    if sha256(dst.read_bytes()) != sha256(original_bytes):
        try:
            dst.unlink()
        finally:
            sys.exit(f"backup NON verifie ({dst}) : abandon, rien n'a ete ecrit ailleurs")
    return dst


def run_oklab(native: Image.Image, stem: str, declutter: bool, extra: str,
              warnings: list[str]) -> tuple[Image.Image, str]:
    """Chaîne scripts/remapPalette.mjs (verrou palette maître OKLab) sur la
    native 1x, AVANT le rescale. Le fichier temporaire garde le stem du sprite :
    remapPalette en déduit l'époque (spriteEpochTags). Introuvable ou en échec :
    on continue sans, en le signalant."""
    if not REMAP.exists():
        warnings.append("module OKLab introuvable (scripts/remapPalette.mjs absent) : etape sautee")
        return native, "introuvable"
    node = shutil.which("node")
    if not node:
        warnings.append("node introuvable dans le PATH : etape OKLab sautee")
        return native, "introuvable"
    with tempfile.TemporaryDirectory(prefix="refix-oklab-") as td:
        tmp = Path(td) / f"{stem}.png"
        native.save(tmp)
        cmd = [node, str(REMAP), str(tmp), "--inplace"]
        if declutter:
            cmd.append("--declutter")
        cmd += shlex.split(extra or "")
        p = subprocess.run(cmd, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", cwd=str(ROOT))
        for line in (p.stdout or "").strip().splitlines():
            print(f"    oklab | {line}")
        if p.returncode != 0:
            warnings.append(f"remapPalette.mjs a echoue (code {p.returncode}) : "
                            f"{(p.stderr or '').strip()[:300]} - etape OKLab sautee")
            return native, "echec"
        out = Image.open(tmp).convert("RGBA")
        out.load()
    if out.size != native.size:
        warnings.append("remapPalette a change la taille de la native (inattendu) : etape OKLab annulee")
        return native, "echec"
    return out, "applique"


def diff_ratio(a: Image.Image, b: Image.Image) -> float:
    """Part des pixels modifiés entre a et b (même taille) : diff RGB > 32 sur un
    canal, ou bascule d'opacité, comptée sur l'union des zones opaques. Un sprite
    DÉJÀ natif mal re-grillé explose cette métrique (la reconstruction collapse
    des vrais pixels distincts) ; un sprite vraiment baveux reste proche."""
    A = np.asarray(a, dtype=np.int16)
    B = np.asarray(b, dtype=np.int16)
    mask = (A[:, :, 3] >= 128) | (B[:, :, 3] >= 128)
    if not mask.any():
        return 0.0
    d = np.abs(A[:, :, :3] - B[:, :, :3]).max(axis=2)
    alpha_flip = (A[:, :, 3] >= 128) != (B[:, :, 3] >= 128)
    return float(((d > 32) | alpha_flip)[mask].mean())


def opaque_bbox(img: Image.Image) -> list[int] | None:
    """[x0, y0, x1, y1] des pixels d'alpha >= 128 (bornes incluses)."""
    a = np.asarray(img)[:, :, 3] >= 128
    if not a.any():
        return None
    ys, xs = np.nonzero(a)
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser(
        description="Re-grille un sprite (pixel-art-fixer) et le remet a sa dimension d'origine exacte.")
    ap.add_argument("sprite", help="chemin du PNG a reprendre")
    ap.add_argument("--oklab", action="store_true",
                    help="chaine scripts/remapPalette.mjs (--declutter) sur la native avant rescale")
    ap.add_argument("--oklab-args", default="",
                    help="options supplementaires passees telles quelles a remapPalette.mjs")
    ap.add_argument("--no-declutter", action="store_true",
                    help="avec --oklab : ne pas ajouter --declutter")
    ap.add_argument("--in-place", action="store_true",
                    help="ecrase la source APRES backup verifie (sinon sortie dans _sprite_out/ seulement)")
    ap.add_argument("--dry-run", action="store_true",
                    help="rapport seul : aucune ecriture persistante (ni backup, ni sortie)")
    ap.add_argument("--force-step", type=float, default=None,
                    help="impose le pas de grille (px) au lieu de la detection")
    ap.add_argument("--save-native", action="store_true",
                    help="ecrit aussi la native 1x a cote de la sortie (c'est elle qu'on retouche a la main)")
    args = ap.parse_args()

    src = Path(args.sprite)
    if not src.exists():
        sys.exit(f"introuvable : {src}")
    src = src.resolve()
    if src.suffix.lower() != ".png":
        sys.exit(f"seuls les PNG sont geres : {src.name}")

    t0 = time.time()
    original_bytes = src.read_bytes()
    im = Image.open(io.BytesIO(original_bytes)).convert("RGBA")
    W0, H0 = im.size
    warnings: list[str] = []

    try:
        rel = src.relative_to(ROOT)
    except ValueError:
        rel = Path(src.name)
        warnings.append("sprite hors du repo : sortie sous _sprite_out/<nom> sans arborescence")

    print(f"sprite   : {rel.as_posix()}")
    print(f"origine  : {W0} x {H0}")

    # 2. backup AVANT toute écriture (la source n'est jamais touchée sans lui)
    backup_path = None
    if not args.dry_run:
        backup_path = do_backup(src, original_bytes)

    # 3. detect + reconstruct via le point d'entrée officiel (two_stage_pack,
    #    le reconstructeur par défaut du serveur, alpha binarisé par cellule)
    try:
        r = process(np.array(im), force_step=args.force_step, return_png=False)
    except InputError as e:
        sys.exit(f"pixel-art-fixer refuse ce sprite : {e}")
    cols, rows = r["cols"], r["rows"]
    native = Image.fromarray(r["array"])
    print(f"natif    : {cols} x {rows} (step {r['step_x']} x {r['step_y']}, "
          f"consensus {r['consensus']}, confiance {r['confidence']})")

    # 4. facteur d'échelle entier pour revenir à W0 x H0
    scale_x = max(1, round(W0 / cols))
    scale_y = max(1, round(H0 / rows))
    exact = (scale_x == scale_y and cols * scale_x == W0 and rows * scale_y == H0)
    if scale_x != scale_y:
        warnings.append(f"echelle non uniforme : x{scale_x} en largeur, x{scale_y} en hauteur")
    if not exact:
        warnings.append(
            f"dimension d'origine PAS un multiple entier propre de la native : "
            f"{cols} x {scale_x} = {cols * scale_x} != {W0} ou {rows} x {scale_y} = {rows * scale_y} != {H0}. "
            f"Sortie FORCEE a {W0} x {H0} en NEAREST : blocs de pixels inegaux, retouche manuelle probable.")

    # 6. (option) verrou palette maître OKLab sur la native, avant rescale
    oklab_status = "non demande"
    if args.oklab:
        native, oklab_status = run_oklab(native, src.stem, not args.no_declutter,
                                         args.oklab_args, warnings)

    # 5. rescale NEAREST uniquement, dimension finale forcée à l'origine
    out_img = native.resize((W0, H0), Image.NEAREST)
    if out_img.size != (W0, H0):
        sys.exit(f"ATTENTION dimension finale {out_img.size} != origine {(W0, H0)} : abandon")

    # dérive d'ancrage : le slot isoKit ancre bottom-center, une bbox qui bouge
    # d'une cellule native decale le sprite dans la scene
    bb0 = opaque_bbox(im)
    bb1 = opaque_bbox(out_img)
    anchor = {"bbox_origine": bb0, "bbox_sortie": bb1, "dy_bas": None, "dx_centre": None}
    if bb0 and bb1:
        anchor["dy_bas"] = bb1[3] - bb0[3]
        anchor["dx_centre"] = round(((bb1[0] + bb1[2]) - (bb0[0] + bb0[2])) / 2, 1)
        drift = max(abs(anchor["dy_bas"]), abs(anchor["dx_centre"]))
        if drift >= max(scale_x, scale_y):
            warnings.append(f"derive d'ancrage : bas {anchor['dy_bas']:+} px, centre {anchor['dx_centre']:+} px "
                            f"(>= 1 cellule native) : verifier le calage au sol dans la scene")
    elif bb0 and not bb1:
        warnings.append("sortie entierement transparente (alpha < 128 partout) : reconstruction a jeter")

    fidelity = round(diff_ratio(im, out_img), 3)
    if fidelity > 0.30:
        warnings.append(
            f"{fidelity:.0%} des pixels opaques changent entre l'original et la sortie : le sprite etait "
            f"probablement DEJA natif (grille detectee = motifs, pas pixels) ou la grille est fausse. "
            f"Ne PAS adopter cette sortie sans comparaison visuelle serieuse.")

    low_conf = r["confidence"] == "low"
    needs_review = (low_conf or not exact or fidelity > 0.30
                    or any("derive d'ancrage" in w or "transparente" in w for w in warnings))

    report = {
        "chemin": rel.as_posix(),
        "dimensions_origine": [W0, H0],
        "natif": [cols, rows],
        "step": [r["step_x"], r["step_y"]],
        "echelle": {"x": scale_x, "y": scale_y},
        "dimensions_exactes": exact,
        "consensus": r["consensus"],
        "confidence": r["confidence"],
        "oklab": oklab_status,
        "part_pixels_modifies": fidelity,
        "ancrage": anchor,
        "retouche_manuelle_probable": needs_review,
        "avertissements": warnings,
        "backup": backup_path.relative_to(ROOT).as_posix() if backup_path else None,
        "sortie": None,
        "source_ecrasee": False,
        "horodatage": datetime.now().isoformat(timespec="seconds"),
        "duree_s": round(time.time() - t0, 2),
    }

    # 7. écriture : _sprite_out/ (jamais en place) ; source seulement si --in-place
    if args.dry_run:
        print("dry-run  : aucune ecriture, rapport ci-dessous")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        out_path = OUT_DIR / rel
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_img.save(out_path)
        report["sortie"] = out_path.relative_to(ROOT).as_posix()
        if Image.open(out_path).size != (W0, H0):
            sys.exit(f"ATTENTION la sortie ecrite ne fait pas {W0} x {H0} : ne pas utiliser ce fichier")
        if args.save_native:
            npath = out_path.with_suffix(".native.png")
            native.save(npath)
            report["native_png"] = npath.relative_to(ROOT).as_posix()
        if args.in_place:
            if not (backup_path and backup_path.exists()):
                sys.exit("--in-place refuse : backup absent ou non verifie")
            tmp = src.with_name(src.name + ".tmp-refix")
            tmp.write_bytes(out_path.read_bytes())
            tmp.replace(src)
            report["source_ecrasee"] = True
        rpt_path = out_path.with_suffix(".report.json")
        rpt_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

        print(f"echelle  : x{scale_x}" + (f" / x{scale_y}" if scale_y != scale_x else "")
              + f" -> {W0} x {H0}")
        print(f"dimension d'origine conservee : OUI"
              + (" (multiple entier propre)" if exact else " (FORCEE, multiple non entier !)"))
        print(f"oklab    : {oklab_status}")
        if anchor["dy_bas"] is not None:
            print(f"ancrage  : bas {anchor['dy_bas']:+} px, centre {anchor['dx_centre']:+} px")
        print(f"backup   : {report['backup']}")
        print(f"sortie   : {report['sortie']}" + ("  (source ECRASEE apres backup)" if report["source_ecrasee"] else ""))
        print(f"rapport  : {rpt_path.relative_to(ROOT).as_posix()}")

    for w in warnings:
        print(f"  !! {w}")
    if needs_review:
        print("verdict  : RETOUCHE MANUELLE PROBABLE ("
              + ("confiance basse" if low_conf else "voir avertissements") + ")")
    elif r["confidence"] == "medium":
        print("verdict  : confiance medium, controle visuel conseille - a juger dans le jeu, au zoom reel")
    else:
        print("verdict  : OK - a juger dans le jeu, au zoom reel (pas dans un viewer zoome)")
    sys.exit(2 if needs_review else 0)


if __name__ == "__main__":
    main()
