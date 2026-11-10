#!/usr/bin/env python3
"""Particle emitters of the bonus effect variants (bomb, rocket, fireworks) under Vfx of GameScreen.proto.

Every spec below makes a pool of emitters S_<name>_<i>: WordFallVfx plays them in turn, a rocket trail takes one
for the flight. The game picks a variant by WordFallFxView.bombStyle / rocketStyle / fireworksStyle (0 - the
original effects, which stay as they are). Rerunning rebuilds the S_ emitters with the same ids.

    python3 Tools/WordFall/build_fx_variants.py
"""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "Assets"
PROTO = ASSETS / "WordFall" / "Prototypes" / "GameScreen.proto"
SPRITES = "WordFall/Sprites/"
ADDITIVE = "WordFall/Materials/Additive.mat"

RNG = random.Random("wordfall-fx-variants")

WHITE = (255, 255, 255, 255)
GOLD = (255, 200, 80)
ORANGE = (245, 140, 45)
CREAM = (255, 242, 214)


def asset_ref(path):
    meta = json.loads((ASSETS / (path + ".meta")).read_text())["Value"]
    return {"id": meta["mId"], "path": path}


def sprite_path(name):
    return name if "/" in name else SPRITES + name + ".png"


def uid():
    return RNG.getrandbits(63) | 1


def gradient(keys):
    out = []
    for pos, color in keys:
        key = {"uid": uid()}
        if tuple(color) != WHITE:
            key["color"] = {"r": color[0], "g": color[1], "b": color[2], "a": color[3]}
        if pos:
            key["position"] = float(pos)
        out.append(key)
    return {"Type": "o2::ColorGradient", "Value": {"mKeys": out}}


def curve(keys):
    """straight segments between the keys: the supports of a key sit on it"""
    out = []
    for pos, value in keys:
        key = {"uid": uid(), "value": float(value)}
        if pos:
            key["position"] = float(pos)
        out.append(key)
    return {"Type": "o2::Curve", "Value": {"mKeys": out}}


def E(name, sprite, pool=1, count=10, emit=0.1, rate=None, life=0.6, life_range=0.0, size=0.3, size_range=0.1,
      width=1.0, width_range=0.0, speed=300.0, speed_range=150.0, direction=0.0, direction_range=360.0,
      angle=0.0, angle_range=360.0, area=10.0, shell=False, gravity=None, damping=None, colors=None,
      random_colors=None, size_curve=None, stretch=None, additive=False, depth=70.0):
    return dict(locals())


def colors_fade(*keys):
    return list(keys)


# ---------------------------------------------------------------- bomb

