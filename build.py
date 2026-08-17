import argparse
import io
import json
import os
import re
import shutil
import sys
import zipfile

try:
    from PIL import Image
except ImportError:
    sys.exit("Falta Pillow. Instala con:  pip install pillow")

ROOT = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(ROOT, "content")
IMG_RE = re.compile(r"\.(jpe?g|png|webp|gif|avif|bmp)$", re.I)


def natural_key(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]

MARKER_RE = re.compile(r"(?:chapter|volume|vol|chap|cap[ií]tulo|cap|episode|epis|ep|ch|#)[\s._#:-]*(\d+(?:\.\d+)?)", re.I)
ANY_NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def chapter_number(filename):
    name = os.path.splitext(filename)[0]
    m = MARKER_RE.search(name)
    if m:
        return float(m.group(1))
    nums = ANY_NUM_RE.findall(name)
    return float(nums[-1]) if nums else None


def fmt_num(n):
    return str(int(n)) if float(n).is_integer() else (f"{n:g}")


def slugify(s):
    s = re.sub(r"[^\w\s-]", "", s.lower())
    return re.sub(r"[\s_-]+", "-", s).strip("-") or "manga"


def image_names(zf):
    names = [n for n in zf.namelist()
             if IMG_RE.search(os.path.basename(n))
             and not os.path.basename(n).startswith(".")
             and "__MACOSX" not in n]
    names.sort(key=natural_key)
    return names


def repack(src_cbz, dst_cbz, width):
    with zipfile.ZipFile(src_cbz) as zin, \
         zipfile.ZipFile(dst_cbz, "w", zipfile.ZIP_DEFLATED) as zout:
        for i, name in enumerate(image_names(zin)):
            img = Image.open(io.BytesIO(zin.read(name))).convert("RGB")
            if img.width > width:
                h = round(img.height * width / img.width)
                img = img.resize((width, h), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, "WEBP", quality=82, method=6)
            zout.writestr(f"{i+1:03d}.webp", buf.getvalue())


def first_image(cbz):
    with zipfile.ZipFile(cbz) as z:
        names = image_names(z)
        if not names:
            return None
        return Image.open(io.BytesIO(z.read(names[0])))


def count_pages(cbz):
    with zipfile.ZipFile(cbz) as z:
        return len(image_names(z))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("title")
    ap.add_argument("source", help="Carpeta con los .cbz de este manga")
    ap.add_argument("--author", default="")
    ap.add_argument("--synopsis", default="")
    ap.add_argument("--direction", default="rtl", choices=["rtl", "ltr"])
    ap.add_argument("--repack", action="store_true", help="Redimensiona y recomprime")
    ap.add_argument("--width", type=int, default=1200)
    args = ap.parse_args()

    if not os.path.isdir(args.source):
        sys.exit(f"No existe la carpeta: {args.source}")

    cbz_files = [f for f in os.listdir(args.source) if f.lower().endswith(".cbz")]
    if not cbz_files:
        sys.exit("No se encontraron archivos .cbz en la carpeta.")

    cbz_files.sort(key=lambda f: (
        chapter_number(f) is None,
        chapter_number(f) if chapter_number(f) is not None else 0.0,
        natural_key(f),
    ))

    mid = slugify(args.title)
    mdir = os.path.join(CONTENT, mid)
    os.makedirs(mdir, exist_ok=True)

    chapters_meta = []
    for ci, fname in enumerate(cbz_files):
        src = os.path.join(args.source, fname)
        dst = os.path.join(mdir, f"cap_{ci+1:03d}.cbz")
        if args.repack:
            repack(src, dst, args.width)
        else:
            shutil.copyfile(src, dst)
        pages = count_pages(dst)
        num = chapter_number(fname)
        title = f"Volume {fmt_num(num)}" if num is not None else f"Volume {ci+1}"
        chapters_meta.append({"title": title, "file": f"cap_{ci+1:03d}.cbz", "pages": pages})
        print(f"  vol_{ci+1:03d}  {title}  ({pages} pags)  <- {fname}{'  [recomprimido]' if args.repack else ''}")

    cover = first_image(os.path.join(mdir, "cap_001.cbz"))
    if cover:
        cover = cover.convert("RGB")
        cover.thumbnail((400, 600), Image.LANCZOS)
        cover.save(os.path.join(mdir, "cover.webp"), "WEBP", quality=80)

    manifest = {
        "id": mid, "title": args.title, "author": args.author,
        "direction": args.direction, "synopsis": args.synopsis,
        "cover": "cover.webp" if cover else "",
        "chapters": chapters_meta,
    }
    with open(os.path.join(mdir, "manifest.json"), "w") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    lib_path = os.path.join(CONTENT, "library.json")
    lib = {"manga": []}
    if os.path.exists(lib_path):
        with open(lib_path) as f:
            lib = json.load(f)
    lib["manga"] = [m for m in lib["manga"] if m["id"] != mid]
    lib["manga"].append({
        "id": mid, "title": args.title, "author": args.author,
        "synopsis": args.synopsis,
        "cover": f"{mid}/cover.webp" if cover else "",
        "chapters": len(chapters_meta),
    })
    with open(lib_path, "w") as f:
        json.dump(lib, f, ensure_ascii=False, indent=2)

    print(f"\nListo: '{args.title}' -> content/{mid}/  ({len(chapters_meta)} capitulos)")
    print("Sube la carpeta del sitio a tu hosting y abre la URL.")


if __name__ == "__main__":
    main()

