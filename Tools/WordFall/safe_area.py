#!/usr/bin/env python3
"""Puts the interface of the WordFall screens into a safe area (o2::SafeArea): the part of the ui camera's frame the
device keeps clear of the island or the notch, the rounded corners and the home indicator. What people touch goes inside,
the graphics that fill the screen (backdrops, dimmers, the paper of the game screen) stay outside and cover all of it.

  GameScreen, LevelEditorScreen  root -> Safe -> Screen. The screen is a fixed design in its own units (868x1813,
                                 768x1673); the root's WordFallSafeFit scales the root so the design fits the safe area
                                 (on a phone with an island it is a little smaller than the camera's width)
  MainScreen                     safe_area: top_hud, play_button, bottom_navigation (its wooden bar reaches down under
                                 the home indicator)
  VictoryWindow                  home_screen/safe_area: everything but the dimmer
  ContinueWindow                 safe_area: continue_dialog
  meta windows                   build_meta_windows.py builds them with the dialog in safe_area

Opened alone (no camera above), a safe area keeps its own layout: the iPhone 16's insets (59 pt on top, 34 pt below, in
the frame's units), so the editor shows the screens as that phone does; the game screens' Safe is their design frame.

Idempotent; apply_ui_screens.py calls it after it rebuilds the screens (unwrap() first puts the children back). Run from
the project root:  python3 Tools/WordFall/safe_area.py
"""
import hashlib
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSETS = os.path.join(ROOT, 'Assets')

SAFE = 'safe_area'
INSET_TOP, INSET_BOTTOM = 59*3.0, 34*3.0  # the iPhone 16's safe area in the frame's units (its pixels)
NAV_BOTTOM = -400.0                       # the bottom bar's lower edge under the safe area: under the home indicator

GAME_SCREENS = {
    'WordFall/Prototypes/GameScreen.proto': (868.0, 1813.0),
    'WordFall/Prototypes/LevelEditorScreen.proto': (768.0, 1673.0),
}
FIT_SCRIPT = 'Scripts/WordFall/WordFallSafeFit.js'

# screen -> (path of the parent of the safe area from the root, the children that go in)
SCREENS = {
    'WordFall/UI/MainScreen.proto': ('', ['top_hud', 'play_button', 'bottom_navigation']),
    'WordFall/UI/VictoryWindow.proto': ('home_screen', ['avatar_frame', 'coin_counter', 'lives_counter', 'stars_counter',
                                                        'settings_button', 'play_button', 'bottom_navigation',
                                                        'victory_fx', 'victory_popup']),
    'WordFall/UI/ContinueWindow.proto': ('', ['continue_dialog']),
}

# clips that reach into what moved: the old path prefix -> the new one
CLIPS = {
    'WordFall/UI/VictoryFx/VictoryFxOpen.anim': ('child/home_screen/child/victory_fx/',
                                                 'child/home_screen/child/safe_area/child/victory_fx/'),
    'WordFall/UI/VictoryFx/VictoryFxIdle.anim': ('child/home_screen/child/victory_fx/',
                                                 'child/home_screen/child/safe_area/child/victory_fx/'),
}


def uid(*parts):
    return int(hashlib.sha1('/'.join(map(str, parts)).encode()).hexdigest()[:16], 16)


def body(node):
    return node.get('Data') or node.get('Value')


def find(node, path):
    for name in [p for p in path.split('/') if p]:
        node = next((c for c in body(node).get('Children', []) if body(c).get('mName') == name), None)
        if node is None:
            return None
    return node


def transform(amin, amax, omin, omax, pivot=None):
    t = {'anchorMin': {'x': amin[0], 'y': amin[1]}, 'anchorMax': {'x': amax[0], 'y': amax[1]},
         'offsetMin': {'x': omin[0], 'y': omin[1]}, 'offsetMax': {'x': omax[0], 'y': omax[1]}}
    if pivot:
        t['pivot'] = {'x': pivot[0], 'y': pivot[1], 'z': 0.0}
    return t


def safe_node(key, name, layout):
    return {'Type': 'o2::SafeArea', 'Data': {
        'mInheritDrawingDepthFromParent': False,
        'mName': name,
        'mSceneLayer': {'Type': 'o2::SceneLayer', 'Value': {'mName': 'UI'}},
        'Id': uid(key, 'safe area', name),
        'Transform': layout,
        'InternalWidgets': [],
        'Layers': [],
        'States': [],
        'Children': [],
    }}


