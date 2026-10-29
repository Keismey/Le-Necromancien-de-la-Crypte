#!/usr/bin/env python3
"""Découpe une planche Gemini (éléments sur fond uni) en images détourées.

Usage : python3 cut_sheet.py planche.png cle1,cle2,... [--merge 25] [--flip cle ...] [--rot cle:degres ...] [--tol 40]
- Les éléments sont pris dans l'ordre de lecture (lignes puis colonnes). « - » ignore un élément.
- --merge : distance (px) en dessous de laquelle des morceaux proches forment un seul élément
  (paire de jambes, ailes, auréole au-dessus d'un crâne, étincelles…). Par défaut, la plus petite
  distance qui donne exactement autant d'éléments que de clés.
- Les traits de grille (lignes sombres qui traversent la planche) sont effacés.
- Les trous fermés couleur fond (entre les côtes…) deviennent transparents.
- Chaque élément devient assets/<cle>.webp (fond transparent, 256 px max) et js/assets.js est mis à jour.
"""
import os, json, argparse
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet'); ap.add_argument('keys')
    ap.add_argument('--merge', type=int, default=0)  # 0 = automatique
    ap.add_argument('--flip', nargs='*', default=[])
    ap.add_argument('--rot', nargs='*', default=[])
    ap.add_argument('--tol', type=float, default=40)
    ap.add_argument('--max', type=int, default=256)
    ap.add_argument('--keepholes', action='store_true')  # garder opaques les reflets blancs fermés (fioles, verre)
    ap.add_argument('--out', default='')  # dossier de sortie (pas de mise à jour de assets.js)
    a = ap.parse_args()
    keys = a.keys.split(',')
    rot = {r.split(':')[0]: float(r.split(':')[1]) for r in a.rot}
    im = Image.open(a.sheet).convert('RGB'); arr = np.asarray(im).astype(np.int32).copy()
    h, w, _ = arr.shape
    border = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
    bg = np.median(border, axis=0)
    # traits de grille : lignes/colonnes presque entièrement sombres
    dark = arr.sum(axis=2) < 200
    for y in np.where(dark.mean(axis=1) > 0.6)[0]: arr[max(0, y - 2):y + 3] = bg
    for x in np.where(dark.mean(axis=0) > 0.6)[0]: arr[:, max(0, x - 2):x + 3] = bg
    diff = np.sqrt(((arr - bg) ** 2).sum(axis=2))
    near = diff < a.tol
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge))
    # trous fermés quasi identiques au fond et assez grands
    holes, nh = ndimage.label((diff < a.tol * 0.45) & ~bgmask)
    if nh and not a.keepholes:
        hs = ndimage.sum(np.ones_like(diff), holes, range(1, nh + 1))
        big = np.where(hs > 120)[0] + 1
        bgmask |= np.isin(holes, big)
    fg = ndimage.binary_opening(~bgmask, iterations=1)
    # regrouper les morceaux proches
    total = fg.sum()
    def groups(m):
        g, n = ndimage.label(ndimage.binary_dilation(fg, iterations=m) if m else fg)
        ar = ndimage.sum(fg, g, range(1, n + 1))
        return g, ar, int((ar > total * 0.012).sum())
    if a.merge: grp, areas, _ = groups(a.merge)
    else:
        for m in range(1, 90):
            grp, areas, cnt = groups(m)
            if cnt <= len(keys): break
        print('fusion', m, 'px,', cnt, 'éléments')
    order = np.argsort(areas)[::-1][:len(keys)]
    objs = ndimage.find_objects(grp)
    boxes = [(objs[i], i + 1) for i in order]
    boxes.sort(key=lambda b: (b[0][0].start + b[0][0].stop) / 2)
    rows, cur = [], []
    for b in boxes:
        cy = (b[0][0].start + b[0][0].stop) / 2
        if cur and cy - (cur[0][0][0].start + cur[0][0][0].stop) / 2 > (b[0][0].stop - b[0][0].start) * 0.5:
            rows.append(cur); cur = []
        cur.append(b)
    if cur: rows.append(cur)
    ordered = [b for r in rows for b in sorted(r, key=lambda b: b[0][1].start)]
    base = np.asarray(im)
    out = a.out or os.path.join(ROOT, 'assets'); os.makedirs(out, exist_ok=True)
    for (sl, gid), key in zip(ordered, keys):
        if key == '-': continue
        m = fg & (grp == gid)
        ys, xs = np.where(m)
        pad = 3
        y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + 1 + pad)
        x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + 1 + pad)
        alpha = Image.fromarray((m[y0:y1, x0:x1] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
        al = np.minimum(np.asarray(alpha), m[y0:y1, x0:x1] * 255).astype(np.uint8)
        piece = Image.fromarray(np.dstack([base[y0:y1, x0:x1], al]), 'RGBA')
        if key in a.flip: piece = piece.transpose(Image.FLIP_LEFT_RIGHT)
        if key in rot: piece = piece.rotate(rot[key], expand=True, resample=Image.BICUBIC)
        piece.thumbnail((a.max, a.max), Image.LANCZOS)
        piece.save(os.path.join(out, key + '.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
        print('ok', key, piece.size)
    if a.out: return
    lst = sorted(f[:-5] for f in os.listdir(out) if f.endswith('.webp') and f not in ('cover.webp', 'studio_logo.webp'))
    with open(os.path.join(ROOT, 'js', 'assets.js'), 'w') as f:
        f.write('/* Liste des images présentes dans assets/ (sans extension). Vide = dessins procéduraux. */\n')
        f.write('window.ASSET_LIST = ' + json.dumps(lst) + ';\n')
        mus = sorted(f2[6:-4] for f2 in os.listdir(out) if f2.startswith('music_') and f2.endswith('.mp3'))
        f.write('window.MUSIC_LIST = ' + json.dumps(mus) + ';\n')
        sfx = sorted(f2[4:-4] for f2 in os.listdir(out) if f2.startswith('sfx_') and f2.endswith('.mp3'))
        f.write('window.SFX_LIST = ' + json.dumps(sfx) + ';\n')
    print(len(lst), 'images listées')


if __name__ == '__main__':
    main()
