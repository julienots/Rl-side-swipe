#!/usr/bin/env python3
"""Encode le AndroidManifest.xml binaire (AXML) et un resources.arsc minimal (icône du lanceur).

Remplace aapt2 pour cette coquille très simple (aapt2 n'est pas téléchargeable dans l'environnement
de construction). Formats : frameworks/base/libs/androidfw/include/androidfw/ResourceTypes.h.

Usage : binres.py <dossier_sortie> <versionCode> <versionName>
"""
import struct
import sys
from pathlib import Path

ANDROID_NS = "http://schemas.android.com/apk/res/android"
PACKAGE = "com.bolidball.jeu"

# Identifiants des attributs du framework (android.R.attr, API 34)
ATTR = {
    "theme": 0x01010000, "label": 0x01010001, "icon": 0x01010002, "name": 0x01010003,
    "exported": 0x01010010, "configChanges": 0x0101001F, "launchMode": 0x0101001D,
    "screenOrientation": 0x0101001E, "versionCode": 0x0101021B, "versionName": 0x0101021C,
    "minSdkVersion": 0x0101020C, "allowBackup": 0x01010280, "targetSdkVersion": 0x01010270,
    "hardwareAccelerated": 0x010102D3, "resizeableActivity": 0x010104F6,
}
THEME_FULLSCREEN = 16974122  # android.R.style.Theme_DeviceDefault_NoActionBar_Fullscreen
ICON_ID = 0x7F010000  # @mipmap/ic_launcher (paquet 0x7f, type 1, entrée 0)

T_REF, T_STRING, T_DEC, T_HEX, T_BOOL = 0x01, 0x03, 0x10, 0x11, 0x12


def align4(b: bytes) -> bytes:
    return b + b"\0" * ((4 - len(b) % 4) % 4)


def string_pool(strings, utf8=False):
    """RES_STRING_POOL_TYPE."""
    data = b""
    offsets = []
    for s in strings:
        offsets.append(len(data))
        if utf8:
            raw = s.encode("utf-8")
            n16 = len(s.encode("utf-16-le")) // 2
            assert n16 < 0x80 and len(raw) < 0x80
            data += bytes([n16, len(raw)]) + raw + b"\0"
        else:
            raw = s.encode("utf-16-le")
            n = len(raw) // 2
            assert n < 0x8000
            data += struct.pack("<H", n) + raw + b"\0\0"
    data = align4(data)
    header_size = 28
    strings_start = header_size + 4 * len(strings)
    size = strings_start + len(data)
    flags = 0x100 if utf8 else 0
    head = struct.pack("<HHIIIIII", 0x0001, header_size, size, len(strings), 0, flags, strings_start, 0)
    return head + b"".join(struct.pack("<I", o) for o in offsets) + data


class Axml:
    """Construit un document XML binaire Android."""

    def __init__(self):
        self.attr_names = []  # noms d'attributs android (mappés à des ID de ressource), en tête du pool
        self.others = []
        self.events = []

    def _idx(self, s):
        pool = self.attr_names + self.others
        return pool.index(s)

    def _add(self, s):
        if s not in self.attr_names and s not in self.others:
            self.others.append(s)

    def element(self, name, attrs, children=()):
        """attrs : liste de (espace_android:bool, nom, type, valeur)."""
        for ns, an, typ, val in attrs:
            if ns and an not in self.attr_names:
                self.attr_names.append(an)
            elif not ns:
                self._add(an)
            if typ == T_STRING:
                self._add(val)
        self._add(name)
        self.events.append(("start", name, attrs))
        for c in children:
            self.element(*c)
        self.events.append(("end", name, None))

    def build(self, root):
        self._add("android")
        self._add(ANDROID_NS)
        self.element(*root)
        # le pool doit commencer par les noms d'attributs dans l'ordre de la table des ID
        self.attr_names.sort(key=lambda n: ATTR[n])
        strings = self.attr_names + self.others
        pool = string_pool(strings)
        resmap_body = b"".join(struct.pack("<I", ATTR[n]) for n in self.attr_names)
        resmap = struct.pack("<HHI", 0x0180, 8, 8 + len(resmap_body)) + resmap_body
        NONE = 0xFFFFFFFF
        ns_uri, ns_prefix = self._idx(ANDROID_NS), self._idx("android")
        body = struct.pack("<HHIIIII", 0x0100, 16, 24, 1, NONE, ns_prefix, ns_uri)
        line = 2
        for ev, name, attrs in self.events:
            if ev == "start":
                encoded = []
                for ns, an, typ, val in attrs:
                    if typ == T_STRING:
                        raw, data = self._idx(val), self._idx(val)
                    else:
                        raw = NONE
                        data = (0xFFFFFFFF if val else 0) if typ == T_BOOL else val
                    key = ATTR.get(an, 0xFFFFFFFF) if ns else 0xFFFFFFFF
                    encoded.append((key, struct.pack("<IIIHBBI", ns_uri if ns else NONE, self._idx(an), raw, 8, 0, typ, data & 0xFFFFFFFF)))
                encoded.sort(key=lambda e: e[0])  # attributs triés par ID, comme aapt
                attr_bytes = b"".join(e[1] for e in encoded)
                ext = struct.pack("<IIHHHHHH", NONE, self._idx(name), 20, 20, len(attrs), 0, 0, 0)
                chunk_body = struct.pack("<II", line, NONE) + ext + attr_bytes
                body += struct.pack("<HHI", 0x0102, 16, 8 + len(chunk_body)) + chunk_body
            else:
                chunk_body = struct.pack("<IIII", line, NONE, NONE, self._idx(name))
                body += struct.pack("<HHI", 0x0103, 16, 8 + len(chunk_body)) + chunk_body
            line += 1
        body += struct.pack("<HHIIIII", 0x0101, 16, 24, line, NONE, ns_prefix, ns_uri)
        content = pool + resmap + body
        return struct.pack("<HHI", 0x0003, 8, 8 + len(content)) + content


