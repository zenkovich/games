#!/usr/bin/env python3
"""Кампания Word Fall по кривой сложности архива match-3 (levels.7z).

Вход: распакованные *.m3j. Последовательность: onboard_1..31 (обучение, механики
вводятся по одной), затем основная линия level_41..790 по порядку номеров.
Каждый уровень архива переводится в уровень Word Fall тем же «весом»:
ходы, целевые очки, состав мешка, препятствия и задачи. Выход: campaign.json
в формате сериализации WordLevelConfig и curve.json для отчёта.
"""
import json, glob, re, sys, os, random, collections

SRC = sys.argv[1] if len(sys.argv) > 1 else 'levels_src'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'campaign.json'
CURVE = sys.argv[3] if len(sys.argv) > 3 else 'curve.json'
COLS, ROWS = 7, 8
CELLS = COLS * ROWS
M3_CELLS = 81.0
COMMON_LETTERS = ['О', 'А', 'Е', 'И', 'Н', 'Т', 'С', 'Р', 'Л', 'К']
TASK_WORDS = {3: ['КОТ', 'ДОМ', 'ЛЕС', 'МИР', 'СОН', 'НОС', 'РОТ', 'ЛУК', 'МАК', 'СЫР', 'ШАР', 'ДЫМ'],
              4: ['РЕКА', 'ГОРА', 'СЛОН', 'ОКНО', 'МОРЕ', 'ЛУНА', 'РОЗА', 'ЛИСА', 'ЗИМА', 'СНЕГ', 'ПАРК', 'ТРОН'],
              5: ['ТАПКА', 'ЧАШКА', 'КНИГА', 'ЛОДКА', 'ВЕТЕР', 'ПОЛКА', 'ЗАМОК', 'СЛОВО', 'ПЕСОК', 'ГОРОД', 'ЛАМПА'],
              6: ['РАКЕТА', 'КОРОНА', 'ЗЕРКАЛО', 'МОЛОКО', 'ПАЛУБА', 'ОБЛАКО', 'КАРТИНА', 'ГАВАНЬ', 'КОРАБЛЬ', 'ДОРОГА']}
TASK_WORDS[6] = [w for w in TASK_WORDS[6] if len(w) == 6]


def load_levels():
    rows = {}
    for fn in glob.glob(os.path.join(SRC, '*.m3j')):
        m = re.match(r'(onboard|level)_(\d+)(?:_(\d+))?\.m3j', os.path.basename(fn))
        if not m:
            continue
        pref, num, var = m.group(1), int(m.group(2)), int(m.group(3) or 1)
        if pref == 'level' and num >= 1000:
            continue
        f = json.load(open(fn))
        fld = f['Fields'][0]; fo = fld['FieldObjects']
        mech = {list(x.keys())[0]: list(x.values())[0] for x in f['Mechanics']}
        bs, bc = mech['BalanceSetup'], mech['BalanceConfig']
        r = dict(
            name=f'{pref}_{num}', var=var, cells=len(fo['Geometry']), colors=len(bs['ItemsSet']),
            steps=bc['Steps'], fail=bc['Fail'],
            walls=[x.get('Grade', 1) for x in fo.get('Wall', [])],
            goals=[x.get('Grade', 1) for x in fo.get('Goal', [])],
            chain=len(fo.get('Chain', [])), lower=len(fo.get('Lowerable', [])),
            neutral=len(fo.get('Neutral', [])), genNeutral=len(fo.get('GeneratorNeutral', [])),
            noItem=len(fo.get('ServiceNoItem', [])), blockers=len(fo.get('PermanentMoveBlocker', [])),
            conveyor=len(fo.get('Conveyor', [])), wallObj=len(fo.get('WallObjective', [])),
            bombs=len(fo.get('Bomb', [])), colorBombs=len(fo.get('ColorBomb', [])),
            lineBombs=len(fo.get('RowBreaker', [])) + len(fo.get('ColumnBreaker', [])),
            collect=mech.get('CollectingItems'), lowering=mech.get('LoweringItems'),
            cwalls=mech.get('CollectingWalls'), neut=mech.get('NeutralItems'))
        key = (pref, num)
        if key not in rows or rows[key]['var'] < var:
            rows[key] = r
    seq = [rows[k] for k in sorted(rows) if k[0] == 'onboard'] + [rows[k] for k in sorted(rows) if k[0] == 'level']
    return seq


def rnd_cells(rng, count, pool, used):
    out = []
    cells = [c for c in pool if c not in used]
    rng.shuffle(cells)
    for c in cells[:count]:
        out.append(c); used.add(c)
    return out


