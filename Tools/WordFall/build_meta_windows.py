#!/usr/bin/env python3
"""Builds the meta windows of WordFall from the sprites of the UI kit, in the style of the windows imported from the
"Wordfall UI" pipeline (ContinueWindow: purple wooden frame, wooden header, red round close button, parchment inside):

  Assets/WordFall/UI/ShopWindow.proto         the bank: coin packs
  Assets/WordFall/UI/LevelStartWindow.proto   the level's goals and the bonuses to start it with
  Assets/WordFall/UI/LivesWindow.proto        lives: the timer of the next one, a refill for coins, +1 for an ad
  Assets/WordFall/UI/BoosterShopWindow.proto  a booster or a start bonus: what it does, a pack of them for coins
  Assets/WordFall/UI/QuitLevelWindow.proto    leaving a level costs a life: quit or play on
  Assets/WordFall/UI/SettingsWindow.proto     sound, music, language, the tutorial again

and adds the level's quit button to the game screen (GameScreen.proto: Screen/Hud/QuitButton) and a button over the
lives counter of the main screen (MainScreen.proto: top_hud/lives_counter/lives_button).

A window is a root widget the size of the ui camera's frame (1179x2556, the kit's iPhone 16) with a dimmer that
takes the clicks and a dialog in the middle. It opens and closes with its "visible" state: the clip fades the dimmer
in and pops the dialog - the motion lives in the prototype, the views only enable and disable the root.

Ids are derived from the names, so a rerun reproduces the files. Run from the project root:
    python3 Tools/WordFall/build_meta_windows.py
"""
import hashlib
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSETS = os.path.join(ROOT, 'Assets')

KIT = 'WordFall/UIKit/Sprites/'
GEN = 'Generated/UI/Screen_Resources/Sprites/'
WF = 'WordFall/Sprites/'
SEASON = 'WordFall/UI/VictoryWindow_Resources/Sprites/'

LILITA = '0222fdcc48b17041cfd0eceac59fe3c9'   # LilitaOne: the kit's display font (Latin)
ROBOTO = '215353645cf99c3138ec28e5d0c58db9'   # Roboto Bold: body text
STYLE_TITLE = 'WordFall/UIKit/FontStyles/text_dae0d727088036ba.fntstyle'    # header title, light gold on wood
STYLE_GOLD = 'WordFall/UIKit/FontStyles/text_f7dfe03d5880c43f.fntstyle'     # big gold numbers
STYLE_GREEN = 'WordFall/UIKit/FontStyles/text_2d7a850ca8394ec3.fntstyle'    # labels of green buttons
STYLE_AMBER = 'WordFall/UIKit/FontStyles/text_a18ea832fcd255b3.fntstyle'    # labels of amber buttons
STYLE_CREAM = 'WordFall/UIKit/FontStyles/text_8e0c014628a3f882.fntstyle'    # cream captions on the purple frame
STYLE_BROWN = 'WordFall/UIKit/FontStyles/text_0a4a99f4a06c7b7f.fntstyle'    # brown captions on parchment
BROWN = {'r': 102, 'g': 48, 'b': 15, 'a': 255}

SLICES = {
    KIT + 'panel_wood_purple_2.png': (120, 160, 129, 120),
    KIT + 'panel_parchment.png': (154, 163, 172, 163),
    KIT + 'btn_wood_wide.png': (117, 81, 160, 70),
    KIT + 'btn_green.png': (100, 71, 112, 72),
    KIT + 'btn_amber.png': (93, 76, 112, 71),
    KIT + 'header_blue_ribbon.png': (164, 108, 164, 97),
    GEN + 'panel_parchment_2.png': (60, 60, 60, 60),
}

_asset_ids = {}


def asset_id(path):
    if path not in _asset_ids:
        with open(os.path.join(ASSETS, path + '.meta')) as f:
            _asset_ids[path] = json.load(f)['Value']['mId']
    return _asset_ids[path]


def uid(*parts):
    return int(hashlib.sha1('/'.join(map(str, parts)).encode()).hexdigest()[:16], 16)


def hex_id(*parts):
    return hashlib.md5('/'.join(map(str, parts)).encode()).hexdigest()