BOMB = [
    # 1 - a warm blast: a golden fireball, chips of light wood, golden embers, cream smoke
    E("B1_Fire", "vfx_puff", count=8, emit=0.05, life=0.55, life_range=0.1, size=0.42, size_range=0.12, speed=170,
      speed_range=90, damping=3.0, depth=71,
      colors=[(0, (255, 236, 150, 255)), (0.3, (250, 170, 60, 240)), (0.7, (220, 110, 40, 180)), (1, (190, 90, 40, 0))],
      size_curve=[(0, 0.5), (0.3, 1.2), (1, 1.4)]),
    E("B1_Chips", "vfx_wood_chip", count=16, emit=0.05, life=1.0, life_range=0.3, size=0.46, size_range=0.16,
      speed=660, speed_range=260, gravity=-1500, damping=1.2,
      colors=[(0, WHITE), (0.75, WHITE), (1, (255, 255, 255, 0))]),
    E("B1_Embers", "vfx_sparkle", count=18, emit=0.06, life=0.7, life_range=0.3, size=0.16, size_range=0.08,
      speed=430, speed_range=240, gravity=-500, damping=2.0, stretch=(0.002, 2.0),
      colors=[(0, (255, 236, 160, 255)), (0.5, (255, 160, 50, 230)), (1, (230, 90, 30, 0))]),
    E("B1_Smoke", "vfx_puff", count=7, emit=0.06, life=1.0, life_range=0.3, size=0.42, size_range=0.14,
      speed=95, speed_range=60, gravity=60, damping=2.5, depth=66,
      colors=[(0, (255, 246, 228, 0)), (0.15, (250, 236, 212, 210)), (1, (238, 222, 196, 0))],
      size_curve=[(0, 0.6), (1, 1.4)]),

    # 2 - a rainbow star: the star of the progress bar pops and scatters small rainbow stars
    E("B2_Stars", "vfx_star_glow", count=16, emit=0.03, life=0.85, life_range=0.2, size=0.38, size_range=0.1,
      speed=760, speed_range=160, gravity=-320, damping=2.8,
      colors=[(0, WHITE), (0.72, WHITE), (1, (255, 255, 255, 0))], size_curve=[(0, 0.3), (0.12, 1.15), (0.3, 1.0), (1, 0.45)]),
    E("B2_Stars2", "vfx_star_glow", count=10, emit=0.05, life=1.0, life_range=0.25, size=0.24, size_range=0.06,
      speed=300, speed_range=120, gravity=-200, damping=2.2,
      colors=[(0, WHITE), (0.7, WHITE), (1, (255, 255, 255, 0))], size_curve=[(0, 0.4), (0.2, 1.0), (1, 0.5)]),
    E("B2_Twinkle", "vfx_star4", count=16, emit=0.08, life=0.6, life_range=0.25, size=0.14, size_range=0.06,
      speed=270, speed_range=210, damping=2.0, additive=True,
      colors=[(0, WHITE), (0.5, (255, 240, 180, 255)), (1, (255, 220, 140, 0))]),

    # 3 - a party popper: confetti in the colours of the tiles shoots up, parchment dust
    E("B3_Confetti", "vfx_confetti", count=34, emit=0.05, life=1.6, life_range=0.4, size=0.32, size_range=0.1,
      width=0.7, width_range=0.4, speed=920, speed_range=320, direction=90, direction_range=150,
      gravity=-950, damping=1.4,
      random_colors=([(0, (250, 190, 70, 255)), (0.8, (250, 190, 70, 255)), (1, (250, 190, 70, 0))],
                     [(0, (240, 115, 45, 255)), (0.8, (240, 115, 45, 255)), (1, (240, 115, 45, 0))])),
    E("B3_Confetti2", "vfx_confetti", count=24, emit=0.05, life=1.6, life_range=0.4, size=0.3, size_range=0.1,
      width=0.7, width_range=0.4, speed=820, speed_range=300, direction=90, direction_range=170,
      gravity=-950, damping=1.4,
      random_colors=([(0, (255, 244, 214, 255)), (0.8, (255, 244, 214, 255)), (1, (255, 244, 214, 0))],
                     [(0, (225, 70, 60, 255)), (0.8, (225, 70, 60, 255)), (1, (225, 70, 60, 0))])),
    E("B3_Dust", "vfx_puff", count=6, emit=0.05, life=0.8, life_range=0.2, size=0.48, size_range=0.12,
      speed=130, speed_range=70, damping=3.0, depth=66,
      colors=[(0, (245, 226, 190, 0)), (0.15, (245, 226, 190, 200)), (1, (235, 214, 176, 0))],
      size_curve=[(0, 0.5), (1, 1.3)]),

    # 4 - a shockwave: stretched golden sparks and a dust ring run over the board
    E("B4_Sparks", "vfx_comet", count=16, emit=0.04, life=0.45, life_range=0.12, size=0.26, size_range=0.08,
      speed=950, speed_range=320, damping=3.5, additive=True, stretch=(0.0015, 2.2),
      colors=[(0, (255, 252, 226, 255)), (0.4, (255, 190, 80, 240)), (1, (240, 110, 40, 0))]),
    E("B4_Dust", "vfx_puff", count=14, emit=0.04, life=0.7, life_range=0.15, size=0.26, size_range=0.08,
      speed=330, speed_range=80, damping=4.0, area=40, shell=True, depth=66,
      colors=[(0, (225, 196, 150, 0)), (0.1, (225, 196, 150, 190)), (1, (215, 184, 140, 0))],
      size_curve=[(0, 0.6), (1, 1.5)]),

    # 5 - a cartoon boom: puffy cream clouds and golden stars
    E("B5_Puffs", "vfx_puff", count=9, emit=0.05, life=0.95, life_range=0.25, size=0.46, size_range=0.12,
      speed=320, speed_range=130, damping=3.5, depth=67,
      colors=[(0, (255, 250, 240, 255)), (0.7, (244, 234, 218, 240)), (1, (240, 228, 210, 0))],
      size_curve=[(0, 0.5), (0.3, 1.3), (1, 1.1)]),
    E("B5_Stars", "vfx_star_gold", count=9, emit=0.05, life=1.0, life_range=0.2, size=0.3, size_range=0.08,
      speed=470, speed_range=140, gravity=-300, damping=2.2,
      colors=[(0, WHITE), (0.75, WHITE), (1, (255, 255, 255, 0))]),
]

