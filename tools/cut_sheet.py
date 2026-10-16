#!/usr/bin/env python3
"""Découpe une planche Gemini (éléments sur fond uni) en images détourées.

Usage : python3 cut_sheet.py planche.png cle1,cle2,... [--rot cle:degres ...] [--tol 40]
- Les éléments sont pris dans l'ordre de lecture (lignes puis colonnes).
- Chaque élément devient assets/<cle>.png (fond transparent, 256 px max).
- js/assets.js est mis à jour avec la liste des images présentes.
Mettre « - » comme clé pour ignorer un élément.
"""
import sys, os, json, argparse
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet'); ap.add_argument('keys')
    ap.add_argument('--rot', nargs='*', default=[]); ap.add_argument('--tol', type=float, default=40)
    ap.add_argument('--max', type=int, default=256)
    a = ap.parse_args()
    keys = a.keys.split(',')
    rot = {r.split(':')[0]: float(r.split(':')[1]) for r in a.rot}
    im = Image.open(a.sheet).convert('RGB'); arr = np.asarray(im).astype(np.int32)
    h, w, _ = arr.shape
    border = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
    bg = np.median(border, axis=0)
    near = np.sqrt(((arr - bg) ** 2).sum(axis=2)) < a.tol
    # fond = zone proche de la couleur du fond ET reliée au bord
    lab, n = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge))
    fg = ~bgmask
    fg = ndimage.binary_opening(fg, iterations=1)
    lab2, n2 = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab2, range(1, n2 + 1))
    order = np.argsort(sizes)[::-1][:len(keys)]
    objs = ndimage.find_objects(lab2)
    boxes = [(objs[i], i + 1) for i in order]
    # ordre de lecture : regrouper par lignes
    boxes.sort(key=lambda b: (b[0][0].start + b[0][0].stop) / 2)
    rows, cur = [], []
    for b in boxes:
        cy = (b[0][0].start + b[0][0].stop) / 2
        if cur and cy - (cur[-1][0][0].start + cur[-1][0][0].stop) / 2 > (b[0][0].stop - b[0][0].start) * 0.5:
            rows.append(cur); cur = []
        cur.append(b)
    if cur: rows.append(cur)
    ordered = [b for r in rows for b in sorted(r, key=lambda b: b[0][1].start)]
    rgba = np.dstack([np.asarray(im), (fg * 255).astype(np.uint8)])
    # adoucir le bord du masque
    alpha = Image.fromarray(rgba[:, :, 3]).filter(__import__('PIL.ImageFilter', fromlist=['x']).GaussianBlur(0.8))
    rgba[:, :, 3] = np.minimum(rgba[:, :, 3], np.asarray(alpha))
    out = os.path.join(ROOT, 'assets'); os.makedirs(out, exist_ok=True)
    for (sl, idx), key in zip(ordered, keys):
        if key == '-': continue
        pad = 4
        y0, y1 = max(0, sl[0].start - pad), min(h, sl[0].stop + pad)
        x0, x1 = max(0, sl[1].start - pad), min(w, sl[1].stop + pad)
        crop = rgba[y0:y1, x0:x1].copy()
        # garder les pixels du bloc et des petits morceaux proches
        piece = Image.fromarray(crop, 'RGBA')
        if key in rot: piece = piece.rotate(rot[key], expand=True, resample=Image.BICUBIC)
        piece.thumbnail((a.max, a.max), Image.LANCZOS)
        piece.save(os.path.join(out, key + '.png'))
        print('ok', key, piece.size)
    lst = sorted(f[:-4] for f in os.listdir(out) if f.endswith('.png'))
    with open(os.path.join(ROOT, 'js', 'assets.js'), 'w') as f:
        f.write('/* Liste des images présentes dans assets/ (sans extension). Vide = dessins procéduraux. */\n')
        f.write('window.ASSET_LIST = ' + json.dumps(lst) + ';\n')
        mus = sorted(f2[6:-4] for f2 in os.listdir(out) if f2.startswith('music_') and f2.endswith('.mp3'))
        f.write('window.MUSIC_LIST = ' + json.dumps(mus) + ';\n')
    print(len(lst), 'images listées')

if __name__ == '__main__':
    main()