def manifest(version_code, version_name):
    A = True
    activity = ("activity", [
        (A, "name", T_STRING, PACKAGE + ".MainActivity"),
        (A, "exported", T_BOOL, True),
        (A, "screenOrientation", T_DEC, 6),  # sensorLandscape
        (A, "launchMode", T_DEC, 2),  # singleTask
        # orientation|keyboardHidden|keyboard|screenLayout|screenSize|smallestScreenSize|uiMode
        (A, "configChanges", T_HEX, 0x80 | 0x20 | 0x10 | 0x100 | 0x400 | 0x800 | 0x200),
        (A, "hardwareAccelerated", T_BOOL, True),
        (A, "resizeableActivity", T_BOOL, True),
    ], [
        ("intent-filter", [], [
            ("action", [(A, "name", T_STRING, "android.intent.action.MAIN")]),
            ("category", [(A, "name", T_STRING, "android.intent.category.LAUNCHER")]),
        ]),
    ])
    app = ("application", [
        (A, "label", T_STRING, "Bolid'Ball"),
        (A, "icon", T_REF, ICON_ID),
        (A, "theme", T_REF, THEME_FULLSCREEN),
        (A, "allowBackup", T_BOOL, True),
        (A, "hardwareAccelerated", T_BOOL, True),
    ], [activity])
    root = ("manifest", [
        (False, "package", T_STRING, PACKAGE),
        (A, "versionCode", T_DEC, version_code),
        (A, "versionName", T_STRING, version_name),
    ], [
        ("uses-sdk", [(A, "minSdkVersion", T_DEC, 24), (A, "targetSdkVersion", T_DEC, 34)]),
        app,
    ])
    return Axml().build(root)


def resources_arsc(icon_path="res/mipmap-xxxhdpi-v4/ic_launcher.png"):
    """Table de ressources : un seul élément, mipmap/ic_launcher (densité xxxhdpi)."""
    values = string_pool([icon_path], utf8=True)
    type_strings = string_pool(["mipmap"], utf8=True)
    key_strings = string_pool(["ic_launcher"], utf8=True)

    spec = struct.pack("<HHIBBHI", 0x0202, 16, 16 + 4, 1, 0, 0, 1) + struct.pack("<I", 0x0100)  # varie selon la densité

    config = bytearray(64)
    struct.pack_into("<I", config, 0, 64)
    struct.pack_into("<H", config, 14, 640)  # densité xxxhdpi
    struct.pack_into("<H", config, 24, 4)  # v4 (ajouté par aapt pour les qualificatifs de densité)
    entry = struct.pack("<HHI", 8, 0, 0) + struct.pack("<HBBI", 8, 0, T_STRING, 0)
    type_header_size = 20 + 64
    entries_start = type_header_size + 4
    type_chunk_size = entries_start + len(entry)
    type_chunk = struct.pack("<HHIBBHII", 0x0201, type_header_size, type_chunk_size, 1, 0, 0, 1, entries_start)
    type_chunk += bytes(config) + struct.pack("<I", 0) + entry

    name = PACKAGE.encode("utf-16-le").ljust(256, b"\0")
    pkg_header_size = 288
    type_strings_off = pkg_header_size
    key_strings_off = type_strings_off + len(type_strings)
    pkg_body = type_strings + key_strings + spec + type_chunk
    pkg = struct.pack("<HHII", 0x0200, pkg_header_size, pkg_header_size + len(pkg_body), 0x7F) + name
    pkg += struct.pack("<IIIII", type_strings_off, 1, key_strings_off, 1, 0) + pkg_body
    assert len(pkg) == pkg_header_size + len(pkg_body)

    content = values + pkg
    return struct.pack("<HHII", 0x0002, 12, 12 + len(content), 1) + content


if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    (out / "AndroidManifest.xml").write_bytes(manifest(int(sys.argv[2]), sys.argv[3]))
    (out / "resources.arsc").write_bytes(resources_arsc())
    print("AndroidManifest.xml et resources.arsc générés dans", out)