# ---------------------------------------------------------------- rockets: trails (a pool per rocket in flight) and hits

TRAIL = dict(emit=3.0, area=6, damping=1.0)
ROCKET = [
    # 1 - a golden comet
    E("R1_Trail", "vfx_sparkle", pool=10, rate=70, count=60, life=0.45, life_range=0.15, size=0.2, size_range=0.06,
      speed=30, speed_range=30, colors=[(0, (255, 248, 210, 255)), (0.4, (255, 186, 70, 220)), (1, (240, 110, 40, 0))],
      size_curve=[(0, 1.0), (1, 0.3)], **TRAIL),
    E("R1_TrailStar", "vfx_star_gold", pool=10, rate=12, count=12, life=0.55, life_range=0.15, size=0.14, size_range=0.04,
      speed=40, speed_range=40, colors=[(0, WHITE), (0.6, WHITE), (1, (255, 255, 255, 0))], size_curve=[(0, 1.0), (1, 0.4)], **TRAIL),
    E("R1_Hit", "vfx_star_gold", pool=5, count=10, emit=0.04, life=0.65, life_range=0.15, size=0.26, size_range=0.06,
      speed=320, speed_range=110, damping=2.6, colors=[(0, WHITE), (0.7, WHITE), (1, (255, 255, 255, 0))]),

    # 2 - a rainbow star
    E("R2_Trail", "vfx_star_glow", pool=10, rate=48, count=34, life=0.6, life_range=0.15, size=0.15, size_range=0.04,
      speed=45, speed_range=45, gravity=-140, colors=[(0, WHITE), (0.55, WHITE), (1, (255, 255, 255, 0))],
      size_curve=[(0, 1.2), (0.3, 0.9), (1, 0.25)], **TRAIL),
    E("R2_Launch", "vfx_star_glow", pool=10, count=6, emit=0.03, life=0.45, life_range=0.1, size=0.18, size_range=0.05,
      speed=260, speed_range=80, damping=3.2, colors=[(0, WHITE), (0.6, WHITE), (1, (255, 255, 255, 0))],
      size_curve=[(0, 0.4), (0.2, 1.0), (1, 0.5)]),
    E("R2_Hit", "vfx_star_glow", pool=8, count=12, emit=0.03, life=0.65, life_range=0.15, size=0.26, size_range=0.06,
      speed=460, speed_range=130, gravity=-260, damping=2.8, colors=[(0, WHITE), (0.7, WHITE), (1, (255, 255, 255, 0))],
      size_curve=[(0, 0.3), (0.12, 1.15), (0.3, 1.0), (1, 0.5)]),

    # 3 - a popper rocket: confetti behind it, a confetti burst on the hit
    E("R3_Trail", "vfx_confetti", pool=10, rate=45, count=32, life=0.75, life_range=0.2, size=0.13, size_range=0.04,
      width=0.7, width_range=0.4, speed=60, speed_range=60, gravity=-260,
      random_colors=([(0, (250, 190, 70, 255)), (0.75, (250, 190, 70, 255)), (1, (250, 190, 70, 0))],
                     [(0, (225, 80, 60, 255)), (0.75, (240, 130, 50, 255)), (1, (240, 130, 50, 0))]), **{k: v for k, v in TRAIL.items() if k != "damping"}, damping=1.2),
    E("R3_Hit", "vfx_confetti", pool=5, count=16, emit=0.04, life=1.0, life_range=0.3, size=0.18, size_range=0.06,
      width=0.7, width_range=0.4, speed=420, speed_range=180, direction=90, direction_range=200, gravity=-800, damping=1.8,
      random_colors=([(0, (250, 190, 70, 255)), (0.8, (250, 190, 70, 255)), (1, (250, 190, 70, 0))],
                     [(0, (255, 244, 214, 255)), (0.8, (240, 115, 45, 255)), (1, (240, 115, 45, 0))])),

    # 4 - a jet: a bright thin streak, a ring of smoke at the start, wood chips on the hit
    E("R4_Trail", "vfx_comet", pool=2, rate=70, count=30, life=0.25, life_range=0.06, size=0.2, size_range=0.05,
      speed=10, speed_range=10, additive=True, colors=[(0, (255, 252, 230, 255)), (0.5, (255, 200, 100, 200)), (1, (255, 150, 60, 0))],
      **TRAIL),
    E("R4_Launch", "vfx_puff", pool=2, count=10, emit=0.04, life=0.6, life_range=0.15, size=0.2, size_range=0.05,
      speed=240, speed_range=60, damping=4.0, area=20, shell=True, depth=66,
      colors=[(0, (240, 230, 214, 0)), (0.1, (240, 230, 214, 220)), (1, (230, 218, 200, 0))], size_curve=[(0, 0.6), (1, 1.4)]),
    E("R4_Hit", "vfx_wood_chip", pool=2, count=8, emit=0.04, life=0.7, life_range=0.2, size=0.28, size_range=0.1,
      speed=420, speed_range=180, gravity=-1400, damping=1.2, colors=[(0, WHITE), (0.75, WHITE), (1, (255, 255, 255, 0))]),

    # 5 - a cartoon rocket: puffy cream clouds behind, a boom cloud on the hit
    E("R5_Trail", "vfx_puff", pool=2, rate=22, count=20, life=0.9, life_range=0.2, size=0.18, size_range=0.05,
      speed=20, speed_range=20, depth=66, colors=[(0, (255, 250, 242, 230)), (0.6, (246, 236, 222, 200)), (1, (240, 228, 212, 0))],
      size_curve=[(0, 0.6), (1, 1.5)], **TRAIL),
    E("R5_Hit", "vfx_puff", pool=2, count=6, emit=0.04, life=0.7, life_range=0.2, size=0.28, size_range=0.08,
      speed=200, speed_range=80, damping=3.5, depth=67,
      colors=[(0, (255, 250, 240, 255)), (0.7, (244, 234, 218, 230)), (1, (240, 228, 210, 0))], size_curve=[(0, 0.5), (0.3, 1.2), (1, 1.0)]),

    # rockets of the salvos: 6 - falling stars, 7 - a dotted line of sparkles
    E("R6_Trail", "vfx_star_gold", pool=10, rate=20, count=18, life=0.6, life_range=0.15, size=0.11, size_range=0.04,
      speed=30, speed_range=30, gravity=-220, colors=[(0, WHITE), (0.6, WHITE), (1, (255, 255, 255, 0))], **TRAIL),
    E("R6_Hit", "vfx_sparkle", pool=5, count=10, emit=0.04, life=0.5, life_range=0.15, size=0.16, size_range=0.06,
      speed=260, speed_range=100, damping=2.5,
      colors=[(0, (255, 248, 210, 255)), (0.5, (255, 196, 80, 230)), (1, (240, 120, 40, 0))]),
    E("R7_Trail", "vfx_sparkle", pool=10, rate=26, count=26, life=0.8, life_range=0.1, size=0.13, size_range=0.03,
      speed=0, speed_range=0, colors=[(0, (255, 255, 255, 255)), (0.5, (255, 226, 150, 240)), (1, (255, 180, 80, 0))],
      **TRAIL),
    E("R7_Hit", "vfx_star4", pool=5, count=10, emit=0.04, life=0.5, life_range=0.15, size=0.15, size_range=0.05,
      speed=240, speed_range=80, damping=2.4, additive=True, colors=[(0, WHITE), (0.5, (255, 236, 170, 255)), (1, (255, 210, 120, 0))]),
]