class Builder:
    """Widgets of one prototype: stable ids by path, drawing depth growing in the order of creation"""

    def __init__(self, key, depth):
        self.key = key
        self.depth = depth

    def _next_depth(self):
        self.depth += 1
        return float(self.depth)

    def node(self, kind, name, rect, path, layers=(), children=(), enabled=True, states=None, pivot=None, extra=None):
        data = {
            'mDrawingDepth': self._next_depth(),
            'mInheritDrawingDepthFromParent': False,
            'mName': name,
            'mSceneLayer': {'Type': 'o2::SceneLayer', 'Value': {'mName': 'UI'}},
            'Id': uid(self.key, path),
            'Transform': rect.transform(pivot),
            'InternalWidgets': [],
            'Layers': [layer for layer in layers],
            'States': states or [],
        }
        if not enabled:
            data['mEnabled'] = False
        if extra:
            data.update(extra)
        node = {'Type': 'o2::' + kind, 'Data': data}
        if children:
            data['Children'] = list(children)
        return node

    def sprite_layer(self, path, image, name='image', color=None, transparency=None, depth=None, enabled=True, mode=None):
        value = {'mImageAsset': {'id': asset_id(image), 'path': image}}
        slices = SLICES.get(image)
        if slices and mode != 'simple':
            value['mMode'] = 'Sliced'
            value['mSlices'] = dict(zip(('left', 'bottom', 'right', 'top'), slices))
        if color:
            value['mColor'] = color
        layer = {'name': name, 'mDrawable': {'Type': 'o2::Sprite', 'Value': value}, 'mUID': uid(self.key, path, 'layer', name)}
        if transparency is not None:
            layer['mTransparency'] = transparency
        if depth is not None:
            layer['mDepth'] = depth
        if not enabled:
            layer['mEnabled'] = False
        return {'Type': 'o2::WidgetLayer', 'Value': layer}

    def text_layer(self, path, text, height, font=LILITA, style=None, color=None, halign='Middle', valign='Middle'):
        value = {'mText': text, 'mFontAssetId': font, 'mHeight': height, 'mSymbolsDistCoef': 1.0,
                 'mLinesDistanceCoef': 1.0, 'mVerAlign': valign, 'mHorAlign': halign}
        if style:
            value['mFontStyleAsset'] = {'id': asset_id(style), 'path': style}
        if color:
            value['mColor'] = color
        return {'Type': 'o2::WidgetLayer', 'Value': {'name': 'text', 'mDrawable': {'Type': 'o2::Text', 'Value': value},
                                                      'mUID': uid(self.key, path, 'layer', 'text')}}

    # --- widgets ---

    def image(self, name, rect, path, image, children=(), enabled=True, color=None, transparency=None, pivot=None):
        extra = {'mTransparency': transparency} if transparency is not None else None
        return self.node('Image', name, rect, path, [self.sprite_layer(path, image, color=color)], children, enabled,
                         pivot=pivot, extra=extra)

    def label(self, name, rect, path, text, height, font=LILITA, style=None, color=None, halign='Middle', enabled=True):
        return self.node('Label', name, rect, path, [self.text_layer(path, text, height, font, style, color, halign)],
                         enabled=enabled)

    def button(self, name, rect, path, image, children=(), extra_layers=()):
        """A button with the kit's look: its sprite, a darkened copy that shows while pressed"""
        layers = [self.sprite_layer(path, image, 'back')] + list(extra_layers)
        layers.append(self.sprite_layer(path, image, 'pressed', color={'r': 24, 'g': 14, 'b': 4, 'a': 255},
                                        transparency=0.0, depth=2.0))
        return self.node('Button', name, rect, path, layers, children, states=[pressed_state(self.key, path)])

    def widget(self, name, rect, path, children=(), enabled=True, pivot=None):
        return self.node('Widget', name, rect, path, (), children, enabled, pivot=pivot)


class Rect:
    """Placement in the parent: anchors and offsets as o2 keeps them"""

    def __init__(self, amin, amax, omin, omax):
        self.amin, self.amax, self.omin, self.omax = amin, amax, omin, omax

    def transform(self, pivot=None):
        t = {'anchorMin': {'x': self.amin[0], 'y': self.amin[1]}, 'anchorMax': {'x': self.amax[0], 'y': self.amax[1]},
             'offsetMin': {'x': float(self.omin[0]), 'y': float(self.omin[1])},
             'offsetMax': {'x': float(self.omax[0]), 'y': float(self.omax[1])}}
        if pivot:
            t['pivot'] = {'x': pivot[0], 'y': pivot[1], 'z': 0.0}
        return t