def wrap(parent, names, key, name, layout):
    """Moves the named children of parent into its safe area (made where the first of them was); returns the area"""
    children = body(parent).setdefault('Children', [])
    area = next((c for c in children if c['Type'] == 'o2::SafeArea'), None)
    if area is None:
        index = next((i for i, c in enumerate(children) if body(c).get('mName') in names), len(children))
        area = safe_node(key, name, layout)
        children.insert(index, area)
    body(area)['Transform'] = layout
    inside = body(area).setdefault('Children', [])
    for child in [c for c in children if body(c).get('mName') in names]:
        children.remove(child)
        inside.append(child)
    return area


def unwrap(parent):
    """Puts the children of parent's safe area back where it was and removes it"""
    children = body(parent).get('Children', [])
    for i, child in enumerate(children):
        if child['Type'] == 'o2::SafeArea':
            children[i:i + 1] = body(child).get('Children', [])
            return True
    return False


def frame_safe_layout():
    return transform((0.0, 0.0), (1.0, 1.0), (0.0, INSET_BOTTOM), (0.0, -INSET_TOP))


def wrap_screen(proto, key):
    parent_path, names = SCREENS[key]
    parent = find(proto['mActor'], parent_path) if parent_path else proto['mActor']
    wrap(parent, names, key, SAFE, frame_safe_layout())
    nav = find(proto['mActor'], parent_path + '/' + SAFE + '/bottom_navigation')
    if nav is not None:
        extend_down(nav, NAV_BOTTOM)


def extend_down(node, bottom):
    """Moves the lower edge of node down to bottom, its children staying where they are"""
    t = body(node)['Transform']
    grow = t['offsetMin']['y'] - bottom
    if abs(grow) < 1e-6:
        return
    t['offsetMin']['y'] = bottom
    for child in body(node).get('Children', []):
        ct = body(child).get('Transform', {})
        for anchor, offset in (('anchorMin', 'offsetMin'), ('anchorMax', 'offsetMax')):
            if offset in ct:
                a = ct.get(anchor, {}).get('y', 0.0)
                ct[offset]['y'] += grow*(1.0 - a)


def unwrap_screen(proto, key):
    parent_path, _ = SCREENS[key]
    parent = find(proto['mActor'], parent_path) if parent_path else proto['mActor']
    return unwrap(parent)


def asset_id(path):
    with open(os.path.join(ASSETS, path + '.meta')) as f:
        return json.load(f)['Value']['mId']


def wrap_game_screen(proto, key, design):
    """root -> Safe -> Screen; the root fits the design into the safe area"""
    root = proto['mActor']
    w, h = design
    frame = transform((0.5, 0.5), (0.5, 0.5), (-w/2, -h/2), (w/2, h/2), (0.5, 0.5))
    area = wrap(root, ['Screen'], key, 'Safe', frame)
    screen = find(area, 'Screen')
    body(screen)['Transform'].update(transform((0.5, 0.5), (0.5, 0.5), (-w/2, -h/2), (w/2, h/2)))

    components = body(root).setdefault('Components', [])
    fit = next((c for c in components if body(c).get('mScript', {}).get('path') == FIT_SCRIPT), None)
    if fit is None:
        fit = {'Type': 'o2::ScriptableComponent', 'Data': {'mId': uid(key, 'safe fit')}}
        components.append(fit)
    body(fit)['mScript'] = {'id': asset_id(FIT_SCRIPT), 'path': FIT_SCRIPT}
    # never larger than the scale the root was given for the camera's frame (apply_camera_units.py)
    scale = body(root).get('Transform', {}).get('scale', {}).get('x', 1.0)
    body(fit)['mInstance'] = {'designWidth': w, 'designHeight': h, 'maxScale': scale, 'safeAreaPath': 'Safe'}


_newline = {}


def unwrap_game_screen(proto):
    """Puts Screen back under the root (the layout tools work on root/Screen); wrap_game_screen() undoes it"""
    return unwrap(proto['mActor'])


def read(path):
    with open(os.path.join(ASSETS, path)) as f:
        raw = f.read()
    _newline[path] = raw.endswith('\n')
    return json.loads(raw)


def write(path, data):
    with open(os.path.join(ASSETS, path), 'w') as f:
        f.write(json.dumps(data, indent=4, ensure_ascii=False) + ('\n' if _newline.get(path) else ''))


def fix_clips():
    for path, (old, new) in CLIPS.items():
        full = os.path.join(ASSETS, path)
        with open(full) as f:
            text = f.read()
        fixed = text.replace('"' + old, '"' + new)
        if fixed != text:
            with open(full, 'w') as f:
                f.write(fixed)
            print('clip paths moved:', path)


def main():
    for path, design in GAME_SCREENS.items():
        proto = read(path)
        wrap_game_screen(proto, path, design)
        write(path, proto)
        print('safe area:', path)
    for path in SCREENS:
        proto = read(path)
        wrap_screen(proto, path)
        write(path, proto)
        print('safe area:', path)
    fix_clips()


if __name__ == '__main__':
    sys.exit(main())