# ---------------------------------------------------------------- fireworks: the burst on its own cell

FIREWORKS = [
    # 1 - a golden chrysanthemum
    E("F1_Burst", "vfx_comet", count=46, emit=0.03, life=1.0, life_range=0.2, size=0.34, size_range=0.06,
      speed=780, speed_range=90, gravity=-300, damping=2.0, stretch=(0.0016, 2.2),
      colors=[(0, (255, 250, 222, 255)), (0.4, (255, 204, 90, 245)), (0.8, (240, 124, 40, 200)), (1, (220, 90, 30, 0))]),
    E("F1_Glitter", "vfx_sparkle", count=30, emit=0.7, rate=45, life=0.4, life_range=0.15, size=0.16, size_range=0.05,
      speed=10, speed_range=10, area=320, colors=[(0, (255, 248, 210, 0)), (0.3, (255, 236, 170, 255)), (1, (255, 200, 100, 0))]),

    # 2 - a rainbow salute of stars
    E("F2_Burst", "vfx_star_glow", count=30, emit=0.03, life=1.1, life_range=0.2, size=0.36, size_range=0.08,
      speed=820, speed_range=90, gravity=-300, damping=2.4, colors=[(0, WHITE), (0.75, WHITE), (1, (255, 255, 255, 0))],
      size_curve=[(0, 0.3), (0.1, 1.15), (0.3, 1.0), (1, 0.55)]),
    E("F2_Inner", "vfx_star_glow", count=14, emit=0.06, life=1.1, life_range=0.25, size=0.26, size_range=0.06,
      speed=360, speed_range=120, gravity=-220, damping=2.0, colors=[(0, WHITE), (0.7, WHITE), (1, (255, 255, 255, 0))],
      size_curve=[(0, 0.4), (0.2, 1.0), (1, 0.5)]),

    # 3 - a star rain (a willow): long golden sparks drooping down, then a crackle
    E("F3_Willow", "vfx_sparkle", count=48, emit=0.04, life=1.8, life_range=0.4, size=0.24, size_range=0.06,
      speed=540, speed_range=100, gravity=-430, damping=1.6, stretch=(0.001, 1.6),
      colors=[(0, (255, 250, 220, 255)), (0.3, (255, 210, 110, 245)), (0.75, (245, 150, 50, 200)), (1, (220, 100, 30, 0))]),
    E("F3_Crackle", "vfx_star4", count=30, emit=0.9, rate=34, life=0.25, life_range=0.1, size=0.16, size_range=0.05,
      speed=10, speed_range=10, area=360, additive=True, colors=[(0, WHITE), (1, (255, 240, 200, 0))]),

    # 4 - a confetti salute
    E("F4_Confetti", "vfx_confetti", count=40, emit=0.04, life=1.6, life_range=0.4, size=0.3, size_range=0.1,
      width=0.7, width_range=0.4, speed=840, speed_range=300, gravity=-760, damping=1.6,
      random_colors=([(0, (250, 190, 70, 255)), (0.8, (250, 190, 70, 255)), (1, (250, 190, 70, 0))],
                     [(0, (240, 115, 45, 255)), (0.8, (240, 115, 45, 255)), (1, (240, 115, 45, 0))])),
    E("F4_Confetti2", "vfx_confetti", count=28, emit=0.04, life=1.6, life_range=0.4, size=0.28, size_range=0.1,
      width=0.7, width_range=0.4, speed=760, speed_range=280, gravity=-760, damping=1.6,
      random_colors=([(0, (255, 244, 214, 255)), (0.8, (255, 244, 214, 255)), (1, (255, 244, 214, 0))],
                     [(0, (225, 70, 60, 255)), (0.8, (225, 70, 60, 255)), (1, (225, 70, 60, 0))])),

    # 5 - rings: sparkles on two rings one after the other
    E("F5_RingA", "vfx_star4", count=22, emit=0.03, life=0.6, life_range=0.15, size=0.2, size_range=0.05,
      speed=110, speed_range=30, damping=2.0, area=230, shell=True, additive=True,
      colors=[(0, WHITE), (0.5, (255, 236, 170, 255)), (1, (255, 200, 110, 0))]),
    E("F5_RingB", "vfx_sparkle", count=32, emit=0.03, life=0.65, life_range=0.15, size=0.19, size_range=0.05,
      speed=140, speed_range=40, damping=2.0, area=420, shell=True,
      colors=[(0, (255, 250, 230, 255)), (0.5, (255, 206, 100, 240)), (1, (240, 130, 50, 0))]),
]

