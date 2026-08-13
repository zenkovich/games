#!/usr/bin/env python3
"""Procedural sprite generator for Space Evolver: Galaxy Core prototype.

Style: vibrant neon vector shapes on dark space, soft glows, crisp silhouettes.
All sprites are drawn at 4x supersampling and downscaled (LANCZOS).
Output: Work/Art/sprites/*.png (later copied to Assets/SpaceEvolver/).
"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter

SS = 4  # supersampling
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sprites")
os.makedirs(OUT, exist_ok=True)
random.seed(20260813)


def canvas(w, h):
    return Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))


def save(img, name, w, h):
    img = img.resize((w, h), Image.LANCZOS)
    img.save(os.path.join(OUT, name))
    print("saved", name)


def mirror_pts(pts):
    """pts given for right half in normalized [-1..1] coords; return full symmetric polygon."""
    left = [(-x, y) for (x, y) in reversed(pts) if x > 0.001]
    return pts + left


def to_px(pts, w, h):
    return [((x * 0.5 + 0.5) * w * SS, (y * 0.5 + 0.5) * h * SS) for (x, y) in pts]


def vgrad_poly(img, pts, c_top, c_bot, outline=None, ow=0):
    """Polygon filled with vertical gradient."""
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    ys = [p[1] for p in pts]
    y0, y1 = min(ys), max(ys)
    grad = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    steps = max(2, int(y1 - y0))
    for i in range(steps):
        t = i / (steps - 1)
        c = tuple(int(c_top[j] + (c_bot[j] - c_top[j]) * t) for j in range(4))
        yy = y0 + (y1 - y0) * t
        gd.rectangle([0, yy, img.size[0], yy + (y1 - y0) / steps + 1], fill=c)
    img.paste(grad, (0, 0), Image.composite(mask, Image.new("L", img.size, 0), mask))
    if outline:
        ImageDraw.Draw(img).polygon(pts, outline=outline, width=max(1, int(ow * SS)))


def glow_under(img, color, radius, alpha=160):
    """Soft glow silhouette under existing content."""
    a = img.split()[3]
    sil = Image.new("RGBA", img.size, (0, 0, 0, 0))
    tint = Image.new("RGBA", img.size, color + (alpha,))
    sil.paste(tint, (0, 0), a)
    sil = sil.filter(ImageFilter.GaussianBlur(radius * SS))
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.alpha_composite(sil)
    out.alpha_composite(img)
    return out


def radial_glow(w, h, color, power=2.2, amax=255):
    img = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = w * SS / 2, h * SS / 2
    rmax = min(cx, cy)
    steps = 64
    for i in range(steps, 0, -1):
        t = i / steps
        a = int(amax * (1 - t) ** power)
        d.ellipse([cx - rmax * t, cy - rmax * t, cx + rmax * t, cy + rmax * t],
                  fill=color + (a,))
    return img


def ellipse(img, cx, cy, rx, ry, fill, outline=None, ow=0):
    ImageDraw.Draw(img).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill,
                                outline=outline, width=max(1, int(ow * SS)))


# ---------------------------------------------------------------- ships
def draw_ship(name, w, h, hull_top, hull_bot, accent, canopy, pts_hull, pts_wings,
              engine_xs, flame_color, pointing_down=False, extra=None):
    img = canvas(w, h)
    wing_pts = to_px(mirror_pts(pts_wings), w, h)
    vgrad_poly(img, wing_pts, tuple(int(c * 0.55) for c in hull_top) + (255,),
               tuple(int(c * 0.35) for c in hull_bot) + (255,),
               outline=accent + (255,), ow=1.2)
    hull = to_px(mirror_pts(pts_hull), w, h)
    vgrad_poly(img, hull, hull_top + (255,), hull_bot + (255,), outline=accent + (255,), ow=1.4)
    # canopy
    cx, cy = w * SS / 2, h * SS * (0.42 if not pointing_down else 0.58)
    ellipse(img, cx, cy, w * SS * 0.09, h * SS * 0.13, canopy + (255,),
            outline=(255, 255, 255, 200), ow=0.8)
    ellipse(img, cx - w * SS * 0.03, cy - h * SS * 0.05, w * SS * 0.03, h * SS * 0.04,
            (255, 255, 255, 180))
    # engines + flames
    ey = h * SS * (0.88 if not pointing_down else 0.12)
    fl = h * SS * 0.10 * (1 if not pointing_down else -1)
    for ex in engine_xs:
        px = (ex * 0.5 + 0.5) * w * SS
        ellipse(img, px, ey, w * SS * 0.045, h * SS * 0.02, (40, 40, 55, 255),
                outline=accent + (255,), ow=0.7)
        ImageDraw.Draw(img).polygon(
            [(px - w * SS * 0.03, ey), (px + w * SS * 0.03, ey), (px, ey + fl * 1.8)],
            fill=flame_color + (220,))
    if extra:
        extra(img, w, h)
    img = glow_under(img, accent, 3, 110)
    save(img, name, w, h)


def make_ships():
    # player ships, pointing up
    draw_ship("ship_viper.png", 96, 96, (52, 168, 235), (20, 60, 110), (120, 230, 255), (180, 250, 255),
              pts_hull=[(0.0, -0.95), (0.16, -0.30), (0.20, 0.45), (0.10, 0.75), (0.0, 0.72)],
              pts_wings=[(0.05, -0.1), (0.62, 0.42), (0.68, 0.62), (0.30, 0.55), (0.08, 0.55)],
              engine_xs=[-0.12, 0.12], flame_color=(120, 220, 255))
    draw_ship("ship_dreadnought.png", 96, 96, (90, 190, 150), (25, 75, 60), (150, 255, 200), (200, 255, 230),
              pts_hull=[(0.0, -0.80), (0.30, -0.35), (0.34, 0.55), (0.18, 0.80), (0.0, 0.78)],
              pts_wings=[(0.10, -0.2), (0.80, 0.25), (0.85, 0.70), (0.40, 0.62), (0.10, 0.60)],
              engine_xs=[-0.20, 0.0, 0.20], flame_color=(150, 255, 210))
    draw_ship("ship_falcon.png", 96, 96, (240, 180, 70), (120, 70, 20), (255, 220, 120), (255, 240, 180),
              pts_hull=[(0.0, -0.90), (0.14, -0.25), (0.16, 0.50), (0.08, 0.72), (0.0, 0.70)],
              pts_wings=[(0.06, -0.35), (0.75, 0.10), (0.60, 0.55), (0.25, 0.45), (0.06, 0.50)],
              engine_xs=[-0.10, 0.10], flame_color=(255, 210, 130))
    draw_ship("ship_plasma.png", 96, 96, (200, 110, 240), (80, 30, 120), (240, 160, 255), (250, 210, 255),
              pts_hull=[(0.0, -0.85), (0.22, -0.20), (0.26, 0.50), (0.12, 0.75), (0.0, 0.72)],
              pts_wings=[(0.08, 0.0), (0.66, 0.35), (0.70, 0.65), (0.30, 0.58), (0.08, 0.55)],
              engine_xs=[-0.14, 0.14], flame_color=(230, 160, 255),
              extra=lambda img, w, h: ellipse(img, w * SS / 2, h * SS * 0.60, w * SS * 0.10,
                                              w * SS * 0.10, (240, 160, 255, 220),
                                              outline=(255, 255, 255, 220), ow=1.0))
    # enemies, pointing down
    draw_ship("enemy_drone.png", 64, 64, (225, 80, 80), (90, 20, 30), (255, 140, 120), (255, 190, 170),
              pts_hull=[(0.0, 0.90), (0.22, 0.25), (0.26, -0.40), (0.12, -0.70), (0.0, -0.68)],
              pts_wings=[(0.08, 0.15), (0.62, -0.25), (0.66, -0.55), (0.28, -0.48), (0.08, -0.45)],
              engine_xs=[-0.12, 0.12], flame_color=(255, 150, 120), pointing_down=True)
    draw_ship("enemy_striker.png", 72, 72, (240, 130, 60), (110, 45, 15), (255, 190, 110), (255, 220, 160),
              pts_hull=[(0.0, 0.92), (0.16, 0.30), (0.20, -0.45), (0.10, -0.72), (0.0, -0.70)],
              pts_wings=[(0.06, 0.35), (0.80, -0.05), (0.85, -0.60), (0.35, -0.50), (0.06, -0.48)],
              engine_xs=[-0.16, 0.16], flame_color=(255, 190, 120), pointing_down=True)
    draw_ship("enemy_tank.png", 96, 96, (170, 90, 220), (60, 25, 95), (220, 150, 255), (240, 200, 255),
              pts_hull=[(0.0, 0.85), (0.38, 0.45), (0.42, -0.35), (0.22, -0.75), (0.0, -0.72)],
              pts_wings=[(0.15, 0.30), (0.85, 0.05), (0.88, -0.55), (0.45, -0.60), (0.15, -0.50)],
              engine_xs=[-0.24, 0.0, 0.24], flame_color=(230, 170, 255), pointing_down=True)


def make_boss():
    w, h = 240, 170
    img = canvas(w, h)
    # wing pods
    for sx in (-1, 1):
        pts = [(sx * 0.95, -0.10), (sx * 0.55, -0.45), (sx * 0.35, -0.20), (sx * 0.40, 0.45),
               (sx * 0.70, 0.60), (sx * 0.95, 0.35)]
        vgrad_poly(img, to_px(pts, w, h), (150, 40, 60, 255), (60, 12, 30, 255),
                   outline=(255, 110, 110, 255), ow=1.4)
    # main hull
    hull = [(0.0, 0.95), (0.30, 0.55), (0.45, 0.10), (0.35, -0.55), (0.15, -0.85), (0.0, -0.88)]
    vgrad_poly(img, to_px(mirror_pts(hull), w, h), (200, 70, 90, 255), (70, 15, 35, 255),
               outline=(255, 130, 130, 255), ow=1.6)
    # core
    cx, cy = w * SS / 2, h * SS * 0.45
    core = radial_glow(40, 40, (255, 90, 90), power=1.6)
    img.alpha_composite(core, (int(cx - 20 * SS), int(cy - 20 * SS)))
    ellipse(img, cx, cy, w * SS * 0.06, w * SS * 0.06, (255, 200, 120, 255),
            outline=(255, 255, 255, 230), ow=1.2)
    # turrets
    for tx in (-0.55, 0.55):
        px = (tx * 0.5 + 0.5) * w * SS
        ellipse(img, px, h * SS * 0.18, w * SS * 0.035, w * SS * 0.035, (90, 25, 45, 255),
                outline=(255, 130, 130, 255), ow=1.0)
    img = glow_under(img, (255, 80, 80), 4, 120)
    save(img, "boss.png", w, h)


# ---------------------------------------------------------------- projectiles & pickups
def make_projectiles():
    # player bullet: cyan bolt
    w, h = 16, 36
    img = canvas(w, h)
    glow = radial_glow(16, 36, (80, 200, 255), power=1.8)
    img.alpha_composite(glow)
    vgrad_poly(img, to_px(mirror_pts([(0.0, -0.9), (0.35, -0.2), (0.30, 0.75), (0.0, 0.9)]), w, h),
               (230, 255, 255, 255), (60, 170, 255, 255))
    save(img, "bullet_player.png", w, h)

    # enemy bullet: red-orange orb
    img = radial_glow(20, 20, (255, 90, 60), power=1.4)
    ellipse(img, 10 * SS, 10 * SS, 5.2 * SS, 5.2 * SS, (255, 160, 90, 255),
            outline=(255, 230, 200, 230), ow=0.8)
    save(img, "bullet_enemy.png", 20, 20)

    # rocket
    w, h = 18, 44
    img = canvas(w, h)
    vgrad_poly(img, to_px(mirror_pts([(0.0, -0.95), (0.30, -0.45), (0.30, 0.45), (0.0, 0.5)]), w, h),
               (235, 235, 245, 255), (140, 145, 165, 255), outline=(90, 95, 115, 255), ow=0.8)
    # nose
    vgrad_poly(img, to_px(mirror_pts([(0.0, -0.95), (0.30, -0.45), (0.0, -0.45)]), w, h),
               (255, 120, 90, 255), (200, 60, 50, 255))
    # fins
    for sx in (-1, 1):
        ImageDraw.Draw(img).polygon(
            to_px([(sx * 0.30, 0.15), (sx * 0.62, 0.55), (sx * 0.30, 0.5)], w, h),
            fill=(200, 60, 50, 255))
    # flame
    fl = radial_glow(14, 14, (255, 190, 90), power=1.2)
    img.alpha_composite(fl, (int(w * SS / 2 - 7 * SS), int(h * SS * 0.72)))
    save(img, "rocket.png", w, h)

    # laser beam segment (stretched vertically in game)
    w, h = 40, 64
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    cx = w * SS / 2
    for rx, col, a in [(0.46, (120, 80, 255), 60), (0.30, (150, 120, 255), 120),
                       (0.16, (210, 180, 255), 220), (0.07, (255, 255, 255), 255)]:
        d.rectangle([cx - w * SS * rx, 0, cx + w * SS * rx, h * SS], fill=col + (a,))
    save(img, "laser_beam.png", w, h)

    # xp orb
    img = radial_glow(28, 28, (60, 220, 255), power=1.5)
    ellipse(img, 14 * SS, 14 * SS, 6.5 * SS, 6.5 * SS, (140, 245, 255, 255),
            outline=(230, 255, 255, 240), ow=0.9)
    ellipse(img, 12 * SS, 12 * SS, 2.0 * SS, 2.0 * SS, (255, 255, 255, 230))
    save(img, "orb_xp.png", 28, 28)

    # coin
    w = 28
    img = canvas(w, w)
    glow = radial_glow(w, w, (255, 200, 60), power=2.4, amax=140)
    img.alpha_composite(glow)
    ellipse(img, w * SS / 2, w * SS / 2, 10 * SS, 10 * SS, (255, 205, 70, 255),
            outline=(255, 240, 170, 255), ow=1.2)
    ellipse(img, w * SS / 2, w * SS / 2, 6.5 * SS, 6.5 * SS, (230, 160, 40, 255))
    d = ImageDraw.Draw(img)
    d.polygon([(w * SS / 2, w * SS / 2 - 4.4 * SS), (w * SS / 2 + 4.2 * SS, w * SS / 2 + 3 * SS),
               (w * SS / 2 - 4.2 * SS, w * SS / 2 + 3 * SS)], fill=(255, 230, 140, 255))
    save(img, "coin.png", w, w)

    # blueprint
    w, h = 30, 30
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([3 * SS, 3 * SS, 27 * SS, 27 * SS], radius=3 * SS,
                        fill=(40, 90, 200, 255), outline=(150, 200, 255, 255), width=int(1.2 * SS))
    pts = to_px(mirror_pts([(0.0, -0.55), (0.25, 0.1), (0.45, 0.4), (0.0, 0.3)]), w, h)
    d.polygon(pts, outline=(220, 240, 255, 255), width=int(0.9 * SS))
    save(img, "blueprint.png", w, h)

    # soft particle glow (white, tinted in engine)
    img = radial_glow(64, 64, (255, 255, 255), power=2.0)
    save(img, "particle_glow.png", 64, 64)


# ---------------------------------------------------------------- gates
def make_gates():
    def pylon(img, cx, cy, pw, ph, base, light):
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2],
                            radius=pw * 0.35, fill=base + (255,), outline=light + (255,),
                            width=int(1.2 * SS))
        ellipse(img, cx, cy - ph * 0.28, pw * 0.18, pw * 0.18, light + (255,))
        ellipse(img, cx, cy + ph * 0.28, pw * 0.18, pw * 0.18, light + (255,))

    # static buff gate: golden field
    w, h = 220, 70
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    fx0, fx1 = 26 * SS, (w - 26) * SS
    fy0, fy1 = 12 * SS, (h - 12) * SS
    steps = 40
    for i in range(steps):
        t = i / (steps - 1)
        a = int(90 + 60 * math.sin(t * math.pi))
        d.rectangle([fx0 + (fx1 - fx0) * t, fy0, fx0 + (fx1 - fx0) * (t + 1.0 / steps), fy1],
                    fill=(255, 200, 80, a))
    d.rectangle([fx0, fy0, fx1, fy0 + 2 * SS], fill=(255, 230, 150, 230))
    d.rectangle([fx0, fy1 - 2 * SS, fx1, fy1], fill=(255, 230, 150, 230))
    pylon(img, 14 * SS, h * SS / 2, 18 * SS, 58 * SS, (110, 80, 30), (255, 220, 130))
    pylon(img, (w - 14) * SS, h * SS / 2, 18 * SS, 58 * SS, (110, 80, 30), (255, 220, 130))
    save(img, "gate_static.png", w, h)

    # target gate: red-violet, with target rings
    w, h = 150, 70
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    fx0, fx1 = 22 * SS, (w - 22) * SS
    fy0, fy1 = 12 * SS, (h - 12) * SS
    for i in range(40):
        t = i / 39
        a = int(80 + 55 * math.sin(t * math.pi))
        d.rectangle([fx0 + (fx1 - fx0) * t, fy0, fx0 + (fx1 - fx0) * (t + 1 / 40), fy1],
                    fill=(255, 90, 130, a))
    cx, cy = w * SS / 2, h * SS / 2
    for r, col in [(16, (255, 230, 240)), (10, (255, 120, 150)), (5, (255, 255, 255))]:
        ellipse(img, cx, cy, r * SS, r * SS, None, outline=col + (240,), ow=1.4)
    pylon(img, 12 * SS, cy, 16 * SS, 54 * SS, (120, 35, 60), (255, 150, 180))
    pylon(img, (w - 12) * SS, cy, 16 * SS, 54 * SS, (120, 35, 60), (255, 150, 180))
    save(img, "gate_target.png", w, h)


# ---------------------------------------------------------------- background
def make_background():
    w, h = 540, 960
    img = Image.new("RGBA", (w, h), (10, 10, 26, 255))
    d = ImageDraw.Draw(img)
    # vertical deep gradient
    for y in range(h):
        t = y / (h - 1)
        c = (int(10 + 8 * t), int(10 + 4 * t), int(26 + 14 * t))
        d.line([(0, y), (w, y)], fill=c + (255,))

    def wrapped_ellipse(layer, cx, cy, rx, ry, col):
        dd = ImageDraw.Draw(layer)
        for oy in (-h, 0, h):
            dd.ellipse([cx - rx, cy + oy - ry, cx + rx, cy + oy + ry], fill=col)

    # nebula blobs (wrapped vertically for tiling)
    neb = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for _ in range(14):
        cx, cy = random.uniform(0, w), random.uniform(0, h)
        rx, ry = random.uniform(80, 220), random.uniform(60, 180)
        col = random.choice([(90, 40, 140), (30, 80, 140), (140, 40, 100), (20, 100, 120)])
        wrapped_ellipse(neb, cx, cy, rx, ry, col + (28,))
    neb = neb.filter(ImageFilter.GaussianBlur(60))
    img.alpha_composite(neb)

    # stars, wrapped
    stars = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stars)
    for _ in range(220):
        x, y = random.uniform(0, w), random.uniform(0, h)
        r = random.choice([0.6, 0.8, 1.0, 1.3, 1.8])
        a = random.randint(90, 255)
        col = random.choice([(255, 255, 255), (200, 220, 255), (255, 230, 200)])
        for oy in (-h, 0, h):
            sd.ellipse([x - r, y + oy - r, x + r, y + oy + r], fill=col + (a,))
    # few bright stars with glow
    for _ in range(10):
        x, y = random.uniform(0, w), random.uniform(0, h)
        for oy in (-h, 0, h):
            sd.ellipse([x - 4, y + oy - 4, x + 4, y + oy + 4], fill=(255, 255, 255, 40))
            sd.ellipse([x - 1.6, y + oy - 1.6, x + 1.6, y + oy + 1.6], fill=(255, 255, 255, 230))
    img.alpha_composite(stars)
    img.save(os.path.join(OUT, "bg_space.png"))
    print("saved bg_space.png")


# ---------------------------------------------------------------- equipment icons
def make_equipment():
    def base_icon():
        w = 64
        img = canvas(w, w)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([2 * SS, 2 * SS, 62 * SS, 62 * SS], radius=10 * SS,
                            fill=(30, 34, 52, 255), outline=(90, 100, 140, 255), width=int(1.6 * SS))
        return img, d, w

    # engine: nozzle + flame
    img, d, w = base_icon()
    d.polygon(to_px(mirror_pts([(0.0, -0.52), (0.28, -0.2), (0.4, 0.25), (0.0, 0.25)]), w, w),
              fill=(150, 160, 185, 255), outline=(220, 230, 250, 255), width=int(1.2 * SS))
    fl = radial_glow(30, 30, (120, 200, 255), power=1.3)
    img.alpha_composite(fl, (int(w * SS / 2 - 15 * SS), int(w * SS * 0.5)))
    save(img, "eq_engine.png", w, w)

    # armor: shield
    img, d, w = base_icon()
    d.polygon(to_px(mirror_pts([(0.0, -0.55), (0.42, -0.35), (0.4, 0.15), (0.0, 0.58)]), w, w),
              fill=(80, 170, 120, 255), outline=(180, 255, 210, 255), width=int(1.4 * SS))
    d.line(to_px([(0.0, -0.55), (0.0, 0.58)], w, w), fill=(180, 255, 210, 200), width=int(1.0 * SS))
    save(img, "eq_armor.png", w, w)

    # weapon chip: microchip
    img, d, w = base_icon()
    d.rounded_rectangle([18 * SS, 18 * SS, 46 * SS, 46 * SS], radius=3 * SS,
                        fill=(200, 120, 60, 255), outline=(255, 200, 140, 255), width=int(1.4 * SS))
    for i in range(4):
        p = 21 + i * 7
        d.line([(p * SS, 10 * SS), (p * SS, 18 * SS)], fill=(255, 200, 140, 255), width=int(1.2 * SS))
        d.line([(p * SS, 46 * SS), (p * SS, 54 * SS)], fill=(255, 200, 140, 255), width=int(1.2 * SS))
        d.line([(10 * SS, p * SS), (18 * SS, p * SS)], fill=(255, 200, 140, 255), width=int(1.2 * SS))
        d.line([(46 * SS, p * SS), (54 * SS, p * SS)], fill=(255, 200, 140, 255), width=int(1.2 * SS))
    d.ellipse([28 * SS, 28 * SS, 36 * SS, 36 * SS], fill=(255, 230, 170, 255))
    save(img, "eq_chip.png", w, w)

    # radar: dish + sweep
    img, d, w = base_icon()
    d.pieslice([12 * SS, 12 * SS, 52 * SS, 52 * SS], 200, 340, fill=(70, 130, 220, 255),
               outline=(160, 210, 255, 255), width=int(1.4 * SS))
    d.line([(32 * SS, 32 * SS), (46 * SS, 14 * SS)], fill=(200, 240, 255, 255), width=int(1.6 * SS))
    d.ellipse([30 * SS, 30 * SS, 34 * SS, 34 * SS], fill=(230, 250, 255, 255))
    for r in (8, 14, 20):
        d.arc([(32 - r) * SS, (32 - r) * SS, (32 + r) * SS, (32 + r) * SS], 300, 60,
              fill=(160, 210, 255, 180), width=int(1.0 * SS))
    save(img, "eq_radar.png", w, w)


def make_contact_sheet():
    files = sorted(f for f in os.listdir(OUT) if f.endswith(".png") and f != "sheet.png")
    cell = 130
    cols = 6
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * cell + 20), (24, 24, 36, 255))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        img = Image.open(os.path.join(OUT, f)).convert("RGBA")
        img.thumbnail((cell - 26, cell - 26))
        x, y = (i % cols) * cell, (i // cols) * cell
        sheet.alpha_composite(img, (x + (cell - img.width) // 2, y + (cell - img.height) // 2))
        d.text((x + 4, y + cell - 14), f[:-4], fill=(200, 200, 220, 255))
    sheet.save(os.path.join(OUT, "sheet.png"))
    print("saved sheet.png")


if __name__ == "__main__":
    make_ships()
    make_boss()
    make_projectiles()
    make_gates()
    make_background()
    make_equipment()
    make_contact_sheet()