def top(cx, y, w, h):
    """A box of the parent by its top: centre x from the parent's middle, y down from the parent's top edge"""
    return Rect((0.5, 1.0), (0.5, 1.0), (cx - w/2, -(y + h)), (cx + w/2, -y))


def center(cx, cy, w, h):
    return Rect((0.5, 0.5), (0.5, 0.5), (cx - w/2, cy - h/2), (cx + w/2, cy + h/2))


def fill(margin=0):
    return Rect((0.0, 0.0), (1.0, 1.0), (margin, margin), (-margin, -margin))


_keys = [0]


def key(position, value, left=None, right=None):
    _keys[0] += 1
    k = {'uid': uid('key', _keys[0], position, value), 'value': value, 'position': position}
    if left:
        k['leftSupportPosition'], k['leftSupportValue'] = left
    if right:
        k['rightSupportPosition'], k['rightSupportValue'] = right
    return k


def track(path, keys):
    return {'Type': 'o2::AnimationTrack<float>', 'Value': {'path': path, 'curve': {'Type': 'o2::Curve', 'Value': {'mKeys': keys}}}}


def state(name, owner, tracks, duration, off_speed=None):
    value = {'name': name, 'mAnimation': {
        'instance': {'Type': 'o2::AnimationAsset', 'Value': {'animation': {'Type': 'o2::AnimationClip', 'Value': {
            'mTracks': tracks, 'mDuration': duration}}}},
        'meta': {'Type': 'o2::DefaultAssetMeta<o2::AnimationAsset>', 'Value': {'mId': hex_id(owner, name)}}}}
    if off_speed:
        value['offStateAnimationSpeed'] = off_speed
    return {'Type': 'o2::WidgetState', 'Value': value}


def pressed_state(owner, path):
    return state('pressed', owner + path, [track('layer/pressed/transparency', [
        {'uid': uid(owner, path, 'p0'), 'rightSupportPosition': 0.024, 'supportsType': 'Broken'},
        {'uid': uid(owner, path, 'p1'), 'value': 0.3, 'position': 0.06, 'leftSupportPosition': -0.06, 'supportsType': 'Broken'}])], 0.06)


def visible_state(owner, dim):
    """Opening: the dimmer fades in, the dialog fades in and pops (overshoots a little); closing plays it back faster"""
    ease = lambda a, b, t0, t1: [key(t0, a, right=((t1 - t0)*0.35, (b - a)*0.9)), key(t1, b, left=(-(t1 - t0)*0.4, 0.0))]
    pop = [key(0.0, 0.82, right=(0.07, 0.2)), key(0.2, 1.045, left=(-0.06, 0.0), right=(0.05, 0.0)), key(0.32, 1.0, left=(-0.05, 0.0))]
    return state('visible', owner, [
        track('child/dimmer/transparency', ease(0.0, dim, 0.0, 0.25)),
        track('child/dialog/transparency', ease(0.0, 1.0, 0.0, 0.16)),
        track('child/dialog/transform/scaleX', pop),
        track('child/dialog/transform/scaleY', pop)], 0.32, off_speed=1.6)


# --- the window skeleton ---

FRAME_W, FRAME_H = 1179.0, 2556.0
DIM = 0.65