def holes_pattern(rng, count):
    # дыры только у верха/низа колонок: углы, зубцы, «чаша» — форма поля без потери гравитации
    shapes = []
    if count >= 2:
        shapes.append([(0, ROWS - 1), (COLS - 1, ROWS - 1)])                 # верхние углы
    if count >= 4:
        shapes.append([(0, ROWS - 1), (COLS - 1, ROWS - 1), (0, 0), (COLS - 1, 0)])  # четыре угла
    if count >= 6:
        shapes.append([(0, ROWS - 1), (0, ROWS - 2), (COLS - 1, ROWS - 1), (COLS - 1, ROWS - 2), (0, 0), (COLS - 1, 0)])
        shapes.append([(1, ROWS - 1), (3, ROWS - 1), (5, ROWS - 1), (0, 0), (2, 0), (4, 0), (6, 0)][:count])
    if count >= 8:
        shapes.append([(0, ROWS - 1), (0, ROWS - 2), (0, ROWS - 3), (COLS - 1, ROWS - 1), (COLS - 1, ROWS - 2),
                       (COLS - 1, ROWS - 3), (0, 0), (COLS - 1, 0)])
    if not shapes:
        return []
    return rng.choice(shapes)


def build(seq):
    levels, curve = [], []
    for index, r in enumerate(seq):
        rng = random.Random(1000 + index * 7919)
        onboarding = r['name'].startswith('onboard')
        D = r['fail'] / 100.0                      # доля проигрышей — главная ось сложности
        late = index / max(1, len(seq) - 1)         # позиция в кампании 0..1

        moves = max(9, min(18, round(r['steps'] * 0.62)))
        per_move = 15 + 24 * D + 6 * late
        target = int(round(moves * per_move / 10.0) * 10)

        cfg = {'targetScore': target, 'moves': moves, 'boosterCharges': [3, 3, 30, 3, 3], 'tasks': []}
        used = set()

        # форма поля: недостающие клетки архива → дыры у краёв
        ratio = r['cells'] / M3_CELLS
        holes = round((1 - ratio) * CELLS * 0.5) + round(r['noItem'] * CELLS / M3_CELLS * 0.15)
        hole_cells = holes_pattern(rng, min(holes, 8)) if holes >= 2 else []
        for c in hole_cells: used.add(c)
        if hole_cells:
            cfg['holeCells'] = [{'x': c, 'y': rr} for c, rr in hole_cells]
        inner = [(c, rr) for c in range(COLS) for rr in range(ROWS) if (c, rr) not in used]
        mid = [(c, rr) for (c, rr) in inner if 1 <= rr <= ROWS - 2]

        # мешок: 4 «цвета» — щедрее гласными, 5 — обычный; поздние тяжёлые уровни — редкие согласные
        if r['colors'] <= 3: cfg['extraVowels'] = 10
        elif r['colors'] == 4: cfg['extraVowels'] = 6 if onboarding else 4
        if not onboarding and D >= 0.7:
            cfg['extraRare'] = min(6, round((D - 0.6) * 15))

        # стены → лёд (1 слой) и камень (2+ слоёв)
        light = sum(1 for g in r['walls'] if g <= 1) + len(r['goals']) * 0.25
        heavy = sum(1 for g in r['walls'] if g >= 2)
        ice = min(10, round(light * CELLS / M3_CELLS * 0.55))
        stone = min(4, round(heavy * CELLS / M3_CELLS * 0.5))
        if ice: cfg['iceCells'] = [{'x': c, 'y': rr} for c, rr in rnd_cells(rng, ice, inner, used)]
        if stone: cfg['stoneCells'] = [{'x': c, 'y': rr} for c, rr in rnd_cells(rng, stone, mid, used)]

        # ящики (WallObjective / CollectingWalls) — прочность 2 на тяжёлых уровнях
        crates = min(8, round(r['wallObj'] * CELLS / M3_CELLS * 0.3))
        if r['cwalls'] and crates == 0:
            crates = min(6, 2 + round(D * 4))
        if crates:
            cells = rnd_cells(rng, crates, mid, used)
            cfg['crateCells'] = [{'x': c, 'y': rr} for c, rr in cells]
            cfg['crateGrades'] = [2 if (not onboarding and rng.random() < D * 0.6) else 1 for _ in cells]
            cfg['tasks'].append({'taskType': 'Crates'})

        # цепи, плюс структура конвейеров/блокеров, которым аналога нет
        chains = min(8, round((r['chain'] + r['blockers'] * 0.5 + r['conveyor'] * 0.25) * CELLS / M3_CELLS * 0.55))
        if chains:
            cfg['chainCells'] = [{'x': c, 'y': rr} for c, rr in rnd_cells(rng, chains, mid, used)]

        # конверты (Lowerable): доставить на дно
        total = 0
        if r['lowering']:
            total = r['lowering'].get('TotalCount') or 0
        if r['lower'] and not total:
            total = r['lower']
        if total:
            total = max(1, min(5, total))
            on_screen = 2 if (r['lowering'] or {}).get('OnScreenCount', 1) >= 2 else 1
            starts = min(on_screen, total)
            tops = [(c, max(rr for rr in range(ROWS) if (c, rr) not in hole_cells)) for c in range(COLS)]
            start_cells = rnd_cells(rng, starts, tops, used)
            cfg['parcelCells'] = [{'x': c, 'y': rr} for c, rr in start_cells]
            cfg['parcelTotal'] = total
            cfg['parcelOnScreen'] = on_screen
            cfg['tasks'].append({'taskType': 'Deliver', 'count': total})

        # снежки (Neutral): стартовые + сыплются сверху при генераторе
        snow = min(6, round(r['neutral'] * CELLS / M3_CELLS * 0.4))
        if r['neut'] and snow == 0:
            snow = 2
        if snow:
            cfg['snowCells'] = [{'x': c, 'y': rr} for c, rr in rnd_cells(rng, snow, inner, used)]
            per_move = 1 if r['genNeutral'] else 0
            if per_move: cfg['snowPerMove'] = per_move
            melt = snow + (moves // 2 if per_move else 0)
            cfg['tasks'].append({'taskType': 'Melt', 'count': max(2, min(melt, snow + 6))})

        # предустановленные бонусы
        kinds = ['bomb'] * r['bombs'] + ['rocket'] * r['lineBombs'] + ['fireworks'] * r['colorBombs']
        kinds = kinds[:4]
        if kinds:
            cells = rnd_cells(rng, len(kinds), mid, used)
            cfg['powerupCells'] = [{'x': c, 'y': rr} for c, rr in cells]
            cfg['powerupKinds'] = kinds[:len(cells)]

        # сбор фишек цвета → сбор буквы
        if r['collect']:
            count = max(3, min(12, round((r['collect'].get('Count') or 20) * 0.25)))
            cfg['tasks'].append({'taskType': 'Letter', 'count': count, 'letter': rng.choice(COMMON_LETTERS[:6])})

        # слово-задание сидится на поле — обязательный старт; длина растёт с кампанией
        length = 3 if index < 6 else 4 if (D < 0.5 or index < 20) else 5 if D < 0.85 else rng.choice([5, 6])
        cfg['tasks'].insert(0, {'word': rng.choice(TASK_WORDS[length])})

        # добор задач до 2-4 по сложности
        want = 2 if onboarding and index < 8 else 3 if D < 0.8 else 4
        pool = ['length', 'anyWords', 'wordScore', 'powerup']
        rng.shuffle(pool)
        while len(cfg['tasks']) < want and pool:
            kind = pool.pop()
            if kind == 'length':
                cfg['tasks'].append({'taskType': 'Length', 'length': 4 + (1 if D > 0.6 else 0), 'count': 1 + (1 if D > 0.75 else 0)})
            elif kind == 'anyWords':
                cfg['tasks'].append({'taskType': 'AnyWords', 'count': max(3, min(moves - 2, 3 + round(D * 5)))})
            elif kind == 'wordScore':
                cfg['tasks'].append({'taskType': 'WordScore', 'scoreThreshold': 16 + round(D * 14) + round(late * 6)})
            elif kind == 'powerup' and index >= 5:
                pk = 'bomb' if index < 20 else rng.choice(['bomb', 'rocket'] if index < 45 else ['bomb', 'rocket', 'fireworks'])
                cfg['tasks'].append({'taskType': 'Powerup', 'powerupKind': pk, 'count': 1})
        cfg['tasks'] = cfg['tasks'][:5]

        levels.append(cfg)
        curve.append({'index': index + 1, 'source': r['name'], 'fail': r['fail'], 'steps': r['steps'], 'colors': r['colors'],
                      'cells': r['cells'], 'moves': moves, 'target': target, 'perMove': round(target / moves, 1),
                      'ice': ice, 'stone': stone, 'crates': crates, 'chains': chains, 'parcels': total, 'snow': snow,
                      'holes': len(hole_cells), 'bonuses': len(kinds), 'tasks': len(cfg['tasks']),
                      'extraVowels': cfg.get('extraVowels', 0), 'extraRare': cfg.get('extraRare', 0)})
    return levels, curve


if __name__ == '__main__':
    seq = load_levels()
    levels, curve = build(seq)
    json.dump(levels, open(OUT, 'w'), ensure_ascii=False, indent=2)
    json.dump(curve, open(CURVE, 'w'), ensure_ascii=False, indent=1)
    print('levels', len(levels), 'onboarding', sum(1 for c in curve if c['source'].startswith('onboard')))
