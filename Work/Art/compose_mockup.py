#!/usr/bin/env python3
"""Composite the generated sprites into theoretical game screens (gameplay + hangar)."""
import os
from PIL import Image, ImageDraw, ImageFont

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sprites")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Concepts")
W, H = 540, 960


def sp(name):
    return Image.open(os.path.join(ART, name)).convert("RGBA")


def paste(base, img, cx, cy, scale=1.0, angle=0):
    if scale != 1.0:
        img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.LANCZOS)
    if angle:
        img = img.rotate(angle, expand=True, resample=Image.BICUBIC)
    base.alpha_composite(img, (int(cx - img.width / 2), int(cy - img.height / 2)))


def font(size):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", size)
    except Exception:
        return ImageFont.load_default()


def text(d, xy, s, size=18, fill=(255, 255, 255, 255), anchor="mm"):
    d.text(xy, s, font=font(size), fill=fill, anchor=anchor)


def gameplay():
    img = sp("bg_space.png").resize((W, H))
    d = ImageDraw.Draw(img)
    # gates
    paste(img, sp("gate_static.png"), 200, 300)
    text(d, (200, 300 - 45), "+10% DMG", 16, (255, 220, 130, 255))
    paste(img, sp("gate_target.png"), 400, 180)
    text(d, (400, 180 - 45), "HP 60", 14, (255, 160, 180, 255))
    # enemies
    for (x, y, s, n) in [(120, 120, 1.0, "enemy_drone.png"), (270, 90, 1.0, "enemy_striker.png"),
                         (420, 110, 1.0, "enemy_drone.png"), (200, 200, 1.0, "enemy_tank.png")]:
        paste(img, sp(n), x, y)
    text(d, (200, 148), "HP 25 000 / 25 000", 15, (255, 210, 230, 255))
    # orbs flying to player
    for (x, y) in [(300, 500), (330, 540), (280, 560), (350, 580), (310, 610)]:
        paste(img, sp("orb_xp.png"), x, y)
    # coins
    paste(img, sp("coin.png"), 150, 450)
    # player bullets
    for (x, y) in [(270, 620), (250, 560), (290, 560), (270, 500)]:
        paste(img, sp("bullet_player.png"), x, y)
    paste(img, sp("rocket.png"), 380, 520, angle=-20)
    # player ship
    paste(img, sp("ship_viper.png"), 270, 760)
    # damage popups
    text(d, (240, 170), "128", 20, (255, 235, 130, 255))
    text(d, (300, 210), "256", 22, (255, 200, 90, 255))
    # HUD: top bars
    d.rectangle([10, 10, W - 10, 30], outline=(120, 200, 255, 200), width=2)
    d.rectangle([12, 12, 12 + (W - 24) * 0.45, 28], fill=(60, 200, 255, 200))
    text(d, (W / 2, 20), "LVL 3", 14)
    paste(img, sp("coin.png"), 30, 50, 0.8)
    text(d, (52, 50), "1 250", 16, (255, 220, 120, 255), anchor="lm")
    text(d, (W - 20, 50), "WAVE 2/5", 15, (180, 200, 255, 255), anchor="rm")
    # weapon damage plate
    d.rounded_rectangle([10, H - 60, 210, H - 15], radius=8, fill=(20, 25, 45, 180),
                        outline=(90, 110, 160, 200), width=2)
    text(d, (110, H - 48), "CANNON 124 DMG  x2", 13, (140, 230, 255, 255))
    text(d, (110, H - 28), "ROCKET 260 DMG", 13, (255, 190, 130, 255))
    img.save(os.path.join(OUT, "mock_gameplay.png"))
    print("mock_gameplay.png")


def hangar():
    img = sp("bg_space.png").resize((W, H)).point(lambda p: p * 0.7)
    img = img.convert("RGBA")
    d = ImageDraw.Draw(img)
    text(d, (W / 2, 40), "HANGAR", 30, (200, 220, 255, 255))
    paste(img, sp("coin.png"), 30, 80, 0.9)
    text(d, (52, 80), "12 480", 18, (255, 220, 120, 255), anchor="lm")
    # ship on pedestal
    paste(img, sp("ship_viper.png"), W / 2, 220, 1.8)
    text(d, (W / 2, 320), "VIPER-X", 22, (150, 230, 255, 255))
    text(d, (W / 2, 345), "DMG 124   HP 500   ROCKET 260", 14, (200, 210, 235, 255))
    # fleet row
    for i, n in enumerate(["ship_viper.png", "ship_dreadnought.png", "ship_falcon.png", "ship_plasma.png"]):
        x = 90 + i * 120
        d.rounded_rectangle([x - 45, 375, x + 45, 465], radius=10, fill=(25, 30, 55, 200),
                            outline=(90, 110, 160, 220), width=2)
        paste(img, sp(n), x, 415, 0.7)
        text(d, (x, 452), ["OWNED", "3/10 BP", "0/10 BP", "5/15 BP"][i], 11, (180, 200, 230, 255))
    # upgrades
    y0 = 490
    for i, (nm, lv, cost) in enumerate([("HEALTH", 3, 120), ("MAIN ATTACK", 5, 340), ("ROCKET ATTACK", 2, 90),
                                        ("MAGNET RADIUS", 1, 60), ("OFFLINE INCOME", 0, 50)]):
        y = y0 + i * 58
        d.rounded_rectangle([15, y, W - 15, y + 48], radius=8, fill=(22, 27, 50, 210),
                            outline=(80, 95, 140, 220), width=2)
        text(d, (28, y + 24), nm + "  LV " + str(lv), 15, (210, 220, 245, 255), anchor="lm")
        d.rounded_rectangle([W - 150, y + 8, W - 25, y + 40], radius=6, fill=(50, 130, 90, 255))
        text(d, (W - 88, y + 24), f"{cost} ⓒ", 14, (230, 255, 230, 255))
    # equipment
    for i, n in enumerate(["eq_engine.png", "eq_armor.png", "eq_chip.png", "eq_radar.png"]):
        x = 90 + i * 120
        d.rounded_rectangle([x - 40, 800, x + 40, 880], radius=8, fill=(25, 30, 55, 200),
                            outline=[(150, 150, 160), (90, 200, 120), (80, 140, 240), (170, 90, 220)][i] + (255,),
                            width=3)
        paste(img, sp(n), x, 840, 0.9)
    # start button
    d.rounded_rectangle([W / 2 - 120, 900, W / 2 + 120, 950], radius=12, fill=(60, 170, 90, 255),
                        outline=(160, 255, 190, 255), width=3)
    text(d, (W / 2, 925), "START RUN", 22, (240, 255, 245, 255))
    img.save(os.path.join(OUT, "mock_hangar.png"))
    print("mock_hangar.png")


gameplay()
hangar()