def window(name, depth, script, dialog_h, title, body, dialog_w=1000, closable=True):
    """Root (camera frame) + dimmer + dialog: purple frame, wooden header with the title, red close button; body(b, d)
    returns the dialog's own children"""
    b = Builder(name, depth)
    d = '/dialog'
    # the frame is a button without an action: a click on the dialog's empty places stays in the dialog instead of
    # falling through to the dimmer, which closes the window
    frame = b.node('Button', 'frame', Rect((0.0, 0.0), (1.0, 1.0), (0, 0), (0, -80)), d + '/frame',
                   [b.sprite_layer(d + '/frame', KIT + 'panel_wood_purple_2.png', 'back')])
    content = body(b, d)
    header = b.button('header', top(0, 0, 640, 165), d + '/header', KIT + 'btn_wood_wide.png',
                      [b.label('title', fill(), d + '/header/title', title, 76, style=STYLE_TITLE)])
    # the header is a button without a press: the title plate is not interactive
    header['Data']['States'] = []
    header['Data']['Layers'] = header['Data']['Layers'][:1]
    children = [frame] + content + [header]
    if closable:
        children.append(b.button('close_button', Rect((1.0, 1.0), (1.0, 1.0), (-150, -165), (8, -5)), d + '/close_button',
                                 KIT + 'btn_round_red.png', [b.image('close_icon', center(0, 4, 72, 76), d + '/close_button/icon', KIT + 'icon_close.png')]))
    dialog = b.widget('dialog', center(0, 0, dialog_w, dialog_h), d, children, pivot=(0.5, 0.5))

    root_depth = float(depth)
    b.depth = depth  # the dimmer goes under the dialog
    dimmer = b.node('Button', 'dimmer', Rect((0.0, 0.0), (1.0, 1.0), (-600, -200), (600, 200)), '/dimmer',
                    [b.sprite_layer('/dimmer', KIT + 'white.png', color={'r': 0, 'g': 0, 'b': 0, 'a': 165})],
                    extra={'mTransparency': DIM})
    root = {
        'mInheritDrawingDepthFromParent': False,
        'mName': name,
        'mSceneLayer': {'Type': 'o2::SceneLayer', 'Value': {'mName': 'UI'}},
        'mEnabled': False,
        'Id': uid(name, 'root'),
        'Transform': Rect((0.5, 0.5), (0.5, 0.5), (-FRAME_W/2, -FRAME_H/2), (FRAME_W/2, FRAME_H/2)).transform((0.5, 0.5)),
        'Children': [dimmer, dialog],
        'InternalWidgets': [],
        'Layers': [],
        'States': [visible_state(name, DIM)],
        'Components': [{'Type': 'o2::ScriptableComponent', 'Data': {
            'mId': uid(name, 'component'),
            'mScript': {'id': asset_id('Scripts/WordFall/' + script + '.js'), 'path': 'Scripts/WordFall/' + script + '.js'},
            'mInstance': {}}}],
        'mDrawingDepth': root_depth,
    }
    number_depths(root['Children'], depth + 1)
    return {'mActor': {'Type': 'o2::Widget', 'Value': root}}


def number_depths(nodes, depth):
    """Drawing depths in the order of the tree: a parent under its children, earlier siblings under later ones
    (the builder creates the children before their parent). Returns the next free depth"""
    for node in nodes:
        data = node.get('Data') or node.get('Value')
        data['mDrawingDepth'] = float(depth)
        depth = number_depths(data.get('Children', []), depth + 1)
    return depth


def parchment(b, path, y, h, children, w=860):
    return b.image('parchment', top(0, y, w, h), path, KIT + 'panel_parchment.png', children)


def green_button(b, name, rect, path, text, height=64, coin=False):
    kids = []
    if coin:
        kids.append(b.image('coin', Rect((0.0, 0.5), (0.0, 0.5), (44, -42), (124, 42)), path + '/coin', KIT + 'icon_coin.png'))
        kids.append(b.label('label', Rect((0.0, 0.0), (1.0, 1.0), (120, 10), (-30, 0)), path + '/label', text, height, style=STYLE_GREEN))
    else:
        kids.append(b.label('label', Rect((0.0, 0.0), (1.0, 1.0), (30, 10), (-30, 0)), path + '/label', text, height, style=STYLE_GREEN))
    return b.button(name, rect, path, KIT + 'btn_green.png', kids)


def amber_button(b, name, rect, path, text, height=56, video=False):
    kids = []
    if video:
        kids.append(b.image('video', Rect((0.0, 0.5), (0.0, 0.5), (36, -44), (140, 44)), path + '/video', KIT + 'icon_video.png'))
        kids.append(b.label('label', Rect((0.0, 0.0), (1.0, 1.0), (130, 12), (-24, 0)), path + '/label', text, height, style=STYLE_AMBER))
    else:
        kids.append(b.label('label', Rect((0.0, 0.0), (1.0, 1.0), (30, 12), (-30, 0)), path + '/label', text, height, style=STYLE_AMBER))
    return b.button(name, rect, path, KIT + 'btn_amber.png', kids)