SPECS = BOMB + ROCKET + FIREWORKS


def emitter_actor(spec, index):
    s = spec
    rate = s["rate"] if s["rate"] is not None else s["count"]/s["emit"]
    lifetime = s["life"]
    effects = []
    if s["gravity"] is not None:
        effects.append({"Type": "o2::ParticlesGravityEffect", "Value": {"mGravity": {"x": 0.0, "y": float(s["gravity"]), "z": 0.0}}})
    if s["damping"] is not None:
        effects.append({"Type": "o2::ParticlesDampingEffect", "Value": {"mDamping": float(s["damping"])}})
    if s["random_colors"]:
        a, b = s["random_colors"]
        effects.append({"Type": "o2::ParticlesRandomColorEffect", "Value": {"colorGradientA": gradient(a), "colorGradientB": gradient(b)}})
    elif s["colors"]:
        effects.append({"Type": "o2::ParticlesColorEffect", "Value": {"colorGradient": gradient(s["colors"])}})
    if s["size_curve"]:
        effects.append({"Type": "o2::ParticlesSizeEffect", "Value": {"curve": curve(s["size_curve"])}})
    if s["stretch"]:
        effects.append({"Type": "o2::ParticlesVelocityStretchEffect", "Value": {"mStretch": s["stretch"][0], "mMaxStretch": s["stretch"][1]}})

    component = {
        "mDuration": s["emit"] + lifetime + s["life_range"]*0.5,
        "mEndTime": s["emit"] + lifetime + s["life_range"]*0.5,
        "mParticlesSource": {"Type": "o2::SingleSpriteParticleSource", "Value": {"image": asset_ref(sprite_path(s["sprite"]))}},
        "mShape": {"Type": "o2::CircleParticlesEmitterShape", "Value": {}},
        "mEffects": effects,
        "mParticlesNumLimit": int(s["count"]),
        "mIsParticlesRelative": False,
        "mEmissionDuration": float(s["emit"]),
        "mParticlesLifetime": float(lifetime),
        "mParticlesLifetimeRange": float(s["life_range"]),
        "mEmitParticlesPerSecond": float(rate),
        "mInitialAngle": float(s["angle"]),
        "mInitialAngleRange": float(s["angle_range"]),
        "mInitialSize": float(s["size"]),
        "mInitialSizeRange": float(s["size_range"]),
        "mInitialWidthScale": float(s["width"]),
        "mInitialWidthScaleRange": float(s["width_range"]),
        "mInitialSpeed": float(s["speed"]),
        "mInitialSpeedRangle": float(s["speed_range"]),
        "mInitialMoveDirection": float(s["direction"]),
        "mInitialMoveDirectionRange": float(s["direction_range"]),
        "mId": uid(),
        "mSize": {"x": float(s["area"]), "y": float(s["area"]), "z": 0.0},
        "mPivot": {"x": 0.5, "y": 0.5, "z": 0.0},
    }
    if s["shell"]:
        component["mEmitParticlesFromShell"] = True
    if s["additive"]:
        component = {"mMaterialAsset": asset_ref(ADDITIVE), **component}

    return {"Type": "o2::Actor", "Data": {
        "mDrawingDepth": float(s["depth"]), "mInheritDrawingDepthFromParent": False,
        "mName": "S_%s_%d" % (s["name"], index),
        "mSceneLayer": {"Type": "o2::SceneLayer", "Value": {"mName": "UI"}},
        "Id": uid(),
        "Transform": {"size": {"x": 10.0, "y": 10.0, "z": 0.0}, "pivot": {"x": 0.5, "y": 0.5, "z": 0.0}},
        "Components": [{"Type": "o2::ParticlesEmitterComponent", "Data": component}]}}


def data(node):
    return node["Data"] if "Data" in node else node["Value"]


def find(node, name):
    if data(node).get("mName") == name:
        return node
    for ch in data(node).get("Children") or []:
        found = find(ch, name)
        if found:
            return found
    return None


def main():
    raw = PROTO.read_text(encoding="utf-8")
    doc = json.loads(raw)
    vfx = find(doc["mActor"], "Vfx")
    children = [ch for ch in data(vfx)["Children"] if not data(ch).get("mName", "").startswith("S_")]
    count = 0
    for spec in SPECS:
        for i in range(spec["pool"]):
            children.append(emitter_actor(spec, i))
            count += 1
    data(vfx)["Children"] = children
    PROTO.write_text(json.dumps(doc, ensure_ascii="\\u0" in raw, indent=4) + "\n", encoding="utf-8")
    print("built", len(SPECS), "effect emitters,", count, "with the pools, under", PROTO.relative_to(ROOT))


if __name__ == "__main__":
    main()
