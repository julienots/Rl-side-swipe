#!/usr/bin/env python3
"""Assemble l'APK non signé : manifeste binaire, classes.dex, resources.arsc, icône et jeu (assets/www).

Les entrées non compressées sont alignées sur 4 octets (équivalent de zipalign), ce qu'exige
Android 11+ pour resources.arsc.
Usage : package.py <dossier_build> <racine_du_jeu> <apk_sortie>
"""
import sys
import zipfile
from pathlib import Path

build, root, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
GAME = ["index.html", "manifest.webmanifest", "sw.js", "icons", "src"]


def add(z, name, data, stored=False):
    info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    if stored:
        offset = z.fp.tell() + 30 + len(name.encode())
        info.extra = b"\0" * ((4 - offset % 4) % 4)
    z.writestr(info, data)


with zipfile.ZipFile(out, "w") as z:
    add(z, "AndroidManifest.xml", (build / "AndroidManifest.xml").read_bytes())
    add(z, "classes.dex", (build / "classes.dex").read_bytes())
    add(z, "resources.arsc", (build / "resources.arsc").read_bytes(), stored=True)
    add(z, "res/mipmap-xxxhdpi-v4/ic_launcher.png", (root / "icons/icon-192.png").read_bytes(), stored=True)
    count = 0
    for entry in GAME:
        p = root / entry
        files = [p] if p.is_file() else sorted(f for f in p.rglob("*") if f.is_file())
        for f in files:
            add(z, "assets/www/" + f.relative_to(root).as_posix(), f.read_bytes())
            count += 1
print(f"APK non signé : {out} ({count} fichiers du jeu)")