# --- the windows ---

BOOSTERS = [  # key, base sprite, glyph: as on the game screen's booster buttons (index = WordLevel's booster index)
    ('hammer', GEN + 'button_blue.png', GEN + 'icon_search.png'),
    ('shuffle', GEN + 'button_red.png', GEN + 'icon_shuffle.png'),
    ('hint', GEN + 'button_blue.png', GEN + 'icon_bulb_blue.png'),
    ('joker', GEN + 'button_yellow.png', GEN + 'icon_bulb_gold.png'),
    ('doubler', GEN + 'button_blue.png', GEN + 'icon_search_plus.png'),
]
BONUSES = [('bomb', WF + 'powerup_bomb.png'), ('rocket', WF + 'powerup_rocket.png'), ('fireworks', WF + 'powerup_fireworks.png')]


def shop_window():
    def body(b, d):
        p = d + '/balance'
        balance = b.image('balance', top(0, 215, 420, 112), p, KIT + 'input_wood.png', [
            b.image('coin', Rect((0.0, 0.5), (0.0, 0.5), (14, -46), (102, 46)), p + '/coin', KIT + 'icon_coin.png'),
            b.label('value', Rect((0.0, 0.0), (1.0, 1.0), (100, 8), (-20, 0)), p + '/value', '1,000', 62, style=STYLE_GOLD)])
        balance['Data']['Layers'][0]['Value']['mDrawable']['Value']['mMode'] = 'Sliced'
        balance['Data']['Layers'][0]['Value']['mDrawable']['Value']['mSlices'] = {'left': 50, 'bottom': 40, 'right': 50, 'top': 40}
        # icon_coin_2 has a grey checkerboard baked in: the plain coin stands for the small packs
        icons = [KIT + 'icon_coin.png', KIT + 'icon_coin.png', KIT + 'icon_coin_stack.png', KIT + 'icon_coin_stack.png',
                 SEASON + 'icon_season_pass_chests.png', SEASON + 'icon_season_pass_chests.png']
        sizes = [(96, 100), (135, 140), (150, 187), (170, 212), (250, 140), (290, 162)]
        cards = []
        for i in range(6):
            col, row = i % 2, i // 2
            p = d + '/packs/pack%d' % i
            w, h = sizes[i]
            kids = [
                b.image('icon', top(0, 30 + (200 - h)/2, w, h), p + '/icon', icons[i]),
                b.label('amount', top(0, 222, 380, 80), p + '/amount', '1,000', 70, style=STYLE_GOLD),
                green_button(b, 'buy', top(0, 300, 330, 128), p + '/buy', '$0.99', 56),
            ]
            if i in (2, 5):
                kids.append(b.image('badge', Rect((0.0, 1.0), (0.0, 1.0), (-14, -112), (110, 14)), p + '/badge', KIT + 'badge_orange.png',
                                    [b.label('text', fill(), p + '/badge/text', 'BEST' if i == 5 else 'HOT', 34, style=STYLE_AMBER)]))
            cards.append(b.image('pack%d' % i, top(-222 + col*444, 0 + row*445, 420, 440), p, GEN + 'panel_parchment_2.png', kids))
        packs = b.widget('packs', top(0, 360, 864, 1320), d + '/packs', cards)
        return [balance, packs]
    return window('ShopWindow', 900, 'WordFallShopView', 1760, 'SHOP', body)


def lives_window():
    def body(b, d):
        p = d + '/parchment'
        content = parchment(b, p, 220, 560, [
            b.image('heart', top(0, 70, 300, 279), p + '/heart', KIT + 'icon_heart.png',
                    [b.label('count', center(0, 18, 220, 150), p + '/heart/count', '5', 130, style=STYLE_GOLD)], pivot=(0.5, 0.5)),
            b.label('status', top(0, 370, 700, 120), p + '/status', 'Next life in 29:59', 52, font=ROBOTO, color=BROWN),
        ])
        refill = green_button(b, 'refill_button', top(-215, 830, 400, 190), d + '/refill_button', '900', 66, coin=True)
        refill['Data']['Children'].append(b.label('caption', top(0, -58, 400, 60), d + '/refill_button/caption', 'REFILL', 48, style=STYLE_CREAM))
        ad = amber_button(b, 'ad_button', top(215, 830, 400, 190), d + '/ad_button', '+1', 64, video=True)
        ad['Data']['Children'].append(b.label('caption', top(0, -58, 400, 60), d + '/ad_button/caption', 'FREE', 48, style=STYLE_CREAM))
        return [content, refill, ad]
    return window('LivesWindow', 650, 'WordFallLivesView', 1100, 'LIVES', body)


