#!/usr/bin/env python3
"""生成 5×9 全息 quilt 凹槽背景（2048²），多种材质，带内墙阴影立体感。"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public"
SIZE = 2048
COLS = 5
ROWS = 9


@dataclass(frozen=True)
class Material:
    key: str
    filename: str
    frame_top: tuple[int, int, int]
    frame_mid: tuple[int, int, int]
    frame_bot: tuple[int, int, int]
    back: tuple[int, int, int]
    wall_lit: tuple[int, int, int]
    wall_shadow: tuple[int, int, int]
    kind: str  # wood | metal | stone | marble


MATERIALS: list[Material] = [
    Material(
        "light_pine",
        "frame_5x9_quilt_bg.jpg",
        (228, 198, 162),
        (196, 164, 128),
        (158, 128, 98),
        (248, 244, 236),
        (236, 228, 214),
        (188, 176, 158),
        "wood",
    ),
    Material(
        "walnut",
        "frame_5x9_walnut.jpg",
        (132, 96, 68),
        (98, 68, 46),
        (72, 48, 34),
        (236, 228, 216),
        (210, 196, 176),
        (118, 96, 78),
        "wood",
    ),
    Material(
        "ash",
        "frame_5x9_ash.jpg",
        (196, 188, 176),
        (168, 160, 148),
        (138, 130, 120),
        (244, 242, 238),
        (228, 224, 216),
        (176, 170, 160),
        "wood",
    ),
    Material(
        "brushed_steel",
        "frame_5x9_brushed_steel.jpg",
        (196, 200, 206),
        (156, 160, 168),
        (118, 122, 130),
        (232, 234, 238),
        (214, 218, 224),
        (148, 152, 160),
        "metal",
    ),
    Material(
        "warm_brass",
        "frame_5x9_warm_brass.jpg",
        (210, 178, 118),
        (176, 142, 86),
        (132, 102, 58),
        (248, 242, 226),
        (232, 214, 176),
        (156, 124, 72),
        "metal",
    ),
    Material(
        "marble",
        "frame_5x9_marble.jpg",
        (214, 210, 204),
        (186, 182, 176),
        (156, 152, 146),
        (246, 244, 240),
        (232, 228, 222),
        (176, 172, 166),
        "marble",
    ),
    Material(
        "slate",
        "frame_5x9_slate.jpg",
        (96, 102, 108),
        (72, 78, 84),
        (52, 56, 62),
        (214, 216, 218),
        (186, 190, 194),
        (98, 102, 108),
        "stone",
    ),
]


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def mix(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t))


def clamp(v: int) -> int:
    return max(0, min(255, v))


def add_grain(img: Image.Image, strength: float, horizontal: bool) -> None:
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            n = (random.random() - 0.5) * strength
            if horizontal:
                n += math.sin(x * 0.08 + y * 0.015) * strength * 0.35
            else:
                n += math.sin(y * 0.12) * strength * 0.25
            px[x, y] = (clamp(int(r + n)), clamp(int(g + n)), clamp(int(b + n)))


def draw_marble_veins(draw: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int) -> None:
    random.seed(x0 * 17 + y0 * 31)
    for _ in range(3):
        sx = random.randint(x0, x1)
        sy = random.randint(y0, y1)
        points = []
        for i in range(8):
            sx += random.randint(-40, 40)
            sy += random.randint(-20, 20)
            points.append((max(x0, min(x1, sx)), max(y0, min(y1, sy))))
        draw.line(points, fill=(200, 196, 188), width=2)


def fill_gradient_rect(
    img: Image.Image,
    box: tuple[int, int, int, int],
    c0: tuple[int, int, int],
    c1: tuple[int, int, int],
    vertical: bool,
) -> None:
    x0, y0, x1, y1 = box
    px = img.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            t = (y - y0) / max(1, y1 - y0 - 1) if vertical else (x - x0) / max(1, x1 - x0 - 1)
            px[x, y] = mix(c0, c1, t)


def draw_cell(img: Image.Image, material: Material, col: int, row: int) -> None:
    cw = SIZE // COLS
    ch = SIZE // ROWS
    x0 = col * cw
    y0 = row * ch
    x1 = x0 + cw
    y1 = y0 + ch

    frame = max(10, cw // 22)
    depth = max(14, cw // 16)
    draw = ImageDraw.Draw(img)

    # 外框：上/左亮、下/右暗，形成木框/金属框厚度
    fill_gradient_rect(img, (x0, y0, x1, y0 + frame), material.frame_top, material.frame_mid, False)
    fill_gradient_rect(img, (x0, y1 - frame, x1, y1), material.frame_mid, material.frame_bot, False)
    fill_gradient_rect(img, (x0, y0, x0 + frame, y1), material.frame_top, material.frame_mid, True)
    fill_gradient_rect(img, (x1 - frame, y0, x1, y1), material.frame_mid, material.frame_bot, True)

    ix0 = x0 + frame
    iy0 = y0 + frame
    ix1 = x1 - frame
    iy1 = y1 - frame

    # 内凹槽后壁
    bx0 = ix0 + depth
    by0 = iy0 + depth
    bx1 = ix1 - depth
    by1 = iy1 - depth
    draw.rectangle((bx0, by0, bx1, by1), fill=material.back)

    # 内墙：上/左受光，下/右背光（立体感核心）
    fill_gradient_rect(img, (ix0, iy0, ix1, by0), material.wall_lit, material.back, True)
    fill_gradient_rect(img, (ix0, iy0, bx0, iy1), material.wall_lit, material.back, False)
    fill_gradient_rect(img, (bx1, iy0, ix1, iy1), material.back, material.wall_shadow, False)
    fill_gradient_rect(img, (ix0, by1, ix1, iy1), material.back, material.wall_shadow, True)

    if material.kind == "marble":
        draw_marble_veins(draw, bx0, by0, bx1, by1)


def generate(material: Material) -> None:
    random.seed(material.key)
    img = Image.new("RGB", (SIZE, SIZE), material.frame_mid)

    for row in range(ROWS):
        for col in range(COLS):
            draw_cell(img, material, col, row)

    if material.kind == "wood":
        add_grain(img, 8, horizontal=True)
    elif material.kind == "metal":
        add_grain(img, 6, horizontal=False)
    elif material.kind in {"stone", "marble"}:
        add_grain(img, 5, horizontal=False)

    img = img.filter(ImageFilter.GaussianBlur(radius=0.6))
    out = OUT_DIR / material.filename
    img.save(out, quality=92, optimize=True)
    print(f"wrote {out.name} ({SIZE}x{SIZE})")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for material in MATERIALS:
        generate(material)


if __name__ == "__main__":
    main()