def booster_shop_window():
    def body(b, d):
        p = d + '/parchment'
        icons = []
        for key_, base, glyph in BOOSTERS:
            q = p + '/icon_' + key_
            icons.append(b.image('icon_' + key_, top(0, 60, 250, 260), q, base,
                                 [b.image('glyph', Rect((0.2222, 0.2797), (0.7778, 0.7902), (0, 0), (0, 0)), q + '/glyph', glyph)],
                                 enabled=key_ == 'hammer'))
        for key_, sprite in BONUSES:
            q = p + '/icon_' + key_
            icons.append(b.image('icon_' + key_, top(0, 50, 270, 270), q, sprite, enabled=False))
        amount = b.image('amount_badge', top(150, 230, 150, 160), p + '/amount_badge', KIT + 'badge_orange.png',
                         [b.label('amount', center(0, 4, 150, 110), p + '/amount_badge/amount', 'x3', 60, style=STYLE_AMBER)])
        content = parchment(b, p, 220, 640, icons + [
            amount,
            b.label('description', top(0, 400, 700, 170), p + '/description', 'Breaks one tile\nor one layer of an obstacle', 46, font=ROBOTO, color=BROWN),
        ])
        buy = green_button(b, 'buy_button', top(0, 905, 460, 190), d + '/buy_button', '600', 72, coin=True)
        owned = b.label('owned', top(0, 1110, 700, 70), d + '/owned', 'You have 0', 46, style=STYLE_CREAM)
        return [content, buy, owned]
    return window('BoosterShopWindow', 800, 'WordFallBoosterShopView', 1240, 'HAMMER', body)


def quit_window():
    def body(b, d):
        p = d + '/parchment'
        content = parchment(b, p, 220, 520, [
            b.image('heart', top(0, 70, 230, 214), p + '/heart', KIT + 'icon_heart.png',
                    [b.label('minus', center(0, 14, 200, 130), p + '/heart/minus', '-1', 104, style=STYLE_GOLD)]),
            b.label('message', top(0, 320, 700, 140), p + '/message', 'If you leave the level,\nyou will lose a life!', 48, font=ROBOTO, color=BROWN),
        ])
        leave = amber_button(b, 'quit_button', top(-215, 800, 400, 180), d + '/quit_button', 'QUIT', 66)
        stay = green_button(b, 'play_on_button', top(215, 800, 400, 180), d + '/play_on_button', 'PLAY ON', 62)
        return [content, leave, stay]
    return window('QuitLevelWindow', 750, 'WordFallQuitView', 1060, 'QUIT LEVEL?', body)


def settings_window():
    def body(b, d):
        p = d + '/parchment'
        rows = []
        items = [('sound', 'SOUND'), ('music', 'MUSIC'), ('language', 'LANGUAGE'), ('tutorial', 'TUTORIAL')]
        for i, (key_, caption) in enumerate(items):
            q = p + '/' + key_
            if key_ in ('sound', 'music'):
                control = b.button('toggle', Rect((1.0, 0.5), (1.0, 0.5), (-330, -66), (-20, 66)), q + '/toggle', KIT + 'btn_green.png',
                                   [b.label('on', Rect((0.0, 0.0), (1.0, 1.0), (20, 10), (-20, 0)), q + '/toggle/on', 'ON', 58, style=STYLE_GREEN),
                                    b.label('off', Rect((0.0, 0.0), (1.0, 1.0), (20, 12), (-20, 0)), q + '/toggle/off', 'OFF', 58, style=STYLE_AMBER, enabled=False)],
                                   extra_layers=[b.sprite_layer(q + '/toggle', KIT + 'btn_amber.png', 'off', depth=1.0, enabled=False)])
            elif key_ == 'language':
                control = b.button('switch', Rect((1.0, 0.5), (1.0, 0.5), (-330, -66), (-20, 66)), q + '/switch', KIT + 'btn_amber.png',
                                   [b.label('value', Rect((0.0, 0.0), (1.0, 1.0), (20, 12), (-20, 0)), q + '/switch/value', 'RUSSIAN', 46, style=STYLE_AMBER)])
            else:
                control = b.button('replay', Rect((1.0, 0.5), (1.0, 0.5), (-330, -66), (-20, 66)), q + '/replay', KIT + 'btn_amber.png',
                                   [b.label('value', Rect((0.0, 0.0), (1.0, 1.0), (20, 12), (-20, 0)), q + '/replay/value', 'REPLAY', 50, style=STYLE_AMBER)])
            rows.append(b.widget(key_, top(0, 70 + i*175, 720, 160), q, [
                b.label('caption', Rect((0.0, 0.0), (0.5, 1.0), (10, 0), (0, 0)), q + '/caption', caption, 60, style=STYLE_BROWN, halign='Left'),
                control]))
        content = parchment(b, p, 220, 860, rows)
        version = b.label('version', top(0, 1110, 700, 60), d + '/version', 'Word fall', 40, style=STYLE_CREAM)
        return [content, version]
    return window('SettingsWindow', 700, 'WordFallSettingsView', 1220, 'SETTINGS', body)


GOAL_ICONS = [  # kind of a goal slot -> its picture (WordFallLevelStartView.GoalKind picks the kind)
    ('words', KIT + 'icon_star_book.png'),
    ('anyWords', GEN + 'icon_search_small.png'),
    ('clearIce', WF + 'ui_ice.png'),
    ('crates', WF + 'ui_crate.png'),
    ('deliver', WF + 'ui_envelope.png'),
    ('melt', WF + 'ui_snowball.png'),
    ('bomb', WF + 'powerup_bomb.png'),
    ('rocket', WF + 'powerup_rocket.png'),
    ('fireworks', WF + 'powerup_fireworks.png'),
    ('tile', GEN + 'icon_tile_small_cream.png'),
    ('score', GEN + 'icon_rainbow_star.png'),
]


def level_start_window():
    def body(b, d):
        p = d + '/parchment'
        slots = []
        for i in range(6):
            q = p + '/goals/goal%d' % i
            icons = [b.image('icon_' + kind, top(0, 0, 112, 112), q + '/icon_' + kind, sprite, enabled=kind == 'words')
                     for kind, sprite in GOAL_ICONS]
            icons.append(b.label('symbol', top(0, 0, 112, 104), q + '/symbol', 'A', 58, font=ROBOTO, color=BROWN, enabled=False))
            icons.append(b.label('count', top(0, 116, 140, 64), q + '/count', 'x3', 50, style=STYLE_BROWN))
            slots.append(b.widget('goal%d' % i, top(-350 + i*140, 0, 140, 190), q, icons, enabled=i < 3))
        goals = b.widget('goals', top(0, 140, 840, 190), p + '/goals', slots)
        content = parchment(b, p, 220, 520, [
            b.label('caption', top(0, 62, 600, 70), p + '/caption', 'GOALS', 60, style=STYLE_BROWN),
            goals,
            b.label('moves', top(0, 345, 700, 66), p + '/moves', '15 moves', 48, font=ROBOTO, color=BROWN),
        ])
        bonuses = []
        for i, (kind, sprite) in enumerate(BONUSES):
            q = d + '/bonuses/' + kind
            bonuses.append(b.button(kind, top(-260 + i*260, 0, 200, 200), q, KIT + 'btn_round_blue.png', [
                b.image('icon', center(0, 6, 150, 150), q + '/icon', sprite),
                b.image('check', Rect((0.0, 0.0), (0.0, 0.0), (-6, -6), (70, 62)), q + '/check', GEN + 'icon_check.png', enabled=False),
                b.image('badge', Rect((1.0, 1.0), (1.0, 1.0), (-62, -60), (14, 22)), q + '/badge', KIT + 'badge_orange.png', [
                    b.label('count', center(0, 3, 76, 60), q + '/badge/count', '1', 44, style=STYLE_AMBER),
                    b.image('plus', center(0, 0, 42, 43), q + '/badge/plus', KIT + 'icon_plus.png', enabled=False)])]))
        row = b.widget('bonuses', top(0, 860, 800, 200), d + '/bonuses', bonuses)
        caption = b.label('bonuses_caption', top(0, 770, 700, 74), d + '/bonuses_caption', 'BONUSES', 60, style=STYLE_CREAM)
        play = green_button(b, 'play_button', top(0, 1110, 560, 190), d + '/play_button', 'PLAY', 96)
        return [content, caption, row, play]
    return window('LevelStartWindow', 500, 'WordFallLevelStartView', 1400, 'LEVEL 1', body)


# --- writing ---

def write_proto(path, proto):
    full = os.path.join(ASSETS, path)
    with open(full, 'w') as f:
        json.dump(proto, f, indent=4, ensure_ascii=False)
    meta = full + '.meta'
    if not os.path.exists(meta):
        with open(meta, 'w') as f:
            json.dump({'Type': 'o2::DefaultAssetMeta<o2::ActorAsset>', 'Value': {'mId': hex_id('proto', path)}}, f, indent=4)
    print('wrote', path)


def find(node, name):
    data = node.get('Value') or node.get('Data') or {}
    if data.get('mName') == name:
        return node
    for child in data.get('Children', []) + data.get('InternalWidgets', []):
        found = find(child, name)
        if found:
            return found
    return None


def set_child(parent, child):
    data = parent.get('Value') or parent.get('Data')
    children = data.setdefault('Children', [])
    name = child['Data']['mName']
    for i, existing in enumerate(children):
        if (existing.get('Data') or existing.get('Value') or {}).get('mName') == name:
            children[i] = child
            return
    children.append(child)


def patch_game_screen():
    """The level's quit button: red round close in the top right corner over the moves box (Screen/Hud/QuitButton)"""
    path = 'WordFall/Prototypes/GameScreen.proto'
    full = os.path.join(ASSETS, path)
    with open(full) as f:
        proto = json.load(f)
    hud = find(proto['mActor'], 'Hud')
    b = Builder('GameScreenQuit', 39)
    button = b.button('QuitButton', Rect((0.0, 0.0), (0.0, 0.0), (790, 1730), (868, 1810)), '/Hud/QuitButton', KIT + 'btn_round_red.png',
                      [b.image('Icon', center(0, 2, 38, 40), '/Hud/QuitButton/Icon', KIT + 'icon_close.png')])
    # over the hidden long-press toggle of the cheats (Cheats/Toggle, depth 95, the same corner): a tap on the cross
    # goes to the cross, a long press on the rest of the corner still opens the cheats
    number_depths([button], 96)
    set_child(hud, button)
    with open(full, 'w') as f:
        json.dump(proto, f, indent=4, ensure_ascii=False)
    print('patched', path)


def patch_main_screen():
    """A transparent button over the lives counter of the main screen: tapping the lives opens their window"""
    path = 'WordFall/UI/MainScreen.proto'
    full = os.path.join(ASSETS, path)
    with open(full) as f:
        proto = json.load(f)
    counter = find(proto['mActor'], 'lives_counter')
    b = Builder('MainScreenLives', 215)
    button = b.node('Button', 'lives_button', fill(), '/top_hud/lives_counter/lives_button',
                    [b.sprite_layer('/top_hud/lives_counter/lives_button', KIT + 'white.png', 'back', transparency=0.0)])
    button['Data']['mDrawingDepth'] = 210.6  # over the counter and its value (210.5), under the stars counter
    set_child(counter, button)
    with open(full, 'w') as f:
        json.dump(proto, f, indent=4, ensure_ascii=False)
    print('patched', path)


def main():
    write_proto('WordFall/UI/ShopWindow.proto', shop_window())
    write_proto('WordFall/UI/LevelStartWindow.proto', level_start_window())
    write_proto('WordFall/UI/LivesWindow.proto', lives_window())
    write_proto('WordFall/UI/BoosterShopWindow.proto', booster_shop_window())
    write_proto('WordFall/UI/QuitLevelWindow.proto', quit_window())
    write_proto('WordFall/UI/SettingsWindow.proto', settings_window())
    patch_game_screen()
    patch_main_screen()


if __name__ == '__main__':
    sys.exit(main())
