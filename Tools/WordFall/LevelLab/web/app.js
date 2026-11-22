'use strict';

// ================= helpers =================

const $ = (id) => document.getElementById(id);

function h(tag, attrs, ...children)
{
    const node = document.createElement(tag);
    for (const name in attrs || {})
    {
        const value = attrs[name];
        if (value === undefined || value === null || value === false)
            continue;
        if (name == 'class') node.className = value;
        else if (name == 'text') node.textContent = value;
        else if (name == 'html') node.innerHTML = value;
        else if (name == 'style' && typeof value == 'object') Object.assign(node.style, value);
        else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
        else if (name == 'value') node.value = value;
        else if (name == 'checked' || name == 'disabled' || name == 'selected') node[name] = !!value;
        else node.setAttribute(name, value === true ? '' : value);
    }
    for (const child of children.flat(3))
    {
        if (child === undefined || child === null || child === false)
            continue;
        node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
}

const icons = {
    plus: '<path d="M8 3v10M3 8h10"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3 10.5V4a1 1 0 0 1 1-1h6.5"/>',
    up: '<path d="M8 13V3M4 7l4-4 4 4"/>',
    down: '<path d="M8 3v10M4 9l4 4 4-4"/>',
    trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>',
    undo: '<path d="M6 3.5 3 6.5l3 3"/><path d="M3 6.5h6.5a3.25 3.25 0 0 1 0 6.5H7.5"/>',
    redo: '<path d="M10 3.5l3 3-3 3"/><path d="M13 6.5H6.5a3.25 3.25 0 0 0 0 6.5h1"/>',
    chevronDown: '<path d="M4 6l4 4 4-4"/>',
    chevronUp: '<path d="M4 10l4-4 4 4"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    upload: '<path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 13.5h11"/>',
    commit: '<circle cx="8" cy="8" r="2.5"/><path d="M1.5 8h4M10.5 8h4"/>',
    build: '<path d="M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3z"/><path d="M2.5 5.5 8 8.5l5.5-3M8 8.5v5"/>',
    play: '<path d="M5 3.5v9l7.5-4.5z" fill="currentColor"/>',
    pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
    step: '<path d="M4 3.5v9l6-4.5z" fill="currentColor"/><path d="M12.5 3.5v9"/>',
    restart: '<path d="M3 8a5 5 0 1 0 1.6-3.7"/><path d="M3 3v3h3"/>',
    sparkle: '<path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z"/>',
    users: '<circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 13.5c.5-2.6 2.1-3.8 4.5-3.8s4 1.2 4.5 3.8"/><circle cx="11.5" cy="6" r="2"/><path d="M11.2 9.6c1.8 0 3 .9 3.3 2.9"/>',
    book: '<path d="M8 4.5c-1.2-1-2.8-1.5-5.5-1.5v9.5c2.7 0 4.3.5 5.5 1.5 1.2-1 2.8-1.5 5.5-1.5V3c-2.7 0-4.3.5-5.5 1.5zM8 4.5v9"/>',
    sliders: '<path d="M2.5 4h7M12.5 4h1M2.5 8h2M7.5 8h6M2.5 12h7M12.5 12h1"/><circle cx="11" cy="4" r="1.5"/><circle cx="6" cy="8" r="1.5"/><circle cx="11" cy="12" r="1.5"/>',
    mirror: '<path d="M8 2v12" stroke-dasharray="1.5 1.8"/><path d="M5.5 4.5 2 8l3.5 3.5z"/><path d="M10.5 4.5 14 8l-3.5 3.5z"/>',
    shape: '<path d="M8 13.5S2.5 10.2 2.5 6.3A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5.5 1.3c0 3.9-5.5 7.2-5.5 7.2z"/>',
    layout: '<rect x="2.5" y="2.5" width="4" height="4" rx="1"/><rect x="9.5" y="2.5" width="4" height="4" rx="1"/><rect x="2.5" y="9.5" width="4" height="4" rx="1"/><rect x="9.5" y="9.5" width="4" height="4" rx="1"/>',
    gamepad: '<rect x="1.5" y="4.5" width="13" height="7.5" rx="3.75"/><path d="M4.5 8.25h2.5M5.75 7v2.5"/><circle cx="10.5" cy="7.6" r=".7" fill="currentColor"/><circle cx="12" cy="9.2" r=".7" fill="currentColor"/>',
    check: '<path d="M3 8.5 6.5 12 13 4.5"/>',
    warn: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.3v.1"/>',
    eraser: '<path d="M9.3 2.8 13.2 6.7 7.6 12.3H4.2L2.3 10.4z"/><path d="M5.8 6.3 9.7 10.2M7.6 12.3H14"/>',
    gap: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.5" stroke-dasharray="2.2 2"/>',
    gauge: '<path d="M2.5 11.5a5.5 5.5 0 1 1 11 0"/><path d="M8 11.5 10.8 6.5"/>',
    tune: '<path d="M3 13V8M3 5V3M8 13v-3M8 7V3M13 13v-6M13 4V3"/><path d="M1.5 8h3M6.5 7h3M11.5 4h3"/>',
    wand: '<path d="M3 13 10.5 5.5M9 4l3 3"/><path d="M12.5 1.5v2M11.5 2.5h2M14 5.5v1.5M13.25 6.25h1.5"/>',
    stop: '<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/>'
};

function icon(name)
{
    const span = document.createElement('span');
    span.innerHTML = '<svg class="icon" viewBox="0 0 16 16">' + (icons[name] || '') + '</svg>';
    return span.firstChild;
}

// Where the API is: the LevelLab server on this machine (server.mjs), or this page itself when it is a tab of the project
// on the o2 portal (portal.js: the same API in the browser, the project's files through the portal's bridge)
const onPortal = !!window.o2portal;
let backend = null;

async function call(method, path, body)
{
    if (backend)
        return backend.call(method, path, body);
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok || data.error)
        throw new Error(data.error || response.statusText);
    return data;
}

let toastTimer = 0;
function toast(text, kind, time)
{
    const node = $('toast');
    node.textContent = text;
    node.className = 'toast' + (kind == 'bad' ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.add('hidden'), time || 3600);
}

async function guarded(action)
{
    try { return await action(); }
    catch (error) { toast(error.message, 'bad', 7000); console.error(error); return null; }
}

const fmt = (value, digits = 2) => value === undefined || value === null || !isFinite(value) ? '—' : Number(value).toFixed(digits);
const attempts = (value) => value === undefined || value === null ? '—' : value >= 50 ? '50+' : fmt(value);
const pct = (value, digits = 0) => value === undefined || value === null || !isFinite(value) ? '—' : (value*100).toFixed(digits) + '%';
const clone = (value) => JSON.parse(JSON.stringify(value));
const plural = (n, one, few, many) => { const t = n % 100, o = n % 10; return t >= 11 && t <= 14 ? many : o == 1 ? one : o >= 2 && o <= 4 ? few : many; };

function field(label, control, attrs)
{
    return h('label', { class: 'field', ...(attrs || {}) }, h('span', { text: label }), control);
}

function numberInput(value, onchange, attrs)
{
    return h('input', { class: 'input num', type: 'number', value: value === undefined || value === null ? '' : value, ...(attrs || {}),
                        onchange: (event) => { const number = Number(event.target.value); if (event.target.value !== '' && isFinite(number)) onchange(number); } });
}

// A segmented control that redraws itself on a change
function segmented(options, value, onchange, attrs)
{
    const node = h('div', { class: 'seg', ...(attrs || {}) });
    const draw = (current) => node.replaceChildren(...options.map(([key, label, title]) =>
        h('button', { class: key == current ? 'on' : '', text: label, title, type: 'button', onclick: () => { draw(key); onchange(key); } })));
    draw(value);
    return node;
}

const section = (title, ...children) => h('div', {}, h('div', { class: 'section-title' }, title, h('div', { class: 'grow' })), ...children);

// ================= game vocabulary =================

const sprite = (path) => onPortal ? window.o2portal.files.url('Assets/' + path) : '/game/' + path;
const SP = {
    tiles: ['Generated/UI/Screen_Resources/Sprites/icon_tile_cream.png', 'Generated/UI/Screen_Resources/Sprites/icon_tile_gold.png',
            'Generated/UI/Screen_Resources/Sprites/icon_tile_gold.png', 'Generated/UI/Screen_Resources/Sprites/icon_tile_orange.png'].map(sprite),
    doubled: sprite('Generated/UI/Screen_Resources/Sprites/icon_tile_yellow.png'),
    ice: sprite('WordFall/Sprites/ui_ice.png'),
    stone: sprite('WordFall/Sprites/ui_stone.png'),
    crate: sprite('WordFall/Sprites/ui_crate.png'),
    crateHit: sprite('WordFall/Sprites/ui_crate_cracked.png'),
    chain: sprite('WordFall/Sprites/ui_chain.png'),
    snow: sprite('WordFall/Sprites/ui_snowball.png'),
    parcel: sprite('WordFall/Sprites/ui_envelope.png'),
    socket: sprite('WordFall/Sprites/powerup_socket.png'),
    bomb: sprite('WordFall/Sprites/powerup_bomb.png'),
    rocket: sprite('WordFall/Sprites/powerup_rocket.png'),
    fireworks: sprite('WordFall/Sprites/powerup_fireworks.png'),
    back: (quarter, kind) => sprite('WordFall/ScreenUI/board_' + quarter + '_' + kind + '.png')
};

const taskNames = { Length: 'Слова длины', Powerup: 'Бонусы', ClearIce: 'Весь лёд', AnyWords: 'Найти слова', WordScore: 'Слово на очки',
                    Letter: 'Буква', Deliver: 'Конверты', Melt: 'Снежки', Crates: 'Все ящики' };
const taskIcons = { ClearIce: SP.ice, Deliver: SP.parcel, Melt: SP.snow, Crates: SP.crate };
const bonusNames = { bomb: 'Бомба', rocket: 'Ракета', fireworks: 'Салют' };
const tierNames = { tutorial: 'обучение', normal: 'обычный', relief: 'передышка', hard: 'сложный', super: 'очень сложный' };
const profileNames = { weak: 'Слабый', average: 'Средний', strong: 'Сильный' };
const profileFields = { erudition: 'Эрудиция', effort: 'Усидчивость', skill: 'Тактика', boosters: 'Бустеры', spread: 'Разброс' };
const profileHelp = {
    erudition: 'какие слова игрок знает — по узнаваемости слова в словаре',
    effort: 'сколько вариантов слова он находит, прежде чем сыграть лучший',
    skill: 'как удачно берёт плитки (кластеры, соседство с препятствиями) и взвешивает цели',
    boosters: 'охота пользоваться бустерами, когда прижало',
    spread: 'насколько различаются люди одного типа: каждая попытка — новый человек'
};
const reasonNames = { score: 'не хватило очков', words: 'не найдены слова уровня', stuck: 'кончились слова',
                      Length: 'слова длины', Powerup: 'бонусы', ClearIce: 'весь лёд', AnyWords: 'найти слова', WordScore: 'слово на очки',
                      Letter: 'буква', Deliver: 'конверты', Melt: 'снежки', Crates: 'все ящики' };
const boosterNames = ['Молоток', 'Перемешать', 'Подсказка', 'Джокер', 'Удвоитель'];

function taskCaption(task, language)
{
    const count = task.count || 1;
    switch (task.taskType)
    {
        case 'Length': return 'Слова из ' + (task.length || 4) + ' букв × ' + count;
        case 'Powerup': return (bonusNames[task.powerupKind || 'bomb'] || 'Бонус') + ' × ' + count;
        case 'ClearIce': return 'Весь лёд';
        case 'AnyWords': return 'Найти ' + count + ' ' + plural(count, 'слово', 'слова', 'слов');
        case 'WordScore': return 'Слово на ' + (task.scoreThreshold || 18) + '+ очков';
        case 'Letter': return 'Буква ' + ((task.letter || {})[language] || '?') + ' × ' + count;
        case 'Deliver': return 'Конверты × ' + count;
        case 'Melt': return 'Снежки × ' + count;
        case 'Crates': return 'Все ящики';
    }
    return task.taskType;
}

// ================= state =================

const S = {
    state: null, shapes: [], selected: 0, draft: null, history: [], future: [], tool: 'ice', mirror: true,
    saveTimer: 0, problems: [], shapeInfo: null, busy: '', jobLog: [], hover: -1, drag: null,
    filter: 'all', bot: 'average', mind: 0.5, speed: 4, gameAttempts: 3, gameResult: null, curveOpen: true, vcs: null
};

const language = () => S.state.settings.language;
const levelAt = (index) => S.state.campaign[index];
const metaOf = (level) => (level && S.state.meta[level.id]) || {};
const columns = 7, rows = 8;

function targetAt(index)
{
    const point = S.state.targets[index];
    if (point)
        return point;
    const meta = metaOf(levelAt(index));
    return { target: meta.target || 1.2, tier: meta.tier || 'normal', manual: false };
}

// A level against its target: ok, off (out of tolerance), stale (edited after the estimate), none
function statusOf(index)
{
    const meta = metaOf(levelAt(index));
    if (!meta.stats)
        return 'none';
    if (meta.dirty)
        return 'stale';
    const target = targetAt(index).target;
    const measured = meta.stats.attempts;
    const ok = target < 1.25 ? Math.abs(1/measured - 1/target) <= 0.05 : Math.abs(Math.log(measured/target)) <= S.state.settings.tolerance*1.5;
    return ok ? 'ok' : 'off';
}

// ================= shapes =================

const holeKey = (holes) => (holes || []).map((cell) => cell.x + ',' + cell.y).sort().join(' ');

function shapeOf(holes)
{
    const own = holeKey(holes);
    const mirrored = holeKey((holes || []).map((cell) => ({ x: columns - 1 - cell.x, y: cell.y })));
    for (const shape of S.shapes)
    {
        const key = holeKey(shape.holes);
        if (key == own)
            return shape;
        if (key == mirrored)
            return { ...shape, name: shape.name + ' (зеркально)' };
    }
    return null;
}

function hardnessLabel(shape)
{
    const value = shape.hardness;
    if (value === undefined)
        return { text: { easy: 'лёгкая', medium: 'средняя', hard: 'сложная' }[shape.group], kind: '' };
    return value < 0.045 ? { text: 'лёгкая', kind: 'good' } : value < 0.105 ? { text: 'средняя', kind: 'warn' } : { text: 'сложная', kind: 'bad' };
}

function shapeSvg(holes)
{
    const set = new Set((holes || []).map((cell) => cell.x + ',' + cell.y));
    const cell = 12, gap = 2;
    let rects = '';
    for (let y = rows - 1; y >= 0; y--)
        for (let x = 0; x < columns; x++)
        {
            const px = x*(cell + gap), py = (rows - 1 - y)*(cell + gap);
            rects += set.has(x + ',' + y)
                ? '<rect x="' + px + '" y="' + py + '" width="' + cell + '" height="' + cell + '" rx="2" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-dasharray="2 2"/>'
                : '<rect x="' + px + '" y="' + py + '" width="' + cell + '" height="' + cell + '" rx="2.5" fill="#ecc88f" stroke="#a3713d"/>';
        }
    const width = columns*(cell + gap) - gap, height = rows*(cell + gap) - gap;
    return '<svg viewBox="-1 -1 ' + (width + 2) + ' ' + (height + 2) + '">' + rects + '</svg>';
}

// ================= level cells =================

const blockLists = ['iceCells', 'stoneCells', 'crateCells', 'chainCells', 'snowCells', 'parcelCells', 'powerupCells'];
const indexIn = (list, x, y) => (list || []).findIndex((cell) => cell.x == x && cell.y == y);
const mirrorX = (x) => columns - 1 - x;

function letterList(level, create)
{
    if (!level.letterCells || Array.isArray(level.letterCells))
    {
        if (!create)
            return [];
        level.letterCells = {};
    }
    if (!level.letterCells[language()] && create)
        level.letterCells[language()] = [];
    return level.letterCells[language()] || [];
}

function contentAt(level, x, y)
{
    const at = (name) => indexIn(level[name], x, y);
    const crate = at('crateCells'), bonus = at('powerupCells'), letter = indexIn(letterList(level), x, y);
    return {
        hole: indexIn(level.holeCells, x, y) >= 0,
        ice: at('iceCells') >= 0, stone: at('stoneCells') >= 0, chain: at('chainCells') >= 0, snow: at('snowCells') >= 0, parcel: at('parcelCells') >= 0,
        crate: crate >= 0 ? (level.crateGrades || [])[crate] || 1 : 0,
        bonus: bonus >= 0 ? (level.powerupKinds || [])[bonus] || 'bomb' : '',
        letter: letter >= 0 ? letterList(level)[letter].letter : ''
    };
}

function removeFrom(level, name, x, y)
{
    const at = indexIn(level[name], x, y);
    if (at < 0)
        return false;
    level[name].splice(at, 1);
    if (name == 'crateCells' && level.crateGrades)
        level.crateGrades.splice(at, 1);
    if (name == 'powerupCells' && level.powerupKinds)
        level.powerupKinds.splice(at, 1);
    return true;
}

function dropLetter(level, x, y)
{
    const list = letterList(level);
    const at = indexIn(list, x, y);
    if (at >= 0)
        list.splice(at, 1);
}

function clearBlocks(level, x, y)
{
    for (const name of blockLists)
        removeFrom(level, name, x, y);
}

const addCell = (level, name, x, y) => { level[name] = level[name] || []; level[name].push({ x, y }); };

// Is the tool's thing on the cell: a stroke that starts on such a cell takes it away
function toolPresent(level, tool, x, y)
{
    const content = contentAt(level, x, y);
    switch (tool)
    {
        case 'cell': return !content.hole;
        case 'gap': return content.hole;
        case 'ice': case 'stone': case 'chain': case 'snow': case 'parcel': return content[tool];
        case 'bomb': case 'rocket': case 'fireworks': return content.bonus == tool;
    }
    return false;
}

// Puts (put) or takes away the tool's thing on one cell. Only letters share a cell — with ice, stone or a chain
function paintCell(level, tool, x, y, put)
{
    const content = contentAt(level, x, y);
    if (tool == 'cell' || tool == 'gap')
    {
        const makeHole = (tool == 'gap') == put;
        if (makeHole && !content.hole)
        {
            clearBlocks(level, x, y);
            dropLetter(level, x, y);
            addCell(level, 'holeCells', x, y);
        }
        else if (!makeHole && content.hole)
            removeFrom(level, 'holeCells', x, y);
        return;
    }
    if (content.hole)
        return;
    if (tool == 'eraser')
    {
        clearBlocks(level, x, y);
        dropLetter(level, x, y);
        return;
    }
    const lists = { ice: 'iceCells', stone: 'stoneCells', chain: 'chainCells', snow: 'snowCells', parcel: 'parcelCells' };
    if (lists[tool])
    {
        if (!put)
            removeFrom(level, lists[tool], x, y);
        else if (!content[tool])
        {
            clearBlocks(level, x, y);
            if (tool == 'snow' || tool == 'parcel')
                dropLetter(level, x, y);
            addCell(level, lists[tool], x, y);
        }
        return;
    }
    if (bonusNames[tool])
    {
        if (!put)
        {
            if (content.bonus == tool)
                removeFrom(level, 'powerupCells', x, y);
            return;
        }
        clearBlocks(level, x, y);
        dropLetter(level, x, y);
        addCell(level, 'powerupCells', x, y);
        level.powerupKinds = level.powerupKinds || [];
        level.powerupKinds.push(tool);
    }
}

// A crate's strength one step up or down: nothing, 1, 2, 3
function stepCrate(level, x, y, delta)
{
    const content = contentAt(level, x, y);
    if (content.hole)
        return;
    const grade = Math.max(0, Math.min(3, content.crate + delta));
    if (grade == content.crate)
        return;
    if (content.crate == 0)
    {
        clearBlocks(level, x, y);
        dropLetter(level, x, y);
        addCell(level, 'crateCells', x, y);
        level.crateGrades = level.crateGrades || [];
        level.crateGrades.push(grade);
    }
    else if (grade == 0)
        removeFrom(level, 'crateCells', x, y);
    else
        level.crateGrades[indexIn(level.crateCells, x, y)] = grade;
}

function withMirror(x, y)
{
    return S.mirror && mirrorX(x) != x ? [[x, y], [mirrorX(x), y]] : [[x, y]];
}

// ================= board, drawn with the game's sprites =================

const K = 0.42;
const PX = 120*K, PY = 115*K, MARGIN = 34*K, TILE = 111*K;
const BOARD_W = columns*PX + 2*MARGIN, BOARD_H = rows*PY + 2*MARGIN;
const quarters = [['tl', -1, 1], ['tr', 1, 1], ['bl', -1, -1], ['br', 1, -1]];

function cellCenter(x, y) { return [MARGIN + (x + 0.5)*PX, MARGIN + (rows - 1 - y + 0.5)*PY]; }

function place(node, cx, cy, width, height)
{
    node.style.left = (cx - width/2) + 'px';
    node.style.top = (cy - height/2) + 'px';
    node.style.width = width + 'px';
    node.style.height = height + 'px';
    return node;
}

function img(src, cx, cy, size, extra)
{
    const node = document.createElement('img');
    node.src = src;
    node.draggable = false;
    node.alt = '';
    if (extra)
        Object.assign(node.style, extra);
    return place(node, cx, cy, size, size);
}

// cellAt(x, y) -> {hole, letter, value, fixed, random, ice, stone, crate, chain, snow, parcel, bonus, x2, tint}
// opts: { edit, selection: [{c, r}], burned: [{c, r}], aim: {c, r} }
function drawBoard(container, cellAt, opts)
{
    opts = opts || {};
    container.style.width = BOARD_W + 'px';
    container.style.height = BOARD_H + 'px';
    const cells = [];
    for (let x = 0; x < columns; x++)
    {
        cells.push([]);
        for (let y = 0; y < rows; y++)
            cells[x].push(cellAt(x, y));
    }
    const inside = (x, y) => x >= 0 && x < columns && y >= 0 && y < rows && !cells[x][y].hole;
    const layer = document.createDocumentFragment();

    // the wooden backing follows the shape: four quarters a cell, picked by the neighbours of each corner, as in the game
    for (let x = 0; x < columns; x++)
        for (let y = 0; y < rows; y++)
        {
            if (!inside(x, y))
                continue;
            const [cx, cy] = cellCenter(x, y);
            const left = cx - 94*K, top = cy - 91.5*K;
            for (const [name, dx, dy] of quarters)
            {
                const kind = ((inside(x + dx, y) ? 'h' : '') + (inside(x, y + dy) ? 'v' : '') + (inside(x + dx, y + dy) ? 'd' : '')) || 'o';
                const piece = document.createElement('img');
                piece.src = SP.back(name, kind);
                piece.draggable = false;
                piece.alt = '';
                const width = 97*K, height = (name[0] == 'b' ? 95 : 94)*K;
                piece.style.left = (name[1] == 'l' ? left : left + 188*K - width) + 'px';
                piece.style.top = (name[0] == 't' ? top : top + 183*K - height) + 'px';
                piece.style.width = width + 'px';
                piece.style.height = height + 'px';
                layer.append(piece);
            }
        }

    for (let x = 0; x < columns; x++)
        for (let y = 0; y < rows; y++)
        {
            const cell = cells[x][y];
            const [cx, cy] = cellCenter(x, y);
            if (cell.hole)
            {
                if (opts.edit)
                    layer.append(place(h('div', { class: 'gap' }), cx, cy, TILE - 6, TILE - 6));
                continue;
            }
            if (cell.crate)
                layer.append(img(cell.crate == 1 ? SP.crateHit : SP.crate, cx, cy, 116.7*K));
            else if (cell.snow)
                layer.append(img(SP.snow, cx, cy + 2*K, 114*K));
            else if (cell.bonus)
            {
                layer.append(img(SP.socket, cx, cy, 109*K));
                layer.append(img(SP[cell.bonus] || SP.bomb, cx, cy, 91*K));
            }
            else
            {
                layer.append(img(cell.x2 ? SP.doubled : SP.tiles[cell.tint || 0], cx, cy, TILE));
                if (cell.ice)
                    layer.append(img(SP.ice, cx, cy, TILE, { opacity: 0.9 }));
                if (cell.stone)
                    layer.append(img(SP.stone, cx, cy, TILE));
                if (cell.chain && cell.letter)
                    layer.append(img(SP.chain, cx, cy, 121.6*K, { opacity: 0.75 }));
                // the letter shows through ice (bluish) and stone (pale), as on the game's board
                const tone = cell.ice ? ' on-ice' : cell.stone ? ' on-stone' : '';
                if (cell.letter)
                {
                    layer.append(place(h('div', { class: 'glyph' + tone + (cell.fixed ? ' fixed' : ''), text: cell.letter, style: { fontSize: Math.round(TILE*0.5) + 'px' } }), cx, cy - TILE*0.03, TILE, TILE));
                    if (cell.value !== undefined && cell.value !== null)
                        layer.append(place(h('div', { class: 'points' + tone, text: cell.value }), cx + TILE*0.3, cy + TILE*0.3, 14, 10));
                }
                else if (opts.edit && !cell.ice && !cell.stone)
                    layer.append(place(h('div', { class: 'glyph random', text: '·' }), cx, cy, TILE, TILE));
                if (cell.parcel)
                    layer.append(img(SP.parcel, cx, cy, 106.5*K));
            }
            if (cell.chain && !cell.letter)
                layer.append(img(SP.chain, cx, cy, 121.6*K));
            if (cell.crate > 1)
                layer.append(place(h('div', { class: 'grade', text: '×' + cell.crate }), cx + TILE*0.3, cy + TILE*0.34, 22, 15));
        }

    (opts.selection || []).forEach((cell, i) => {
        const [cx, cy] = cellCenter(cell.c, cell.r);
        layer.append(place(h('div', { class: 'sel' }), cx, cy, TILE, TILE));
        layer.append(place(h('div', { class: 'order', text: i + 1 }), cx - TILE*0.3, cy - TILE*0.34, 16, 14));
    });
    for (const cell of opts.burned || [])
    {
        const [cx, cy] = cellCenter(cell.c, cell.r);
        layer.append(place(h('div', { class: 'burn' }), cx, cy, TILE*1.3, TILE*1.3));
    }
    if (opts.aim)
    {
        const [cx, cy] = cellCenter(opts.aim.c, opts.aim.r);
        layer.append(place(h('div', { class: 'aim' }), cx, cy, TILE, TILE));
    }
    if (opts.edit)
        for (let x = 0; x < columns; x++)
            for (let y = 0; y < rows; y++)
            {
                const [cx, cy] = cellCenter(x, y);
                layer.append(place(h('div', { class: 'cell-hit', 'data-x': x, 'data-y': y }), cx, cy, PX - 2, PY - 2));
            }
    container.replaceChildren(layer);
}

// ================= editor =================

const tools = [
    { group: 'Поле', items: [['cell', 'Клетка — вернуть пустую клетку в поле', 'Digit1', '1'], ['gap', 'Пустота — убрать клетку из поля, буквы пролетают её', 'Digit2', '2']] },
    { group: 'Блокеры', items: [['ice', 'Лёд', 'Digit3', '3'], ['stone', 'Камень — ломают только бонусы', 'Digit4', '4'],
                                ['crate', 'Ящик: щелчок +1 к прочности, правая кнопка −1, колёсико', 'Digit5', '5'], ['chain', 'Цепь — держит колонку над собой', 'Digit6', '6'],
                                ['snow', 'Снежок', 'Digit7', '7'], ['parcel', 'Конверт', 'Digit8', '8']] },
    { group: 'Бонусы', items: [['bomb', 'Бомба', 'Digit9', '9'], ['rocket', 'Ракета', 'Digit0', '0'], ['fireworks', 'Салют', 'KeyF', 'F']] },
    { group: 'Ещё', items: [['letter', 'Буква клетки (на языке оценки)', 'KeyL', 'L'], ['eraser', 'Ластик — снять всё с клетки', 'KeyE', 'E']] }
];
const toolSprites = { cell: SP.tiles[0], ice: SP.ice, stone: SP.stone, crate: SP.crate, chain: SP.chain, snow: SP.snow, parcel: SP.parcel,
                      bomb: SP.bomb, rocket: SP.rocket, fireworks: SP.fireworks };

function toolButton([tool, title, , key])
{
    const face = toolSprites[tool] ? h('img', { src: toolSprites[tool], alt: '' })
        : tool == 'letter' ? h('span', { class: 'letter-icon', text: 'А' }) : icon(tool == 'gap' ? 'gap' : 'eraser');
    return h('button', { class: 'tool' + (S.tool == tool ? ' on' : ''), title: title + '  [' + key + ']', type: 'button',
                         onclick: () => { S.tool = tool; renderTools(); } }, face, h('kbd', { text: key }));
}

function renderTools()
{
    const node = $('tools');
    if (!node)
        return;
    node.replaceChildren(
        h('div', { class: 'tool-groups' }, tools.map((group, i) => [i ? h('div', { class: 'tool-sep' }) : null, group.items.map(toolButton)])),
        h('div', { class: 'tool-options' },
            h('button', { class: 'btn sm' + (S.mirror ? ' on' : ''), type: 'button', title: 'Рисовать зеркально относительно средней колонки  [M]', onclick: () => { S.mirror = !S.mirror; renderTools(); } },
                icon('mirror'), 'Симметрия'),
            h('span', { class: 'tool-hint', title: 'Левая кнопка ставит, правая убирает; можно вести мышью по клеткам. Колёсико над ящиком меняет прочность.', text: 'ПКМ — убрать' }),
            h('div', { class: 'grow' }),
            h('button', { class: 'btn sm', type: 'button', title: 'Выбрать форму поля из каталога', onclick: openShapes }, icon('shape'), 'Форма'),
            h('button', { class: 'btn sm', type: 'button', title: 'Переложить блокеры и бонусы по симметричным шаблонам: их виды и число остаются', onclick: relayoutDraft },
                icon('layout'), 'Разложить')));
}

function renderBoard()
{
    const board = $('board');
    if (!board || !S.draft)
        return;
    drawBoard(board, (x, y) => {
        const content = contentAt(S.draft, x, y);
        return { ...content, fixed: !!content.letter };
    }, { edit: true });
    renderBoardInfo();
}

function renderBoardInfo()
{
    const info = $('boardInfo');
    if (!info || !S.draft)
        return;
    const level = S.draft;
    const holes = (level.holeCells || []).length;
    const blocked = ['crateCells', 'snowCells', 'parcelCells', 'powerupCells', 'iceCells', 'stoneCells'].reduce((sum, name) => sum + (level[name] || []).length, 0);
    const shape = shapeOf(level.holeCells);
    const chips = [
        h('span', { class: 'chip', title: 'Форма поля из каталога' }, icon('shape'), shape ? shape.name : 'своя форма'),
        h('span', { class: 'chip num', title: 'Клеток в поле' }, 'клеток ' + (columns*rows - holes)),
        h('span', { class: 'chip num', title: 'Клеток со свободной буквой на старте: без льда, камня, ящика, снежка, конверта и бонуса' }, 'свободных букв ' + (columns*rows - holes - blocked))
    ];
    if (S.shapeInfo && S.shapeInfo.islands > 1)
        chips.push(h('span', { class: 'chip warn', title: 'Части поля не касаются друг друга: кластер букв через пустоту не собрать' }, 'островов ' + S.shapeInfo.islands));
    if (shape && shape.hardness !== undefined)
    {
        const label = hardnessLabel(shape);
        chips.push(h('span', { class: 'chip ' + label.kind, title: 'По замеру ботов: очков за ход ' + pct(shape.factor) + ', длинных слов ' + pct(shape.longFactor) + ' от полного поля' },
            'форма ' + label.text));
    }
    info.replaceChildren(...chips);
    $('problems').replaceChildren(...S.problems.map((text) => h('div', { class: 'problem' }, icon('warn'), h('span', { text }))));
}

function bindBoard()
{
    const board = $('board');
    let stroke = null;
    const hitAt = (event) => {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const hit = target && target.closest && target.closest('.cell-hit');
        return hit && board.contains(hit) ? [Number(hit.dataset.x), Number(hit.dataset.y)] : null;
    };
    board.addEventListener('contextmenu', (event) => event.preventDefault());
    board.addEventListener('pointerdown', (event) => {
        const cell = hitAt(event);
        if (!cell || !S.draft)
            return;
        event.preventDefault();
        const [x, y] = cell;
        const right = event.button == 2;
        if (S.tool == 'letter')
        {
            if (right)
                edit((draft) => dropLetter(draft, x, y));
            else
                editLetter(x, y);
            return;
        }
        if (S.tool == 'crate')
        {
            edit((draft) => { for (const [cx, cy] of withMirror(x, y)) stepCrate(draft, cx, cy, right ? -1 : 1); });
            return;
        }
        const put = !right && !toolPresent(S.draft, S.tool, x, y);
        stroke = { put, seen: new Set([x + ',' + y]) };
        edit((draft) => { for (const [cx, cy] of withMirror(x, y)) paintCell(draft, S.tool, cx, cy, put); });
        board.setPointerCapture(event.pointerId);
    });
    board.addEventListener('pointermove', (event) => {
        if (!stroke)
            return;
        const cell = hitAt(event);
        if (!cell || stroke.seen.has(cell.join(',')))
            return;
        stroke.seen.add(cell.join(','));
        // the rest of a stroke joins its first step of undo
        for (const [cx, cy] of withMirror(cell[0], cell[1]))
            paintCell(S.draft, S.tool, cx, cy, stroke.put);
        afterEdit();
    });
    const end = () => { stroke = null; };
    board.addEventListener('pointerup', end);
    board.addEventListener('pointercancel', end);
    board.addEventListener('wheel', (event) => {
        const cell = hitAt(event);
        if (!cell || S.tool != 'crate')
            return;
        event.preventDefault();
        edit((draft) => { for (const [cx, cy] of withMirror(cell[0], cell[1])) stepCrate(draft, cx, cy, event.deltaY < 0 ? 1 : -1); });
    }, { passive: false });
}

function editLetter(x, y)
{
    const content = contentAt(S.draft, x, y);
    if (content.hole || content.crate || content.snow || content.parcel || content.bonus)
    {
        toast('Букву можно задать только клетке с плиткой');
        return;
    }
    const alphabet = S.state.languages.find((item) => item.code == language()).alphabet;
    const answer = prompt('Буква клетки (' + language().toUpperCase() + '); пусто — случайная', content.letter || '');
    if (answer === null)
        return;
    const letter = answer.trim().toUpperCase().replace('Ё', 'Е').slice(0, 1);
    if (letter && !alphabet.includes(letter))
    {
        toast('Буквы «' + letter + '» нет в алфавите языка ' + language().toUpperCase(), 'bad');
        return;
    }
    edit((draft) => {
        dropLetter(draft, x, y);
        if (letter)
            letterList(draft, true).push({ x, y, letter });
    });
}

function edit(change)
{
    S.history.push(JSON.stringify(S.draft));
    if (S.history.length > 300)
        S.history.shift();
    S.future = [];
    change(S.draft);
    afterEdit();
}

function afterEdit(forceProps)
{
    S.state.campaign[S.selected] = clone(S.draft);
    S.state.meta[S.draft.id] = { ...metaOf(S.draft), dirty: true };
    renderBoard();
    renderProps(forceProps);
    renderEditorHead();
    renderLevelRow(S.selected);
    renderInspector();
    renderChart();
    renderKpis();
    setSaveState('pending');
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(save, 600);
}

function setSaveState(state)
{
    const node = $('saveState');
    if (node)
        node.replaceChildren(state == 'pending' ? h('span', { class: 'muted', style: { fontSize: '12px' }, text: 'сохраняется…' })
            : state == 'saved' ? h('span', { class: 'muted', style: { fontSize: '12px' }, title: 'Записано в Assets/WordFall/campaign.json', text: 'сохранено' }) : '');
}

async function save()
{
    clearTimeout(S.saveTimer);
    S.saveTimer = 0;
    const id = S.draft.id;
    const result = await guarded(() => call('POST', '/api/level', { id, level: S.draft }));
    if (!result)
        return;
    S.state.game = result.game;
    renderGameStatus();
    if (S.draft && S.draft.id == id)
    {
        setSaveState('saved');
        validateDraft();
    }
}

function flushSave()
{
    if (S.saveTimer)
        save();
}

async function validateDraft()
{
    if (!S.draft)
        return;
    const result = await guarded(() => call('POST', '/api/validate', { level: S.draft }));
    if (!result)
        return;
    S.problems = result.problems;
    S.shapeInfo = result.shape;
    renderBoardInfo();
}

function undo()
{
    if (S.history.length == 0)
        return;
    S.future.push(JSON.stringify(S.draft));
    S.draft = JSON.parse(S.history.pop());
    afterEdit(true);
}

function redo()
{
    if (S.future.length == 0)
        return;
    S.history.push(JSON.stringify(S.draft));
    S.draft = JSON.parse(S.future.pop());
    afterEdit(true);
}

function selectLevel(index)
{
    flushSave();
    if (!S.state.campaign.length)
        return;
    S.selected = Math.min(Math.max(index, 0), S.state.campaign.length - 1);
    S.draft = clone(levelAt(S.selected));
    S.history = [];
    S.future = [];
    S.problems = [];
    S.shapeInfo = null;
    renderEditor();
    renderLevelList();
    renderInspector();
    renderChart();
    validateDraft();
    const row = document.querySelector('.level-row.selected');
    if (row)
        row.scrollIntoView({ block: 'nearest' });
}

function renderEditorHead()
{
    const head = $('editorHead');
    const level = S.draft;
    if (!level)
    {
        head.replaceChildren(h('h2', { text: 'Нет уровней' }));
        return;
    }
    if (document.activeElement && document.activeElement.id == 'levelName')
        return;
    const point = targetAt(S.selected);
    head.replaceChildren(
        h('h2', { text: 'Уровень ' + (S.selected + 1) }),
        h('span', { class: 'chip', title: 'Постоянный id уровня', text: level.id }),
        h('span', { class: 'chip tier tier-' + point.tier }, h('span', { class: 'dot' }), tierNames[point.tier]),
        h('input', { id: 'levelName', class: 'input', placeholder: 'Название, необязательно', value: level.name || '',
                     onchange: (event) => edit((draft) => { const name = event.target.value.trim(); if (name) draft.name = name; else delete draft.name; }) }),
        h('div', { class: 'grow' }),
        h('span', { id: 'saveState' }),
        h('button', { class: 'btn ghost icon', title: 'Отменить  [⌘Z]', disabled: S.history.length == 0, onclick: undo }, icon('undo')),
        h('button', { class: 'btn ghost icon', title: 'Вернуть  [⇧⌘Z]', disabled: S.future.length == 0, onclick: redo }, icon('redo')),
        h('button', { class: 'btn', disabled: !S.state.game.binary,
                      title: S.state.game.binary ? 'Открыть этот уровень в игре и сыграть самому' : 'Игра не собрана: ' + S.state.game.binaryPath,
                      onclick: () => playYourself() }, icon('gamepad'), 'Играть'));
}

function renderEditor()
{
    renderEditorHead();
    const body = $('editorBody');
    if (!S.draft)
    {
        body.replaceChildren(h('div', { class: 'empty', text: 'В кампании нет уровней — добавьте уровень или запустите генерацию.' }));
        return;
    }
    if (!$('board'))
    {
        body.replaceChildren(
            h('div', { class: 'board-col' },
                h('div', { class: 'card tools', id: 'tools' }),
                h('div', { class: 'card board-card' }, h('div', { id: 'board', class: 'board' })),
                h('div', { class: 'board-info', id: 'boardInfo' }),
                h('div', { class: 'problems', id: 'problems' })),
            h('div', { class: 'props-col', id: 'props' }));
        bindBoard();
    }
    renderTools();
    renderBoard();
    renderProps(true);
}

function card(title, extra, ...children)
{
    return h('div', { class: 'card' }, h('div', { class: 'card-title' }, title, extra ? h('span', { class: 'muted', text: extra }) : null), ...children);
}

function renderProps(force)
{
    const root = $('props');
    const level = S.draft;
    if (!root || !level)
        return;
    // typing into a field must not lose the focus: what it changes is already on screen
    if (!force && root.contains(document.activeElement) && document.activeElement.matches('input, select'))
        return;
    const code = language();
    const set = (apply) => (value) => edit((draft) => apply(draft, value));

    const limits = card('Ходы и очки', 'их ставит подгонка',
        h('div', { class: 'grid-2' },
            field('Ходов', numberInput(level.moves === undefined ? 12 : level.moves, set((d, v) => { d.moves = Math.max(1, Math.round(v)); }), { min: 1, max: 60 })),
            field('Цель по очкам', numberInput(level.targetScore === undefined ? 250 : level.targetScore, set((d, v) => { d.targetScore = Math.max(10, Math.round(v)); }), { min: 10, step: 10 }))));

    const words = card('Слова уровня', 'через запятую',
        S.state.languages.map((lang) => h('div', { class: 'word-row' },
            h('span', { class: 'lang', text: lang.code }),
            h('input', { class: 'input' + (S.problems.some((text) => text.startsWith(lang.code + ':')) ? ' bad' : ''), value: ((level.words || {})[lang.code] || []).join(', '),
                         placeholder: lang.code == 'ru' ? 'КОТ, ЛУНА' : 'CAT, MOON', spellcheck: 'false',
                         onchange: (event) => edit((draft) => {
                             draft.words = draft.words && !Array.isArray(draft.words) ? draft.words : {};
                             const list = event.target.value.toUpperCase().replace(/Ё/g, 'Е').split(/[\s,;]+/).filter(Boolean);
                             if (list.length > 0) draft.words[lang.code] = list; else delete draft.words[lang.code];
                         }) }))));

    const tasks = level.tasks || [];
    const taskRow = (task, i) => {
        const setTask = (name, value) => edit((draft) => { draft.tasks[i][name] = value; });
        const type = task.taskType;
        const params = [];
        if (type == 'Length')
            params.push(h('label', {}, 'букв', numberInput(task.length || 4, (v) => setTask('length', Math.min(8, Math.max(2, Math.round(v)))), { min: 2, max: 8 })));
        if (type == 'Powerup')
            params.push(h('select', { class: 'select', onchange: (event) => setTask('powerupKind', event.target.value) },
                Object.keys(bonusNames).map((kind) => h('option', { value: kind, text: bonusNames[kind], selected: (task.powerupKind || 'bomb') == kind }))));
        if (type == 'Letter')
            for (const lang of S.state.languages)
                params.push(h('label', {}, lang.code, h('input', { class: 'input', style: { width: '32px', textAlign: 'center', padding: '0 4px' }, maxlength: 1, value: (task.letter || {})[lang.code] || '',
                    onchange: (event) => edit((draft) => {
                        const letters = { ...(draft.tasks[i].letter && typeof draft.tasks[i].letter == 'object' ? draft.tasks[i].letter : {}) };
                        letters[lang.code] = event.target.value.toUpperCase().replace('Ё', 'Е').slice(0, 1);
                        draft.tasks[i].letter = letters;
                    }) })));
        if (type == 'WordScore')
            params.push(h('label', {}, 'от', numberInput(task.scoreThreshold || 18, (v) => setTask('scoreThreshold', Math.max(1, Math.round(v))), { min: 1 })));
        if (['Length', 'Powerup', 'AnyWords', 'Letter', 'Deliver', 'Melt'].includes(type))
            params.push(h('label', {}, '×', numberInput(task.count || 1, (v) => setTask('count', Math.max(1, Math.round(v))), { min: 1, max: 60 })));
        const face = type == 'Powerup' ? h('img', { src: SP[task.powerupKind || 'bomb'], alt: '' })
            : taskIcons[type] ? h('img', { src: taskIcons[type], alt: '' })
            : h('span', { class: 'chip', style: { padding: '0', width: '22px', justifyContent: 'center' },
                          text: type == 'Letter' ? ((task.letter || {})[code] || '?') : type == 'Length' ? String(task.length || 4) : type == 'WordScore' ? '★' : '∑' });
        return h('div', { class: 'task' }, face,
            h('select', { class: 'select', onchange: (event) => edit((draft) => { draft.tasks[i] = { taskType: event.target.value, ...(event.target.value == 'Letter' ? { letter: {} } : {}) }; }) },
                S.state.taskTypes.map((name) => h('option', { value: name, text: taskNames[name] || name, selected: name == type }))),
            h('button', { class: 'btn ghost sm icon', title: 'Убрать задание', onclick: () => edit((draft) => { draft.tasks.splice(i, 1); }) }, icon('close')),
            h('div', { class: 'params' }, params));
    };
    const taskCard = card('Задания', tasks.length + ' из 5',
        h('div', { class: 'task-list' }, tasks.map(taskRow)),
        h('button', { class: 'btn ghost block', style: { marginTop: tasks.length ? '8px' : '0' }, disabled: tasks.length >= 5,
                      onclick: () => edit((draft) => { draft.tasks = draft.tasks || []; draft.tasks.push({ taskType: 'AnyWords', count: 5 }); }) }, icon('plus'), 'Добавить задание'),
        h('div', { class: 'help', style: { marginTop: '8px' }, text: 'Победа: найдены все слова уровня, закрыты задания и набрана цель по очкам.' }));

    const charges = level.boosterCharges || [3, 3, 3, 3, 3];
    const boosters = card('Бустеры в прогонах', null, h('div', { class: 'grid-5' }, charges.map((count, i) => h('label', { class: 'booster' }, h('span', { text: boosterNames[i] }),
        numberInput(count, set((d, v) => { d.boosterCharges = (d.boosterCharges || [3, 3, 3, 3, 3]).slice(); d.boosterCharges[i] = Math.max(0, Math.round(v)); }), { min: 0, max: 99 })))),
        h('div', { class: 'help', style: { marginTop: '8px' }, text: 'С ними уровень играют боты и проба в игре. В кампании у игрока свой запас на всю игру — уровень его не пополняет.' }));

    const flow = card('Мешок букв и падающие', null,
        h('div', { class: 'grid-3' },
            field('+ гласных', numberInput(level.extraVowels || 0, set((d, v) => { d.extraVowels = Math.max(0, Math.round(v)); }), { min: 0, max: 20, title: 'Добавить гласных в мешок букв уровня' })),
            field('+ редких', numberInput(level.extraRare || 0, set((d, v) => { d.extraRare = Math.max(0, Math.round(v)); }), { min: 0, max: 20, title: 'Добавить редких букв: Ж, Ш, Щ…' })),
            field('Снежков за ход', numberInput(level.snowPerMove || 0, set((d, v) => { d.snowPerMove = Math.max(0, Math.round(v)); }), { min: 0, max: 7 })),
            field('Конвертов всего', numberInput(level.parcelTotal || 0, set((d, v) => { d.parcelTotal = Math.max(0, Math.round(v)); }), { min: 0, max: 20 })),
            field('…из них на поле', numberInput(level.parcelOnScreen || 1, set((d, v) => { d.parcelOnScreen = Math.max(1, Math.round(v)); }), { min: 1, max: 7 }))));

    const agent = h('div', { class: 'card' }, h('details', { class: 'more' }, h('summary', { text: 'Подбор слов самой игрой' }),
        h('div', { class: 'body' },
            h('div', { class: 'grid-3' },
                field('Сложность 1–10', numberInput(level.difficulty || 3, set((d, v) => { d.difficulty = Math.min(10, Math.max(1, Math.round(v))); }), { min: 1, max: 10 })),
                field('Ещё слов', numberInput(level.wordsAuto || 0, set((d, v) => { d.wordsAuto = Math.max(0, Math.round(v)); }), { min: 0, max: 6 })),
                h('label', { class: 'field' }, h('span', { text: 'Цель считает игра' }), h('div', { style: { height: '28px', display: 'flex', alignItems: 'center' } },
                    h('input', { type: 'checkbox', checked: !!level.autoTarget, onchange: (event) => edit((draft) => { draft.autoTarget = event.target.checked; }) })))),
            h('div', { class: 'help', style: { marginTop: '8px' }, text: 'Сложность заполняет оценка ботами. Если задать «ещё слов», игра на старте уровня сама подберёт слова этой сложности.' }))));

    root.replaceChildren(limits, words, taskCard, boosters, flow, agent);
}

async function relayoutDraft()
{
    const result = await guarded(() => call('POST', '/api/layout', { level: S.draft }));
    if (!result)
        return;
    edit((draft) => {
        for (const name of [...blockLists, 'crateGrades', 'powerupKinds'])
            delete draft[name];
        Object.assign(draft, result.level);
    });
    renderProps(true);
    toast(result.used.length ? 'Разложено: ' + result.used.map((item) => item.name).join(', ') : 'На уровне нет блокеров и бонусов');
}

// ================= level list =================

function rowParts(index)
{
    const level = levelAt(index);
    const meta = metaOf(level);
    const point = targetAt(index);
    const status = statusOf(index);
    const code = language();
    const shape = shapeOf(level.holeCells);
    const blockers = [['crateCells', 'ящики'], ['iceCells', 'лёд'], ['snowCells', 'снег'], ['parcelCells', 'конверты'], ['chainCells', 'цепи'], ['stoneCells', 'камни'], ['powerupCells', 'бонусы']]
        .filter(([name]) => (level[name] || []).length > 0).map(([, name]) => name);
    const line2 = [(level.moves || 12) + ' ход.', shape ? shape.name : null, blockers.join(', ') || null].filter(Boolean).join(' · ');
    return [
        h('div', { class: 'bar' }),
        h('div', { class: 'n', text: index + 1 }),
        h('div', { style: { minWidth: '0' } },
            h('div', { class: 't1', text: ((level.words || {})[code] || []).join(' ') || '—' }),
            h('div', { class: 't2', text: line2, title: (level.tasks || []).map((task) => taskCaption(task, code)).join(', ') })),
        h('div', { class: 'v' },
            h('div', { class: 'v1 ' + (status == 'off' ? 'off' : status == 'stale' ? 'stale' : ''),
                       title: status == 'off' ? 'Оценка ботами вне допуска цели' : status == 'stale' ? 'Уровень изменён после оценки' : 'Попыток среднего игрока по оценке ботов',
                       text: meta.stats ? attempts(meta.stats.attempts) + (status == 'stale' ? '*' : '') : '—' }),
            h('div', { class: 'v2', text: 'цель ' + fmt(point.target) }))
    ];
}

function rowVisible(index)
{
    const level = levelAt(index);
    const point = targetAt(index);
    const status = statusOf(index);
    if (S.filter == 'peaks' && point.tier != 'hard' && point.tier != 'super')
        return false;
    if (S.filter == 'off' && status != 'off')
        return false;
    if (S.filter == 'stale' && status != 'stale' && status != 'none')
        return false;
    const text = $('levelFilter').value.trim().toUpperCase();
    if (!text)
        return true;
    const code = language();
    const shape = shapeOf(level.holeCells);
    const hay = [index + 1, level.id, level.name || '', ((level.words || {})[code] || []).join(' '), (level.tasks || []).map((task) => taskCaption(task, code)).join(' '),
                 tierNames[point.tier], shape ? shape.name : ''].join(' ').toUpperCase();
    return hay.includes(text);
}

function renderLevelRow(index)
{
    const row = document.querySelector('.level-row[data-index="' + index + '"]');
    if (row)
        row.replaceChildren(...rowParts(index));
}

function renderLevelList()
{
    const counts = { all: S.state.campaign.length, peaks: 0, off: 0, stale: 0 };
    S.state.campaign.forEach((level, index) => {
        const tier = targetAt(index).tier, status = statusOf(index);
        counts.peaks += tier == 'hard' || tier == 'super' ? 1 : 0;
        counts.off += status == 'off' ? 1 : 0;
        counts.stale += status == 'stale' || status == 'none' ? 1 : 0;
    });
    $('levelTabs').replaceChildren(...[['all', 'Все'], ['peaks', 'Пики'], ['off', 'Вне цели'], ['stale', 'Без оценки']].map(([key, label]) =>
        h('button', { class: S.filter == key ? 'on' : '', type: 'button', onclick: () => { S.filter = key; renderLevelList(); } }, label, key == 'all' ? null : [' ', h('span', { class: 'muted num', text: counts[key] })])));

    const rowsList = [];
    S.state.campaign.forEach((level, index) => {
        if (rowVisible(index))
            rowsList.push(h('div', { class: 'level-row tier-' + targetAt(index).tier + (index == S.selected ? ' selected' : ''), 'data-index': index,
                                     onclick: () => selectLevel(index) }, rowParts(index)));
    });
    $('levelList').replaceChildren(...(rowsList.length ? rowsList : [h('div', { class: 'empty', text: 'Нет уровней под фильтр' })]));
    $('levelTools').replaceChildren(
        h('button', { class: 'btn ghost icon', title: 'Новый уровень после выбранного', onclick: () => structure('add') }, icon('plus')),
        h('button', { class: 'btn ghost icon', title: 'Копия выбранного уровня', onclick: () => structure('duplicate') }, icon('copy')),
        h('button', { class: 'btn ghost icon', title: 'Переместить выше', disabled: S.selected <= 0, onclick: () => structure('move', { to: S.selected - 1 }) }, icon('up')),
        h('button', { class: 'btn ghost icon', title: 'Переместить ниже', disabled: S.selected >= S.state.campaign.length - 1, onclick: () => structure('move', { to: S.selected + 1 }) }, icon('down')),
        h('div', { class: 'grow' }),
        h('span', { class: 'muted num', style: { fontSize: '12px', marginRight: '6px' }, text: S.state.campaign.length + ' ' + plural(S.state.campaign.length, 'уровень', 'уровня', 'уровней') }),
        h('button', { class: 'btn ghost icon danger', title: 'Удалить уровень', disabled: S.state.campaign.length <= 1,
                      onclick: () => { if (confirm('Удалить уровень ' + (S.selected + 1) + ' (' + S.draft.id + ')?')) structure('delete'); } }, icon('trash')));
}

async function structure(op, extra)
{
    flushSave();
    const next = await guarded(() => call('POST', '/api/structure', { op, id: S.draft ? S.draft.id : '', ...(extra || {}) }));
    if (!next)
        return;
    S.state = next;
    const at = op == 'move' ? extra.to : op == 'delete' ? Math.min(S.selected, next.campaign.length - 1) : S.selected + 1;
    renderKpis();
    selectLevel(at);
}

// ================= curve chart =================

const yTicks = [1, 1.5, 2, 3, 5, 8, 13, 20, 35, 50];

function chartGeometry()
{
    const box = $('chart').getBoundingClientRect();
    const width = Math.max(400, box.width - 16), height = Math.max(100, box.height - 8);
    const left = 34, right = 8, top = 10, bottom = 18;
    const count = Math.max(S.state.campaign.length, S.state.targets.length, 1);
    let max = 2;
    S.state.targets.forEach((point) => { max = Math.max(max, point.target); });
    S.state.campaign.forEach((level) => { const stats = metaOf(level).stats; if (stats) max = Math.max(max, Math.min(stats.profiles.average.attemptsHi || stats.attempts, 50)); });
    max = [2, 3, 5, 8, 13, 20, 35, 50].find((tick) => tick >= max*1.05) || 50;
    const x = (index) => left + (count == 1 ? 0.5 : index/(count - 1))*(width - left - right);
    const y = (value) => top + (1 - Math.log(Math.min(Math.max(value, 1), max))/Math.log(max))*(height - top - bottom);
    const valueAt = (py) => Math.exp((1 - (py - top)/(height - top - bottom))*Math.log(max));
    const indexAt = (px) => Math.min(count - 1, Math.max(0, Math.round((px - left)/(width - left - right)*(count - 1))));
    return { width, height, left, right, top, bottom, count, max, x, y, valueAt, indexAt };
}

function renderChart()
{
    if (!S.curveOpen || !S.state)
        return;
    const g = chartGeometry();
    const parts = ['<svg viewBox="0 0 ' + g.width + ' ' + g.height + '" preserveAspectRatio="none">'];
    for (const tick of yTicks.filter((value) => value <= g.max))
    {
        parts.push('<line class="grid-line" x1="' + g.left + '" x2="' + (g.width - g.right) + '" y1="' + g.y(tick) + '" y2="' + g.y(tick) + '"/>');
        parts.push('<text class="axis" x="' + (g.left - 6) + '" y="' + (g.y(tick) + 3.5) + '" text-anchor="end">' + tick + '</text>');
    }
    const step = g.count > 60 ? 10 : g.count > 25 ? 5 : 1;
    for (let index = 0; index < g.count; index++)
        if ((index + 1) % step == 0 || index == 0)
            parts.push('<text class="axis" x="' + g.x(index) + '" y="' + (g.height - 3) + '" text-anchor="middle">' + (index + 1) + '</text>');

    if (S.selected < g.count)
    {
        const band = Math.max(6, (g.width - g.left - g.right)/Math.max(1, g.count - 1));
        parts.push('<rect class="sel-band" x="' + (g.x(S.selected) - band/2) + '" y="' + g.top + '" width="' + band + '" height="' + (g.height - g.top - g.bottom) + '" rx="2"/>');
    }

    const targets = S.state.targets;
    if (targets.length > 0)
        parts.push('<path class="plan" d="' + targets.map((point, index) => (index ? 'L' : 'M') + g.x(index).toFixed(1) + ' ' + g.y(point.target).toFixed(1)).join(' ') + '"/>');

    S.state.campaign.forEach((level, index) => {
        const stats = metaOf(level).stats;
        if (!stats)
            return;
        const average = stats.profiles.average;
        parts.push('<line class="whisker" x1="' + g.x(index) + '" x2="' + g.x(index) + '" y1="' + g.y(average.attemptsLo) + '" y2="' + g.y(average.attemptsHi) + '"/>');
    });

    targets.forEach((point, index) => {
        const cx = g.x(index), cy = g.y(point.target);
        if (point.tier == 'hard' || point.tier == 'super')
        {
            const r = point.tier == 'super' ? 5.5 : 4.5;
            parts.push('<rect class="peak ' + point.tier + (point.manual ? ' manual' : '') + '" x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + 2*r + '" height="' + 2*r +
                       '" rx="1.5" transform="rotate(45 ' + cx + ' ' + cy + ')"/>');
        }
        else if (point.manual)
            parts.push('<circle class="plan-dot manual" cx="' + cx + '" cy="' + cy + '" r="3.5"/>');
    });

    S.state.campaign.forEach((level, index) => {
        const stats = metaOf(level).stats;
        if (!stats)
            return;
        const status = statusOf(index);
        parts.push('<circle class="bot' + (status == 'off' ? ' off' : status == 'stale' ? ' stale' : '') + '" cx="' + g.x(index) + '" cy="' + g.y(stats.attempts) + '" r="' + (status == 'off' ? 4 : 3.2) + '"/>');
    });

    if (S.hover >= 0 && S.hover < g.count)
        parts.push('<line class="cursor" x1="' + g.x(S.hover) + '" x2="' + g.x(S.hover) + '" y1="' + g.top + '" y2="' + (g.height - g.bottom) + '"/>');
    parts.push('</svg>');
    $('chart').innerHTML = parts.join('');
}

function chartTooltip(event, index)
{
    const level = levelAt(index);
    const point = targetAt(index);
    const meta = metaOf(level);
    const stats = meta.stats;
    const lines = ['<div class="tt-head"><span class="dot tier-' + point.tier + '" style="background:var(--tier)"></span>Уровень ' + (index + 1) + ' · ' + tierNames[point.tier] + '</div>',
                   'план: <b>' + fmt(point.target) + '</b> попыток' + (point.manual ? ' — задан вручную' : '')];
    if (stats)
    {
        const average = stats.profiles.average;
        lines.push('боты: <b>' + attempts(stats.attempts) + '</b> (' + attempts(average.attemptsLo) + '–' + attempts(average.attemptsHi) + ')' + (meta.dirty ? ', уровень с тех пор менялся' : ''));
        lines.push('слабый ' + attempts((stats.profiles.weak || {}).attempts) + ' · сильный ' + attempts((stats.profiles.strong || {}).attempts));
    }
    if (level)
        lines.push('<span class="muted">' + ((level.words || {})[language()] || []).join(', ') + ' · ' + (level.moves || 12) + ' ход. · ' + (level.targetScore || 250) + ' оч.</span>');
    showTooltip(event, lines.join('<br>'));
}

function showTooltip(event, html)
{
    const node = $('tooltip');
    node.innerHTML = html;
    node.classList.remove('hidden');
    const box = node.getBoundingClientRect();
    node.style.left = Math.min(window.innerWidth - box.width - 10, event.clientX + 14) + 'px';
    node.style.top = Math.min(window.innerHeight - box.height - 10, event.clientY + 16) + 'px';
}

function hideTooltip() { $('tooltip').classList.add('hidden'); }

function bindChart()
{
    const chart = $('chart');
    const local = (event) => { const box = chart.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; };
    const nearPlan = (point, g) => {
        const index = g.indexAt(point.x);
        return index < S.state.targets.length && Math.abs(g.y(S.state.targets[index].target) - point.y) < 9 ? index : -1;
    };
    chart.addEventListener('mousedown', (event) => {
        const g = chartGeometry();
        const point = local(event);
        const plan = nearPlan(point, g);
        S.drag = plan >= 0 ? { index: plan, moved: false, startY: point.y } : null;
        if (plan < 0)
        {
            const index = g.indexAt(point.x);
            if (index < S.state.campaign.length)
                selectLevel(index);
        }
        event.preventDefault();
    });
    window.addEventListener('mousemove', (event) => {
        if (!S.curveOpen || !S.state)
            return;
        const g = chartGeometry();
        const point = local(event);
        if (S.drag)
        {
            if (Math.abs(point.y - S.drag.startY) > 3)
                S.drag.moved = true;
            if (S.drag.moved)
            {
                const value = Math.round(Math.min(Math.max(g.valueAt(point.y), 1), g.max)*20)/20;
                S.state.targets[S.drag.index] = { ...S.state.targets[S.drag.index], target: value, manual: true };
                S.hover = S.drag.index;
                renderChart();
                showTooltip(event, 'Уровень ' + (S.drag.index + 1) + ': план <b>' + fmt(value) + '</b> попыток');
            }
            return;
        }
        if (event.target.closest && event.target.closest('#chart'))
        {
            const index = g.indexAt(point.x);
            chart.style.cursor = nearPlan(point, g) >= 0 ? 'ns-resize' : 'pointer';
            if (index != S.hover)
            {
                S.hover = index;
                renderChart();
            }
            chartTooltip(event, index);
        }
        else if (S.hover >= 0)
        {
            S.hover = -1;
            renderChart();
            hideTooltip();
        }
    });
    window.addEventListener('mouseup', async () => {
        const drag = S.drag;
        S.drag = null;
        if (!drag)
            return;
        if (!drag.moved)
        {
            if (drag.index < S.state.campaign.length)
                selectLevel(drag.index);
            return;
        }
        const curve = clone(S.state.curve);
        curve.overrides[String(drag.index + 1)] = S.state.targets[drag.index].target;
        await saveCurve(curve);
    });
    chart.addEventListener('dblclick', async (event) => {
        const plan = nearPlan(local(event), chartGeometry());
        if (plan < 0 || !S.state.curve.overrides[String(plan + 1)])
            return;
        const curve = clone(S.state.curve);
        delete curve.overrides[String(plan + 1)];
        await saveCurve(curve);
    });
    new ResizeObserver(() => renderChart()).observe(chart);
}

function renderKpis()
{
    let plan = 0, measured = 0, evaluated = 0, off = 0;
    S.state.targets.forEach((point) => { plan += point.target; });
    S.state.campaign.forEach((level, index) => {
        const stats = metaOf(level).stats;
        if (stats) { measured += Math.min(stats.attempts, 50); evaluated++; }
        off += statusOf(index) == 'off' ? 1 : 0;
    });
    $('kpis').replaceChildren(
        h('div', { class: 'kpi', title: 'Сумма средних попыток по всем уровням: по плану и по оценке ботов' }, 'попыток на кампанию: план', h('b', { text: fmt(plan, 0) }), 'боты', h('b', { text: evaluated ? fmt(measured, 0) : '—' })),
        h('button', { class: 'kpi' + (off ? ' bad' : ''), title: 'Показать уровни вне допуска', onclick: () => { S.filter = 'off'; renderLevelList(); } }, 'вне цели', h('b', { text: off })),
        h('button', { class: 'kpi', title: 'Показать уровни без оценки', onclick: () => { S.filter = 'stale'; renderLevelList(); } }, 'оценено', h('b', { text: evaluated + ' / ' + S.state.campaign.length })));
}

async function saveCurve(curve)
{
    const result = await guarded(() => call('POST', '/api/curve', curve));
    if (!result)
        return;
    S.state.curve = result.curve;
    S.state.targets = result.targets;
    renderChart();
    renderKpis();
    renderLevelList();
    renderInspector();
    renderEditorHead();
    if (!$('curveDrawer').classList.contains('hidden'))
        renderCurveDrawer();
}

function toggleCurve()
{
    S.curveOpen = !S.curveOpen;
    $('chart').classList.toggle('hidden', !S.curveOpen);
    $('toggleCurve').replaceChildren(icon(S.curveOpen ? 'chevronUp' : 'chevronDown'));
    try { localStorage.setItem('levellab.curveOpen', S.curveOpen ? '1' : '0'); } catch (error) {}
    positionDrawer();
    renderChart();
}

// ================= curve drawer =================

function positionDrawer()
{
    $('curveDrawer').style.top = $('curvePanel').getBoundingClientRect().bottom + 'px';
}

function openCurveDrawer()
{
    const drawer = $('curveDrawer');
    if (!drawer.classList.contains('hidden'))
    {
        drawer.classList.add('hidden');
        return;
    }
    drawer.classList.remove('hidden');
    positionDrawer();
    renderCurveDrawer();
}

function renderCurveDrawer()
{
    const curve = S.state.curve;
    const row = (label, get, setValue, attrs, title) => [h('label', { text: label, title }), numberInput(get(curve), async (value) => {
        const next = clone(S.state.curve); setValue(next, value); await saveCurve(next);
    }, { step: 0.05, ...(attrs || {}) })];
    const group = (title, ...rowsList) => section(title, h('div', { class: 'form-rows' }, rowsList.flat()));
    const overrides = Object.keys(curve.overrides || {}).length;
    $('curveDrawer').replaceChildren(
        h('div', { class: 'pane-head' }, h('h2', { style: { fontSize: '13px' }, text: 'Параметры кривой' }), h('div', { class: 'grow' }),
            h('button', { class: 'btn ghost icon', title: 'Закрыть', onclick: () => $('curveDrawer').classList.add('hidden') }, icon('close'))),
        h('div', { class: 'pane-body' },
            h('div', { class: 'help', text: 'Цель уровня — среднее число попыток среднего игрока. График меняется сразу; сами уровни под новые цели подгоняет генерация.' }),
            group('Кампания', row('Уровней', (c) => c.count, (c, v) => { c.count = Math.round(v); }, { step: 1, min: 1 })),
            group('Обучение', row('Уровней без поражений', (c) => c.onboarding, (c, v) => { c.onboarding = Math.round(v); }, { step: 1, min: 0 }),
                  row('Цель в конце обучения', (c) => c.onboardingEnd, (c, v) => { c.onboardingEnd = v; }, { min: 1 })),
            group('Основная линия', row('Обычный уровень в конце', (c) => c.baseEnd, (c, v) => { c.baseEnd = v; }, { min: 1 }),
                  row('Форма роста', (c) => c.baseShape, (c, v) => { c.baseShape = v; }, { min: 0.2 }, 'Меньше 1 — рост раньше, больше 1 — к концу'),
                  row('Размах волны', (c) => c.wave, (c, v) => { c.wave = v; }, { min: 0, step: 0.02 }, 'Насколько уровни внутри волны отличаются, доля цели'),
                  row('Длина волны, уровней', (c) => c.block, (c, v) => { c.block = Math.round(v); }, { step: 1, min: 2 })),
            group('Сложные уровни', row('Первый', (c) => c.hard.first, (c, v) => { c.hard.first = Math.round(v); }, { step: 1, min: 0 }),
                  row('Каждый N-й', (c) => c.hard.every, (c, v) => { c.hard.every = Math.round(v); }, { step: 1, min: 1 }),
                  row('Цель в начале', (c) => c.hard.from, (c, v) => { c.hard.from = v; }, { min: 1 }),
                  row('Цель в конце', (c) => c.hard.to, (c, v) => { c.hard.to = v; }, { min: 1 })),
            group('Очень сложные', row('Первый', (c) => c.superHard.first, (c, v) => { c.superHard.first = Math.round(v); }, { step: 1, min: 0 }),
                  row('Каждый N-й', (c) => c.superHard.every, (c, v) => { c.superHard.every = Math.round(v); }, { step: 1, min: 1 }),
                  row('Цель в начале', (c) => c.superHard.from, (c, v) => { c.superHard.from = v; }, { min: 1 }),
                  row('Цель в конце', (c) => c.superHard.to, (c, v) => { c.superHard.to = v; }, { min: 1 })),
            group('Передышка', row('Уровень сразу после пика', (c) => c.relief, (c, v) => { c.relief = v; }, { min: 1 })),
            h('div', { class: 'stack' },
                h('button', { class: 'btn block', onclick: () => saveCurve({ ...S.state.defaults.curve, count: S.state.curve.count }) }, 'Типовая кривая матч-3'),
                h('button', { class: 'btn block', disabled: overrides == 0, onclick: () => saveCurve({ ...S.state.curve, overrides: {} }) },
                    'Сбросить ручные цели' + (overrides ? ' (' + overrides + ')' : '')))));
}

// ================= inspector =================

function setBusy(text)
{
    S.busy = text;
    renderInspector();
}

// The level's attempts on a log scale: the target as a mark, the bots' estimate as a dot with its 95 % interval
function scaleBar(stats, target)
{
    const average = stats ? stats.profiles.average : null;
    const max = Math.max(2, target*2.2, average ? Math.min(average.attemptsHi, 50)*1.1 : 0);
    const pos = (value) => Math.min(100, Math.max(0, Math.log(Math.max(value, 1))/Math.log(max)*100));
    const ticks = [1, 1.5, 2, 3, 5, 8, 13, 20, 35].filter((tick) => tick <= max);
    return h('div', { class: 'scale', style: { marginBottom: '14px' } },
        h('div', { class: 'track' }),
        average ? h('div', { class: 'ci', style: { left: pos(average.attemptsLo) + '%', width: Math.max(1, pos(Math.min(average.attemptsHi, 50)) - pos(average.attemptsLo)) + '%' } }) : null,
        h('div', { class: 'target', style: { left: pos(target) + '%' }, title: 'цель ' + fmt(target) }),
        average ? h('div', { class: 'value', style: { left: pos(stats.attempts) + '%' }, title: 'боты ' + attempts(stats.attempts) }) : null,
        h('div', { class: 'ticks' }, ticks.map((tick) => h('span', { style: { left: pos(tick) + '%' }, text: tick }))));
}

function renderInspector()
{
    const head = $('inspectorHead');
    const body = $('inspectorBody');
    const level = S.draft;
    if (!level)
    {
        head.replaceChildren(h('h2', { text: 'Сложность' }));
        body.replaceChildren();
        return;
    }
    const meta = metaOf(level);
    const stats = meta.stats;
    const point = targetAt(S.selected);
    const status = statusOf(S.selected);
    const running = !!S.busy || (S.state.job && S.state.job.state == 'running');
    const focused = document.activeElement && head.contains(document.activeElement);

    if (!focused)
        head.replaceChildren(h('h2', { style: { fontSize: '13px' }, text: 'Сложность' }), h('div', { class: 'grow' }),
            h('label', { class: 'row', style: { gap: '6px', fontSize: '12px', color: 'var(--text-3)' }, title: 'Цель уровня — попыток среднего игрока. Изменение ставит ручную точку на кривой' }, 'цель',
                numberInput(point.target.toFixed(2), async (value) => { const curve = clone(S.state.curve); curve.overrides[String(S.selected + 1)] = Math.max(1, value); await saveCurve(curve); },
                            { step: 0.05, min: 1, style: { width: '72px' } })));

    const nodes = [];
    const statusChip = status == 'ok' ? h('span', { class: 'chip good' }, icon('check'), 'в цели')
        : status == 'off' ? h('span', { class: 'chip bad' }, (stats.attempts > point.target ? 'сложнее' : 'легче') + ' на ' + pct(Math.abs(stats.attempts/point.target - 1)))
        : status == 'stale' ? h('span', { class: 'chip warn', title: 'Оценка сделана до последних правок — оцените заново' }, 'устарела')
        : h('span', { class: 'chip' }, 'не оценён');
    nodes.push(h('div', { class: 'card score-card' },
        h('div', { class: 'row', style: { alignItems: 'flex-start' } },
            h('div', { class: 'stack', style: { gap: '4px' } },
                h('div', { class: 'big' }, h('b', { text: stats ? attempts(stats.attempts) : '—' }), h('span', { class: 'unit', text: 'попыток' })),
                h('div', { class: 'muted', style: { fontSize: '12px' }, text: 'цель ' + fmt(point.target) + (stats ? ' · 95 %: ' + attempts(stats.profiles.average.attemptsLo) + '–' + attempts(stats.profiles.average.attemptsHi) : '') })),
            h('div', { class: 'grow' }), statusChip),
        scaleBar(stats, point.target),
        stats ? h('div', { class: 'mini-stats', style: { marginTop: '0' } },
            h('div', {}, h('div', { class: 'label', text: 'Побед' }), h('div', { class: 'value', text: pct(stats.winRate) }), h('div', { class: 'sub', text: 'из ' + stats.profiles.average.n })),
            h('div', { title: 'Сводный индекс: попытки трёх типов игроков с поправкой на запас ходов и безнадёжные поражения' },
                h('div', { class: 'label', text: 'Индекс' }), h('div', { class: 'value', text: fmt(stats.index) }), h('div', { class: 'sub', text: 'балл ' + stats.grade + '/10' })),
            h('div', { title: 'Во сколько раз слабому игроку нужно больше попыток, чем сильному' },
                h('div', { class: 'label', text: 'Разрыв' }), h('div', { class: 'value', text: stats.skillGap ? '×' + fmt(stats.skillGap, 1) : '—' }), h('div', { class: 'sub', text: 'слаб. / сильн.' })))
            : h('div', { class: 'help', text: 'Нажмите «Оценить»: боты сыграют уровень и покажут, сколько попыток он требует.' })));

    nodes.push(h('div', { class: 'actions' },
        h('button', { class: 'btn primary', disabled: running, onclick: evaluateSelected, title: 'Сыграть уровень ботами трёх типов' }, icon('gauge'), 'Оценить'),
        h('button', { class: 'btn', disabled: running, onclick: () => tuneSelected(false), title: 'Подобрать ходы и цель по очкам под цель уровня' }, icon('tune'), 'Подогнать'),
        h('button', { class: 'btn', disabled: running, onclick: () => tuneSelected(true), title: 'Ходы не трогать, подобрать только цель по очкам' }, 'Только очки'),
        h('button', { class: 'btn', disabled: running, onclick: regenerateSelected, title: 'Сгенерировать уровень заново: форма, блокеры, задания и слова' }, icon('wand'), 'Новый вариант')));
    if (S.busy)
        nodes.push(h('div', { class: 'busy' }, h('div', { class: 'spinner' }), S.busy));

    nodes.push(section('Игра бота', h('div', { class: 'stack' },
        segmented([...Object.keys(profileNames).map((name) => [name, profileNames[name]]), ['mind', 'Свой «ум»']], S.bot, (value) => { S.bot = value; renderInspector(); }, { class: 'seg block' }),
        S.bot == 'mind' ? h('div', { class: 'slider', title: '«Ум» игрока: 0 — слабый, 0.5 — средний, 1 — сильный' },
            h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: S.mind, oninput: (event) => { S.mind = Number(event.target.value); event.target.nextSibling.textContent = fmt(S.mind); } }),
            h('output', { text: fmt(S.mind) })) : null,
        h('div', { class: 'grid-3', style: { gap: '6px' } },
            h('button', { class: 'btn', onclick: () => watch(''), title: 'Посмотреть случайную попытку бота' }, icon('play'), 'Попытка'),
            h('button', { class: 'btn', onclick: () => watch('win'), title: 'Попытка, которая кончилась победой' }, 'Победа'),
            h('button', { class: 'btn', onclick: () => watch('loss'), title: 'Попытка, которая кончилась поражением' }, 'Поражение')),
        h('div', { class: 'row', style: { gap: '6px' } },
            h('button', { class: 'btn grow', disabled: !S.state.game.binary, title: S.state.game.kind == 'portal' ? 'Бот играет этот уровень в игре проекта, в панели справа' : S.state.game.binary ? 'Запустить игру с этим уровнем: играть будет бот' : 'Игра не собрана: ' + S.state.game.binaryPath,
                          onclick: () => playInGame() }, icon('gamepad'), 'В игре'),
            h('select', { class: 'select', style: { width: '64px' }, title: 'Скорость игры', onchange: (event) => { S.speed = Number(event.target.value); } },
                [1, 2, 4, 8, 16].map((speed) => h('option', { value: speed, text: '×' + speed, selected: S.speed == speed }))),
            h('label', { class: 'row', style: { gap: '4px', fontSize: '12px', color: 'var(--text-3)' }, title: 'Сколько попыток сыграть подряд' }, '×',
                numberInput(S.gameAttempts, (value) => { S.gameAttempts = Math.max(1, Math.round(value)); }, { min: 1, max: 50, style: { width: '48px' } })),
            S.state.game.kind == 'portal' ? null : h('button', { class: 'btn', disabled: !S.state.game.binary, title: 'Те же попытки в настоящей игре без окна и на полной скорости: сверка симулятора с игрой',
                          onclick: () => playInGame(0, null, '', true) }, 'Без окна')),
        h('div', { id: 'gameResult', class: 'bot-result' }))));

    if (stats)
    {
        const names = ['weak', 'average', 'strong'].filter((name) => stats.profiles[name]);
        const row = (label, pick, title, em) => h('tr', { title }, h('td', { text: label }), names.map((name) => h('td', { class: em ? 'em' : '', text: pick(stats.profiles[name]) })));
        nodes.push(section('Игроки · ' + stats.language.toUpperCase(),
            h('table', { class: 'data' },
                h('tr', {}, h('th', {}), names.map((name) => h('th', { text: profileNames[name] }))),
                row('Попыток', (p) => attempts(p.attempts), '', true),
                row('Побед', (p) => pct(p.winRate)),
                row('Запас ходов', (p) => fmt(p.movesLeft, 1), 'Сколько ходов в среднем остаётся при победе'),
                row('Почти победа', (p) => pct(p.nearMiss), 'Доля поражений, которым хватило бы ещё двух ходов'),
                row('Спасли бы +5 ходов', (p) => pct(p.continueWin), 'Доля поражений, которые кончились бы победой после покупки ходов'),
                row('FUUU', (p) => p.fuuu ? fmt(p.fuuu, 1) : '—', 'Попыток до победы на одну «почти победу»; выше 10 — уровень раздражает'),
                row('Очки к цели', (p) => fmt(p.scoreRatio)),
                row('Длина слова', (p) => fmt(p.wordLength)),
                row('Бонусов', (p) => fmt(p.bonuses, 1), 'Бонусов, заработанных за попытку'),
                row('Бустеров', (p) => fmt(p.boosters, 1), 'Бустеров, потраченных за попытку')),
            Object.keys(stats.languages || {}).length ? h('div', { class: 'help', style: { marginTop: '6px' } },
                'Средний игрок на других языках: ' + Object.entries(stats.languages).map(([code, item]) => code.toUpperCase() + ' — ' + attempts(item.attempts)).join(', ')) : null));

        const average = stats.profiles.average;
        const reasons = Object.entries(average.reasons).filter(([, share]) => share > 0.005).sort((a, b) => b[1] - a[1]);
        if (reasons.length > 0)
            nodes.push(section('Чего не хватило при поражении', h('div', { class: 'bars' }, reasons.flatMap(([name, share]) => [
                h('span', { text: reasonNames[name] || name }), h('div', { class: 'track' }, h('i', { style: { width: Math.round(share*100) + '%' } })), h('span', { class: 'pct', text: pct(share) })]))));

        const histogram = average.movesLeftHistogram || [];
        if (histogram.length > 0 && average.wins > 0)
        {
            const max = Math.max(...histogram, 1);
            nodes.push(section('Ходов осталось при победе',
                h('div', { class: 'histo' }, histogram.map((count, left) => h('div', { style: { height: Math.max(2, Math.round(count/max*100)) + '%' },
                    onmousemove: (event) => showTooltip(event, 'осталось <b>' + left + '</b> ' + plural(left, 'ход', 'хода', 'ходов') + ': ' + pct(count/average.wins) + ' побед'), onmouseleave: hideTooltip }))),
                h('div', { class: 'histo-axis' }, histogram.map((count, left) => h('span', { text: left })))));
        }

        const lengths = average.lengthShare || [];
        nodes.push(section('Длина слов среднего игрока', h('div', { class: 'bars' }, [3, 4, 5, 6, 7, 8].flatMap((length) => [
            h('span', { text: length + (length == 8 ? '+' : '') + ' букв' }), h('div', { class: 'track' }, h('i', { style: { width: Math.round((lengths[length] || 0)*100) + '%' } })),
            h('span', { class: 'pct', text: pct(lengths[length] || 0) })]))));
    }

    const notes = meta.notes || {};
    const shape = shapeOf(level.holeCells);
    const design = [];
    if (shape)
        design.push(h('dt', { text: 'Форма' }), h('dd', {}, shape.name + (shape.hardness !== undefined ? ' — ' + hardnessLabel(shape).text + ', очков за ход ' + pct(shape.factor) : '')));
    if (notes.layout && notes.layout.length)
        design.push(h('dt', { text: 'Раскладка' }), h('dd', { text: notes.layout.join(', ') }));
    if (notes.density !== undefined)
        design.push(h('dt', { text: 'Насыщенность' }), h('dd', { text: fmt(notes.density) }));
    if (meta.variant !== undefined)
        design.push(h('dt', { text: 'Вариант' }), h('dd', { text: String(meta.variant >> 4) + ', дизайн ' + ((meta.variant & 15) + 1) }));
    if (design.length)
        nodes.push(section('Устройство уровня', h('dl', { class: 'kv' }, design)));

    if (meta.rounds && meta.rounds.length > 0)
        nodes.push(h('details', { class: 'more' }, h('summary', { text: 'Подгонка: ' + meta.rounds.length + ' ' + plural(meta.rounds.length, 'шаг', 'шага', 'шагов') }),
            h('div', { class: 'body' }, h('table', { class: 'data' },
                h('tr', {}, h('th', { text: '#' }), h('th', { text: 'Ходов' }), h('th', { text: 'Очков' }), h('th', { text: 'Попыток' })),
                meta.rounds.map((round, i) => h('tr', {}, h('td', { text: (i + 1) + (round.settled ? ' ✓' : '') }), h('td', { text: round.moves }), h('td', { text: round.targetScore }),
                                                    h('td', { text: attempts(round.attempts) })))))));

    body.replaceChildren(...nodes);
    renderGameResult();
}

function botProfile()
{
    if (S.bot != 'mind')
        return { profile: S.state.settings.profiles[S.bot], profileName: profileNames[S.bot] };
    // the same line through the three profiles as WordFallBot.ProfileOf
    const profiles = S.state.settings.profiles;
    const from = S.mind < 0.5 ? profiles.weak : profiles.average, to = S.mind < 0.5 ? profiles.average : profiles.strong;
    const k = S.mind < 0.5 ? S.mind*2 : (S.mind - 0.5)*2;
    const profile = {};
    for (const key in from)
        profile[key] = from[key] + (to[key] - from[key])*k;
    return { profile, profileName: '«ум» ' + fmt(S.mind) };
}

async function evaluateSelected()
{
    flushSave();
    setBusy('Боты играют уровень…');
    const result = await guarded(() => call('POST', '/api/evaluate', { id: S.draft.id }));
    S.busy = '';
    if (result && result.meta)
    {
        S.state.meta[S.draft.id] = result.meta;
        S.problems = result.problems;
    }
    renderInspector();
    renderChart();
    renderKpis();
    renderLevelRow(S.selected);
}

async function tuneSelected(keepMoves)
{
    flushSave();
    setBusy('Подгонка под цель ' + fmt(targetAt(S.selected).target) + '…');
    const result = await guarded(() => call('POST', '/api/tune', { id: S.draft.id, keepMoves, target: targetAt(S.selected).target }));
    S.busy = '';
    if (result && result.level)
    {
        S.history.push(JSON.stringify(S.draft));
        S.state.campaign[S.selected] = result.level;
        S.state.meta[result.level.id] = result.meta;
        S.draft = clone(result.level);
        toast(result.ok ? 'Подогнано: ' + result.level.moves + ' ходов, ' + result.level.targetScore + ' очков' : 'Точнее подогнать не вышло — упростите или усложните задания');
    }
    else if (result)
        toast('Задания слишком трудны: за ' + S.state.settings.moves.max + ' ходов их закрывают ' + pct(result.goals || 0) + ' попыток', 'bad', 7000);
    renderEditor();
    renderInspector();
    renderChart();
    renderKpis();
    renderLevelRow(S.selected);
}

async function regenerateSelected()
{
    flushSave();
    const number = S.selected + 1;
    if (number > S.state.targets.length)
    {
        toast('Уровень за пределами кривой: увеличьте число уровней в параметрах кривой', 'bad');
        return;
    }
    await guarded(() => call('POST', '/api/generate', { from: number, to: number, mode: 'new' }));
}

// ================= modals =================

function openModal(title, content, options = {})
{
    const modal = h('div', { class: 'modal', style: { width: options.width || 'auto' } },
        h('div', { class: 'modal-head' }, h('h2', { text: title }), options.headExtra || null, h('div', { class: 'grow' }),
            h('button', { class: 'btn ghost icon', title: 'Закрыть  [Esc]', onclick: () => api.close() }, icon('close'))),
        h('div', { class: 'modal-body' }, content),
        options.foot ? h('div', { class: 'modal-foot' }, options.foot) : null);
    const back = h('div', { class: 'modal-back' }, modal);
    const onKey = (event) => { if (event.key == 'Escape') api.close(); };
    const api = { node: modal, close: () => { back.remove(); document.removeEventListener('keydown', onKey); if (options.onclose) options.onclose(); } };
    back.addEventListener('mousedown', (event) => { if (event.target == back) api.close(); });
    document.addEventListener('keydown', onKey);
    $('modalRoot').append(back);
    return api;
}

// ---------- shapes ----------

function openShapes()
{
    let group = 'all';
    const current = shapeOf(S.draft.holeCells);
    const grid = h('div', { class: 'shape-grid' });
    const apply = (shape, mirror) => {
        const holes = mirror ? shape.holes.map((cell) => ({ x: mirrorX(cell.x), y: cell.y })) : shape.holes;
        edit((draft) => {
            draft.holeCells = [];
            for (const cell of holes)
            {
                clearBlocks(draft, cell.x, cell.y);
                dropLetter(draft, cell.x, cell.y);
                addCell(draft, 'holeCells', cell.x, cell.y);
            }
        });
        modal.close();
        toast('Форма «' + shape.name + '»' + (mirror ? ', зеркально' : '') + '. «Разложить» переложит блокеры под неё.');
    };
    const render = () => {
        const list = S.shapes.filter((shape) => group == 'all' || hardnessLabel(shape).text == group).sort((a, b) => (a.hardness || 0) - (b.hardness || 0));
        grid.replaceChildren(...list.map((shape) => {
            const label = hardnessLabel(shape);
            return h('div', { class: 'shape-card' + (current && current.id == shape.id ? ' on' : ''), onclick: () => apply(shape, false),
                              title: 'Клеток ' + shape.cells + ', островов ' + shape.islands + ', в среднем ' + fmt(shape.neighbours, 1) + ' соседей у клетки' },
                h('div', { html: shapeSvg(shape.holes), style: { color: 'var(--text)' } }),
                h('div', { class: 'name' }, h('span', { class: 'grow', text: shape.name, style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }),
                    shape.symmetric ? null : h('button', { class: 'btn ghost sm icon', title: 'Применить зеркально', onclick: (event) => { event.stopPropagation(); apply(shape, true); } }, icon('mirror'))),
                h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'chip ' + label.kind, text: label.text }), h('span', { class: 'meta', text: shape.cells + ' клеток' })),
                shape.factor !== undefined ? h('div', { class: 'meta', title: 'Очков за ход и слов из 5+ букв против полного поля', text: 'очки ' + pct(shape.factor) + ' · длинные ' + pct(shape.longFactor) }) : null);
        }));
    };
    const modal = openModal('Форма поля', h('div', { class: 'stack', style: { gap: '14px' } },
        h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '16px' } },
            segmented([['all', 'Все'], ['лёгкая', 'Лёгкие'], ['средняя', 'Средние'], ['сложная', 'Сложные']], group, (value) => { group = value; render(); }),
            h('div', { class: 'help grow', text: 'Формы — по мотивам полей матч-3; буквы пролетают пустые клетки. «Очки» и «длинные слова» — сколько очков за ход и слов из 5+ букв форма оставляет среднему игроку против полного поля (замер ботов).' })),
        grid), { width: '1000px' });
    render();
}

// ---------- generation ----------

function openGenerate()
{
    const count = S.state.targets.length;
    const fields = { from: 1, to: count, mode: 'new', seed: 1 };
    const fromInput = numberInput(fields.from, (value) => { fields.from = Math.round(value); }, { min: 1 });
    const toInput = numberInput(fields.to, (value) => { fields.to = Math.round(value); }, { min: 1 });
    const setRange = (from, to) => { fields.from = from; fields.to = to; fromInput.value = from; toInput.value = to; };
    const modes = [['new', 'Новые уровни', 'Форма, блокеры, бонусы, задания и слова — заново; ходы и очки подбираются под цель с кривой'],
                   ['retune', 'Подогнать существующие', 'Уровни остаются как есть, подбираются только ходы и цель по очкам'],
                   ['evaluate', 'Только оценить', 'Боты играют уровни, ничего не меняется']];
    const modeNodes = h('div', { class: 'stack' }, modes.map(([key, title, text]) => h('label', { class: 'choice' + (fields.mode == key ? ' on' : '') },
        h('input', { type: 'radio', name: 'mode', checked: fields.mode == key, onchange: () => { fields.mode = key; [...modeNodes.children].forEach((node, i) => node.classList.toggle('on', modes[i][0] == key)); } }),
        h('b', { text: title }), h('span', { text: text }))));
    const log = h('div', { class: 'log' });
    S.generateLog = log;
    if (S.jobLog.length == 0)
        log.append(h('div', { class: 'muted placeholder', text: 'Здесь будет ход генерации: форма и раскладка каждого уровня, шаги подгонки, итог ботов.' }));
    S.jobLog.slice(-300).forEach((item) => log.append(h('div', { class: item.done ? 'done' : '', text: item.text })));
    log.scrollTop = log.scrollHeight;
    const progress = h('div', { class: 'progress' }, h('i', { style: { width: '0%' } }));
    S.generateProgress = progress;
    updateGenerateProgress();

    const modal = openModal('Генерация уровней по кривой', h('div', { class: 'stack', style: { gap: '16px' } },
        h('div', { class: 'row', style: { alignItems: 'flex-end', gap: '10px' } },
            field('С уровня', fromInput, { style: { width: '90px' } }), field('По уровень', toInput, { style: { width: '90px' } }),
            h('button', { class: 'btn', onclick: () => setRange(S.selected + 1, S.selected + 1) }, 'Выбранный'),
            h('button', { class: 'btn', onclick: () => setRange(1, count) }, 'Все ' + count),
            h('div', { class: 'grow' }),
            field('Зерно', numberInput(fields.seed, (value) => { fields.seed = Math.round(value); }, { min: 0, title: 'Одно и то же зерно даёт те же уровни' }), { style: { width: '90px' } })),
        modeNodes,
        h('div', { class: 'stack', style: { gap: '6px' } }, h('div', { class: 'section-title', style: { margin: '0' } }, 'Журнал', h('div', { class: 'grow' })), progress, log),
        h('div', { class: 'help', text: 'Цель каждого уровня берётся с кривой сложности. Перед первой записью campaign.json за сессию его копия сохраняется в data/backups.' })), {
        width: '700px',
        foot: [h('button', { class: 'btn danger', onclick: () => guarded(() => call('POST', '/api/cancel', {})) }, icon('stop'), 'Остановить'),
               h('div', { class: 'grow' }),
               h('button', { class: 'btn', onclick: () => modal.close() }, 'Закрыть'),
               h('button', { class: 'btn primary', onclick: () => {
                   flushSave();
                   if (fields.mode == 'new' && fields.to - fields.from >= 4 && !confirm('Уровни ' + fields.from + '–' + fields.to + ' будут заменены новыми. Продолжить?'))
                       return;
                   guarded(() => call('POST', '/api/generate', fields));
               } }, icon('sparkle'), 'Запустить')],
        onclose: () => { S.generateLog = null; S.generateProgress = null; }
    });
}

function updateGenerateProgress()
{
    const job = S.state.job;
    if (!S.generateProgress)
        return;
    S.generateProgress.classList.toggle('hidden', !job);
    S.generateProgress.firstChild.style.width = job ? Math.round(job.done/Math.max(1, job.total)*100) + '%' : '0%';
}

// ---------- bots and settings ----------

function openPlayers()
{
    const settings = clone(S.state.settings);
    const names = Object.keys(profileNames);
    const slider = (object, key) => h('div', { class: 'slider' },
        h('input', { type: 'range', min: 0, max: key == 'spread' ? 0.3 : 1, step: 0.01, value: object[key],
                     oninput: (event) => { object[key] = Number(event.target.value); event.target.nextSibling.textContent = fmt(object[key]); } }),
        h('output', { text: fmt(object[key]) }));
    const number = (object, key, attrs) => numberInput(object[key], (value) => { object[key] = value; }, attrs);

    const modal = openModal('Боты и оценка', h('div', { class: 'stack', style: { gap: '22px' } },
        section('Типы игроков',
            h('div', { class: 'profiles' },
                h('div', {}), names.map((name) => h('div', { class: 'head', text: profileNames[name] })),
                Object.keys(profileFields).flatMap((key) => [h('label', { text: profileFields[key], title: profileHelp[key] }), ...names.map((name) => slider(settings.profiles[name], key))])),
            h('div', { class: 'help', style: { marginTop: '10px' } }, Object.keys(profileFields).map((key) => h('div', {}, h('b', { text: profileFields[key] }), ' — ' + profileHelp[key] + '.')))),
        h('div', { class: 'grid-2', style: { gap: '28px', alignItems: 'start' } },
            section('Оценка и подгонка', h('div', { class: 'form-rows', style: { gridTemplateColumns: '1fr 90px' } },
                h('label', { text: 'Попыток на прогон подгонки' }), number(settings.attempts, 'tune', { min: 50, step: 50 }),
                h('label', { text: 'Попыток на оценку, на тип' }), number(settings.attempts, 'final', { min: 50, step: 50 }),
                h('label', { text: 'Допуск попадания, ln', title: 'Насколько оценка может отличаться от цели' }), number(settings, 'tolerance', { min: 0.02, step: 0.01 }),
                h('label', { text: 'Ходов не меньше' }), number(settings.moves, 'min', { min: 3 }),
                h('label', { text: 'Ходов не больше' }), number(settings.moves, 'max', { min: 3 }),
                h('label', { text: 'Доля пика от заданий', title: 'Остальное — цель по очкам; она сильнее отсекает слабых игроков' }), number(settings, 'peakGoals', { min: 0, max: 1, step: 0.05 }))),
            h('div', { class: 'stack', style: { gap: '22px' } },
                section('Бустеры бота на уровень', h('div', { class: 'grid-5' }, settings.boosterCharges.map((count, i) => h('label', { class: 'booster' }, h('span', { text: boosterNames[i] }),
                    numberInput(count, (value) => { settings.boosterCharges[i] = Math.max(0, Math.round(value)); }, { min: 0 })))),
                    h('div', { class: 'help', style: { marginTop: '8px' }, text: 'Запас бустеров у игрока общий на всю игру, уровень его не пополняет — поэтому новые уровни меряются без бесплатных бустеров.' })),
                section('Сводный индекс',
                    h('div', { class: 'help', style: { marginBottom: '8px' }, text: 'индекс = попытки среднего^a · слабого^b · сильного^c × (1 − s·запас ходов + f·безнадёжные поражения)' }),
                    h('div', { class: 'grid-5' }, [['average', 'a'], ['weak', 'b'], ['strong', 'c'], ['slack', 's'], ['frustration', 'f']].map(([key, label]) =>
                        field(label, number(settings.index, key, { step: 0.05, min: 0 }))))),
                section('Калибровка по живым игрокам',
                    h('div', { class: 'help', style: { marginBottom: '8px' }, text: 'logit(побед людей) = сдвиг + наклон × logit(побед ботов). Пока данных нет — 0 и 1.' }),
                    h('div', { class: 'grid-2' }, field('Сдвиг', number(settings.calibration, 'offset', { step: 0.05 })), field('Наклон', number(settings.calibration, 'slope', { step: 0.05 }))))))), {
        width: '880px',
        foot: [h('button', { class: 'btn', onclick: async () => { await saveSettings({ ...S.state.defaults.settings, language: settings.language }); modal.close(); } }, 'По умолчанию'),
               h('div', { class: 'grow' }),
               h('button', { class: 'btn', onclick: () => modal.close() }, 'Отмена'),
               h('button', { class: 'btn primary', onclick: async () => { await saveSettings(settings); modal.close(); } }, 'Сохранить')]
    });
}

async function saveSettings(settings)
{
    const result = await guarded(() => call('POST', '/api/settings', settings));
    if (!result)
        return;
    S.state.settings = result.settings;
    toast('Настройки сохранены. Оценки уровней сделаны с прежними — оцените заново.');
    renderAll();
}

// ---------- dictionary ----------

function openWords(code)
{
    const query = { lang: code || language(), q: '', kind: '', len: 0, minF: 1, maxF: 9 };
    const kindNames = { '.': 'обычное', w: 'слово уровня', n: 'имя', p: 'грубое' };
    const table = h('div', { class: 'words-table' });
    const info = h('div', { class: 'help' });
    const form = { word: '', difficulty: 4, familiarity: 7, kind: '.' };
    const wordInput = h('input', { class: 'input', placeholder: 'СЛОВО', spellcheck: 'false', oninput: (event) => { form.word = event.target.value; } });
    const dInput = numberInput(form.difficulty, (value) => { form.difficulty = value; }, { min: 1, max: 9 });
    const fInput = numberInput(form.familiarity, (value) => { form.familiarity = value; }, { min: 1, max: 9 });
    const kindInput = h('select', { class: 'select', onchange: (event) => { form.kind = event.target.value; } }, Object.keys(kindNames).map((kind) => h('option', { value: kind, text: kindNames[kind] })));
    const meter = (value) => h('span', { class: 'num' }, h('span', { class: 'meter' }, h('i', { style: { width: Math.round(value/9*100) + '%' } })), value);

    const load = async () => {
        const result = await guarded(() => call('GET', '/api/words?' + new URLSearchParams(query).toString()));
        if (!result)
            return;
        info.textContent = 'Найдено ' + result.total.toLocaleString('ru') + ' из ' + result.count.toLocaleString('ru') + (result.total > result.words.length ? ', показаны первые ' + result.words.length : '') +
            '. Слов по узнаваемости 1…9: ' + result.histogram.slice(1).map((n) => n.toLocaleString('ru')).join(' · ');
        table.replaceChildren(h('table', {},
            h('tr', {}, h('th', { text: 'Слово' }), h('th', { text: 'Сложность' }), h('th', { text: 'Узнаваемость' }), h('th', { text: 'Вид' })),
            result.words.map(([word, difficulty, familiarity, kind]) => h('tr', { onclick: () => {
                Object.assign(form, { word, difficulty, familiarity, kind });
                wordInput.value = word; dInput.value = difficulty; fInput.value = familiarity; kindInput.value = kind;
            } }, h('td', { style: { fontWeight: '600', letterSpacing: '0.04em' }, text: word }), h('td', {}, meter(difficulty)), h('td', {}, meter(familiarity)), h('td', { class: 'dim', text: kindNames[kind] })))));
    };
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(load, 200); };

    openModal('Словарь', h('div', { class: 'stack', style: { gap: '12px' } },
        h('div', { class: 'row' },
            segmented(S.state.languages.map((lang) => [lang.code, lang.name + ' · ' + lang.words.toLocaleString('ru')]), query.lang, (value) => { query.lang = value; load(); }),
            h('input', { class: 'input', type: 'search', placeholder: 'слово или КО*', title: 'Часть слова; со звёздочкой в конце — начало слова', style: { width: '170px' }, oninput: (event) => { query.q = event.target.value; later(); } }),
            h('select', { class: 'select', style: { width: '130px' }, onchange: (event) => { query.kind = event.target.value; load(); } },
                h('option', { value: '', text: 'все виды' }), Object.keys(kindNames).map((kind) => h('option', { value: kind, text: kindNames[kind] }))),
            h('select', { class: 'select', style: { width: '124px' }, onchange: (event) => { query.len = Number(event.target.value); load(); } },
                h('option', { value: 0, text: 'любая длина' }), [2, 3, 4, 5, 6, 7, 8].map((n) => h('option', { value: n, text: n + ' букв' }))),
            h('div', { class: 'grow' }),
            h('label', { class: 'row', style: { gap: '6px', color: 'var(--text-3)', fontSize: '12px', whiteSpace: 'nowrap' } }, 'узнаваемость',
                numberInput(1, (value) => { query.minF = value; load(); }, { min: 1, max: 9, style: { width: '48px' } }), '–',
                numberInput(9, (value) => { query.maxF = value; load(); }, { min: 1, max: 9, style: { width: '48px' } }))),
        table, info,
        h('div', { class: 'card', style: { background: 'var(--panel-2)' } },
            h('div', { class: 'card-title', text: 'Изменить оценки слова или добавить новое' }),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr auto', gap: '10px', alignItems: 'end' } },
                field('Слово', wordInput), field('Сложность 1–9', dInput), field('Узнаваемость 1–9', fInput), field('Вид', kindInput),
                h('button', { class: 'btn primary', onclick: async () => {
                    const result = await guarded(() => call('POST', '/api/word', { lang: query.lang, ...form }));
                    if (result)
                    {
                        toast((result.added ? 'Добавлено: ' : 'Обновлено: ') + result.word + '. Словарь игры пересобран — соберите ассеты.');
                        load();
                    }
                } }, 'Записать')),
            h('div', { class: 'help', style: { marginTop: '10px' }, text: 'Сложность — как трудно додуматься до слова и собрать его; узнаваемость — какая доля взрослых знает слово (9 — все, 5 — две трети, 1 — почти никто). «Слово уровня» — знакомое всем существительное: из таких берутся слова, которые надо найти. Имена и грубые слова только принимаются от игрока.' }))),
        { width: '900px' });
    load();
}

// ---------- replay ----------

async function watch(want)
{
    flushSave();
    const { profile, profileName } = botProfile();
    const result = await guarded(() => call('POST', '/api/replay', { level: S.draft, profile, want, language: language() }));
    if (result)
        openReplay(result, profileName, profile);
}

function openReplay(result, profileName, profile)
{
    const trace = result.trace;
    const level = S.draft;
    const record = result.record;
    const view = { step: -1, phase: 'idle', playing: false, speed: 2, timer: 0, selected: 0 };
    const boardNode = h('div', { class: 'board' });
    const hud = h('div', {});
    const chips = h('div', { class: 'row wrap', style: { margin: '10px 0 12px', gap: '6px' } });
    const steps = h('div', { class: 'steps' });
    const playButton = h('button', { class: 'btn icon', title: 'Пауза / дальше  [пробел]' });
    const schedule = (delay) => {
        clearTimeout(view.timer);
        if (view.playing)
            view.timer = setTimeout(advance, delay/view.speed);
    };
    const setPlaying = (playing) => { view.playing = playing; playButton.replaceChildren(icon(playing ? 'pause' : 'play')); if (playing) schedule(0); else clearTimeout(view.timer); };
    playButton.onclick = () => setPlaying(!view.playing);

    const actionText = (step) => ({ word: step.word || '', accept: step.word || '', hint: 'подсказка', hammer: 'молоток', shuffle: 'перемешать', joker: 'джокер', doubler: 'удвоитель' }[step.type]
        || step.type) + (step.ok === false ? ' — не принято' : '');

    const draw = (board, progress, selected, burned, aim) => {
        drawBoard(boardNode, (x, y) => {
            const cell = board[x*rows + y];
            return { hole: !!cell.hole, letter: cell.l || '', value: cell.l && !cell.joker ? cell.v : undefined, ice: !!cell.ice, stone: !!cell.stone,
                     crate: cell.crate || 0, chain: !!cell.chain, snow: !!cell.snow, parcel: !!cell.parcel, bonus: cell.bonus || '', x2: !!cell.x2, tint: cell.t || 0 };
        }, { selection: selected, burned, aim });
        const goal = record.target;
        hud.replaceChildren(h('div', { class: 'hud' },
            h('div', { class: 'moves', text: progress.movesLeft }, h('span', { text: plural(progress.movesLeft, 'ход', 'хода', 'ходов') })),
            h('div', {},
                h('div', { class: 'score' }, h('span', {}, 'очки ', h('b', { text: progress.score }), ' из ' + goal),
                    progress.state == 'won' ? h('span', { class: 'chip good', text: 'победа' }) : progress.state == 'lost' ? h('span', { class: 'chip bad', text: 'ходы кончились' }) : null),
                h('div', { class: 'progress' }, h('i', { style: { width: Math.min(100, progress.score/goal*100) + '%', background: progress.score >= goal ? 'var(--good)' : 'var(--accent)' } })))),
            h('div', { class: 'words-line' }, progress.words.map((word) => h('span', { class: 'word-chip' + (word.found ? ' found' : ''), text: word.word }))));
        chips.replaceChildren(...progress.tasks.map((task, i) => {
            const config = (level.tasks || [])[i] || { taskType: task.type };
            const countable = !['ClearIce', 'Crates', 'WordScore'].includes(task.type);
            return h('span', { class: 'chip' + (task.done ? ' good' : '') }, task.done ? icon('check') : null, taskCaption(config, trace.language) + (!task.done && countable ? ' · ' + task.progress : ''));
        }), h('span', { class: 'chip', title: boosterNames.join(', ') }, 'бустеры ' + progress.charges.join(' · ')));
    };

    const show = (index, phase) => {
        view.step = index;
        view.phase = phase;
        const before = index <= 0 ? trace.start : trace.steps[index - 1];
        const step = trace.steps[index];
        if (index < 0)
            draw(trace.start.board, trace.start.progress, [], null, null);
        else if (phase == 'select')
            draw(before.board, before.progress, (step.cells || []).slice(0, view.selected), null, null);
        else if (phase == 'aim')
            draw(before.board, before.progress, [], null, step.cell);
        else
            draw(step.board, step.progress, [], step.burned, null);
        [...steps.children].forEach((node, i) => node.classList.toggle('current', i == index));
        const current = steps.children[index];
        if (current)
            current.scrollIntoView({ block: 'nearest' });
    };

    // one tick: think, pick the letters one by one, then the move's result
    const advance = () => {
        if (!document.body.contains(boardNode))
            return;
        const next = view.phase == 'result' || view.step < 0 ? view.step + 1 : view.step;
        if (next >= trace.steps.length)
        {
            setPlaying(false);
            return;
        }
        const step = trace.steps[next];
        const cells = step.cells || [];
        if (view.phase == 'result' || view.step < 0)
        {
            view.selected = 0;
            if (cells.length > 0 && step.type == 'word')
            {
                show(next, 'select');
                schedule(Math.min(step.think || 2, 6)*350);
            }
            else
            {
                show(next, step.cell ? 'aim' : 'result');
                schedule(550);
            }
        }
        else if (view.phase == 'select' && view.selected < cells.length)
        {
            view.selected++;
            show(next, 'select');
            schedule(view.selected < cells.length ? 240 : 420);
        }
        else
        {
            show(next, 'result');
            schedule(700);
        }
    };

    trace.steps.forEach((step, index) => {
        steps.append(h('div', { class: 'step' + (step.extra ? ' extra' : ''), title: step.extra ? 'После поражения: как бот сыграл бы с докупленными ходами' : '',
                                onclick: () => { setPlaying(false); show(index, 'result'); } },
            h('span', { class: 'i', text: index + 1 }),
            h('span', { class: step.type == 'word' || step.type == 'accept' ? 'w' : 'dim', text: actionText(step) + (step.wordFound ? ' ★' : '') + (step.bonus ? ' → ' + bonusNames[step.bonus].toLowerCase() : '') }),
            h('span', { class: 'g', text: step.gain ? '+' + step.gain : '' })));
    });

    const outcome = record.won ? h('span', { class: 'chip good' }, icon('check'), 'победа за ' + record.moves + ' ' + plural(record.moves, 'ход', 'хода', 'ходов') + ', запас ' + record.movesLeft)
        : h('span', { class: 'chip bad', text: 'поражение' + (record.extra > 0 ? ': хватило бы ещё ' + record.extra + ' ' + plural(record.extra, 'хода', 'ходов', 'ходов') : '') + (record.stuck ? ', кончились слова' : '') });
    const onKey = (event) => { if (event.code == 'Space' && !event.target.matches('input, select, textarea')) { event.preventDefault(); setPlaying(!view.playing); } };
    document.addEventListener('keydown', onKey);
    const modal = openModal('Бот играет уровень ' + (S.selected + 1), h('div', { class: 'replay' },
        h('div', {}, hud, chips, h('div', { class: 'card board-card' }, boardNode),
            h('div', { class: 'row', style: { marginTop: '12px' } }, playButton,
                h('button', { class: 'btn icon', title: 'С начала', onclick: () => { clearTimeout(view.timer); show(-1, 'idle'); setPlaying(true); } }, icon('restart')),
                h('button', { class: 'btn icon', title: 'Следующий ход', onclick: () => { setPlaying(false); show(Math.min(trace.steps.length - 1, view.step + 1), 'result'); } }, icon('step')),
                h('div', { class: 'grow' }),
                h('span', { class: 'muted', style: { fontSize: '12px' }, text: 'скорость' }),
                segmented([['0.5', '×½'], ['1', '×1'], ['2', '×2'], ['4', '×4'], ['8', '×8']], String(view.speed), (value) => { view.speed = Number(value); }))),
        h('div', { class: 'stack' }, h('div', { class: 'section-title', style: { margin: '0' } }, 'Ходы', h('div', { class: 'grow' }), h('span', { text: 'сид ' + result.seed })), steps)), {
        width: '840px', headExtra: h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'chip accent', text: profileName }), outcome),
        foot: [h('button', { class: 'btn', onclick: () => { modal.close(); watch(''); } }, 'Другая попытка'),
               h('div', { class: 'grow' }),
               h('button', { class: 'btn', disabled: !S.state.game.binary, title: 'Это же поле в игре, но играете вы сами', onclick: () => { modal.close(); playYourself(result.seed); } }, 'Сыграть самому'),
               h('button', { class: 'btn', disabled: !S.state.game.binary, title: 'Эта же попытка в игре: те же сиды поля и бота', onclick: () => playInGame(result.seed, profile, profileName) }, icon('gamepad'), 'Эту попытку в игре'),
               h('button', { class: 'btn primary', onclick: () => modal.close() }, 'Закрыть')],
        onclose: () => { clearTimeout(view.timer); document.removeEventListener('keydown', onKey); }
    });
    show(-1, 'idle');
    setPlaying(true);
}

async function playInGame(seed, profile, profileName, background)
{
    flushSave();
    const bot = profile ? { profile, profileName } : botProfile();
    S.gameResult = null;
    renderGameResult();
    const result = await guarded(() => call('POST', '/api/play', { level: S.draft, profile: bot.profile, profileName: bot.profileName, seed: seed || 0, background: !!background,
                                                                  speed: S.speed, attempts: seed ? 1 : S.gameAttempts, language: language() }));
    if (result)
        toast(result.stale ? 'Игра запущена, но её ассеты старше скриптов и словарей — соберите ассеты (вверху справа)'
            : background ? 'Игра играет без окна — итог появится под кнопками бота' : 'Игра запущена: бот играет уровень, скорость ×' + result.speed, result.stale ? 'bad' : '', 5000);
}

// The level opens in the game for the person; seed 0 is a random board, a bot attempt's seed is its board
async function playYourself(seed)
{
    flushSave();
    S.gameResult = null;
    renderGameResult();
    const number = S.selected + 1;
    const result = await guarded(() => call('POST', '/api/play', { level: S.draft, human: true, seed: seed || 0, title: 'уровень ' + number, language: language() }));
    if (result)
        toast(result.stale ? 'Игра открыта, но её ассеты старше скриптов и словарей — соберите ассеты (вверху справа)'
            : 'Игра открыта на уровне ' + number + ': играйте сами, итоги попыток появятся справа', result.stale ? 'bad' : '', 5000);
}

function renderGameResult()
{
    const node = $('gameResult');
    if (!node)
        return;
    const result = S.gameResult;
    const game = S.state.game;
    if (!result || !result.attempts || result.attempts.length == 0)
    {
        node.replaceChildren(game.running ? h('div', { class: 'busy' }, h('div', { class: 'spinner' }), game.human ? 'Игра открыта, играете вы…' : 'Игра запущена, бот играет…') : '');
        return;
    }
    const wins = result.attempts.filter((attempt) => attempt.won).length;
    const title = (attempt) => attempt.score + ' из ' + attempt.target + ' очков, осталось ' + attempt.movesLeft + ' ' + plural(attempt.movesLeft, 'ход', 'хода', 'ходов') +
                               (attempt.words && attempt.words.length ? '\n' + attempt.words.join(', ') : '');
    node.replaceChildren(h('div', { class: 'row wrap', style: { gap: '4px' } }, h('span', { class: 'muted', text: result.human ? 'Вы в игре:' : 'Бот в игре:' }),
        result.attempts.map((attempt) => h('span', { class: 'chip ' + (attempt.won ? 'good' : 'bad'), title: title(attempt),
                                                     text: (attempt.won ? 'победа' : 'поражение') + ' · ' + attempt.moves + ' ход.' })),
        h('span', { class: 'muted', text: 'побед ' + wins + ' из ' + result.attempts.length })));
}

// ================= app bar =================

function renderLanguage()
{
    $('languageSeg').replaceChildren(...S.state.languages.map((lang) => h('button', { class: lang.code == language() ? 'on' : '', type: 'button', text: lang.code.toUpperCase(), title: lang.name,
        onclick: async () => { if (lang.code != language()) { await saveSettings({ ...S.state.settings, language: lang.code }); selectLevel(S.selected); } } })));
}

function renderGameStatus()
{
    const game = S.state.game;
    const nodes = [];
    if (game.kind == 'portal')
    {
        // on the o2 portal: the project's working copy, the levels of the builds, and the game in the pane next to the page
        const vcs = S.vcs;
        if (vcs && vcs.changes && vcs.changes.length)
            nodes.push(h('button', { class: 'btn sm', title: vcs.changes.map((change) => change.path).join('\n'), onclick: openCommit },
                         icon('commit'), vcs.changes.length + ' ' + plural(vcs.changes.length, 'изменение', 'изменения', 'изменений')));
        else if (vcs)
            nodes.push(h('span', { class: 'chip good', title: 'Всё, что сделано здесь, закоммичено в проекте' }, icon('check'), 'в проекте'));
        if (S.state.services.remote)
            nodes.push(h('button', { class: 'btn sm', title: 'Уровни LevelLab в вышедших билдах игры — через удалённый конфиг', onclick: openBuild }, icon('build'), 'В билд'));
        if (game.building)
            nodes.push(h('span', { class: 'chip warn' }, h('span', { class: 'spinner', style: { width: '10px', height: '10px' } }), 'ассеты пекутся'));
        else
            nodes.push(h('button', { class: 'btn sm ghost', title: 'Перепечь ассеты игры на портале: игра в панели увидит новые скрипты, словари и кампанию',
                                     onclick: () => guarded(() => call('POST', '/api/assets', {})) }, 'Перепечь'));
        if (game.running)
            nodes.push(h('button', { class: 'btn sm', onclick: () => guarded(() => call('POST', '/api/play/stop', {})) }, icon('stop'), 'Закрыть игру'));
        $('gameStatus').replaceChildren(...nodes);
        return;
    }
    if (!game.binary)
        nodes.push(h('span', { class: 'chip bad', title: 'cmake --build --preset mac --target Game', text: 'игра не собрана' }));
    else if (game.building)
        nodes.push(h('span', { class: 'chip warn' }, h('span', { class: 'spinner', style: { width: '10px', height: '10px' } }), 'ассеты собираются'));
    else if (game.stale || !game.built)
        nodes.push(h('span', { class: 'chip warn', title: 'Уровни, словари или скрипты новее собранных ассетов: игра их пока не видит' }, icon('warn'), 'ассеты игры устарели'),
            h('button', { class: 'btn sm', disabled: !game.builder, onclick: () => guarded(() => call('POST', '/api/assets', {})) }, 'Собрать'));
    else
        nodes.push(h('span', { class: 'chip good', title: 'Игра видит текущие уровни и словари' }, icon('check'), 'ассеты свежие'));
    if (game.running)
        nodes.push(h('button', { class: 'btn sm', onclick: () => guarded(() => call('POST', '/api/play/stop', {})) }, icon('stop'), 'Закрыть игру'));
    $('gameStatus').replaceChildren(...nodes);
}

function renderJobPill()
{
    const job = S.state.job;
    const pill = $('jobPill');
    if (!job || (job.state != 'running' && Date.now() - (job.finishedAt || 0) > 12000))
    {
        pill.classList.add('hidden');
        return;
    }
    const modes = { new: 'Генерация', retune: 'Подгонка', evaluate: 'Оценка' };
    const seconds = ((job.finishedAt || Date.now()) - job.startedAt)/1000;
    const rate = Math.round(job.attempts/Math.max(seconds, 0.1));
    const state = job.state == 'running' ? 'уровень ' + job.current : job.state == 'done' ? 'готово' : job.state == 'cancelled' ? 'остановлено' : 'ошибка';
    pill.classList.remove('hidden');
    pill.title = 'Открыть журнал';
    pill.onclick = (event) => { if (!event.target.closest('button')) openGenerate(); };
    pill.replaceChildren(
        job.state == 'running' ? h('div', { class: 'spinner' }) : icon(job.state == 'done' ? 'check' : 'warn'),
        h('span', {}, h('b', { text: modes[job.mode] }), ' ' + job.done + ' / ' + job.total),
        h('div', { class: 'bar' }, h('i', { style: { width: Math.round(job.done/Math.max(1, job.total)*100) + '%' } })),
        h('span', { class: 'num', text: state + ' · ' + fmt(seconds, 0) + ' с · ' + rate.toLocaleString('ru') + ' попыток/с' }),
        job.state == 'running' ? h('button', { class: 'btn ghost sm icon', title: 'Остановить', onclick: () => guarded(() => call('POST', '/api/cancel', {})) }, icon('stop'))
            : h('button', { class: 'btn ghost sm icon', title: 'Скрыть', onclick: () => { job.finishedAt = 1; renderJobPill(); } }, icon('close')));
    updateGenerateProgress();
}

function logJob(text, done)
{
    S.jobLog.push({ text, done });
    if (S.jobLog.length > 800)
        S.jobLog.splice(0, 300);
    if (S.generateLog)
    {
        const placeholder = S.generateLog.querySelector('.placeholder');
        if (placeholder)
            placeholder.remove();
        S.generateLog.append(h('div', { class: done ? 'done' : '', text }));
        S.generateLog.scrollTop = S.generateLog.scrollHeight;
    }
}

function onEvent(event)
{
    if (event.type == 'job' || event.type == 'hello')
    {
        const wasRunning = S.state.job && S.state.job.state == 'running';
        S.state.job = event.job;
        renderJobPill();
        if (wasRunning != (event.job && event.job.state == 'running'))
            renderInspector();
        if (event.job && event.job.state != 'running' && event.type == 'job')
        {
            logJob({ done: 'Готово', cancelled: 'Остановлено', error: 'Ошибка: ' + event.job.error }[event.job.state] + ' — ' + event.job.done + ' из ' + event.job.total, true);
            renderKpis();
            setTimeout(renderJobPill, 13000);
        }
    }
    else if (event.type == 'progress')
    {
        const item = event.event;
        const prefix = item.number ? String(item.number).padStart(3, ' ') + '  ' : '';
        if (item.type == 'design')
            logJob(prefix + (item.notes.kept ? 'уровень как есть' : '«' + item.notes.shape + '»' + (item.notes.layout && item.notes.layout.length ? ', ' + item.notes.layout.join(', ') : '')) + (item.attempt ? ' — вариант ' + (item.attempt + 1) : ''));
        else if (item.type == 'round')
            logJob(prefix + '  ' + item.moves + ' ходов, ' + item.targetScore + ' очков → ' + attempts(item.attempts) + ' попыток при цели ' + fmt(item.target) + (item.settled ? '  ✓' : ''));
        else if (item.type == 'unreachable')
            logJob(prefix + '  задания трудны: за ' + item.moves + ' ходов их закрывают ' + pct(item.goals) + ' попыток — упрощаю');
        else if (item.type == 'invalid')
            logJob(prefix + '  вариант отброшен: ' + item.problems.join('; '));
        else if (item.type == 'done')
            logJob(prefix + 'готов: ' + attempts(item.meta.stats.attempts) + ' попыток при цели ' + fmt(item.meta.target) + ' · слабый ' + attempts(item.meta.stats.profiles.weak.attempts) +
                   ' · сильный ' + attempts(item.meta.stats.profiles.strong.attempts), true);
    }
    else if (event.type == 'level')
    {
        S.state.campaign[event.index] = event.level;
        S.state.meta[event.level.id] = event.meta;
        if (event.index == S.selected && !S.saveTimer)
        {
            S.draft = clone(event.level);
            renderEditor();
            renderInspector();
            validateDraft();
        }
        if (document.querySelector('.level-row[data-index="' + event.index + '"]'))
            renderLevelRow(event.index);
        else
            renderLevelList();
        renderChart();
        renderKpis();
    }
    else if (event.type == 'game')
    {
        S.state.game = event.game;
        if (event.result)
            S.gameResult = event.result;
        if (event.built === true)
            toast(event.game.kind == 'portal' ? 'Ассеты игры перепечены: игра в панели справа идёт на них' : 'Ассеты игры собраны');
        else if (event.built === false)
            toast('Сборка ассетов не удалась (' + event.code + ')', 'bad', 7000);
        renderGameStatus();
        renderGameResult();
    }
    // on the portal: what the lab wrote went to the project's working copy, or did not
    else if (event.type == 'saved' || event.type == 'vcs')
        refreshVcsSoon();
    else if (event.type == 'error')
        toast(event.message, 'bad', 8000);
}

// ---------- the project on the o2 portal: its working copy and its builds ----------

let vcsTimer = 0;
function refreshVcsSoon()
{
    clearTimeout(vcsTimer);
    vcsTimer = setTimeout(refreshVcs, 900);
}

async function refreshVcs()
{
    if (!S.state.services.vcs)
        return;
    const vcs = await call('GET', '/api/vcs').catch(() => null);
    if (vcs)
    {
        S.vcs = vcs;
        renderGameStatus();
    }
}

const changeNames = { M: 'изменён', A: 'добавлен', D: 'удалён', '?': 'новый', R: 'переименован' };

function openCommit()
{
    const changes = (S.vcs && S.vcs.changes) || [];
    const message = h('input', { class: 'input', value: 'LevelLab: уровни Word Fall', placeholder: 'Что изменилось' });
    const push = h('input', { type: 'checkbox', checked: true });
    const list = h('div', { class: 'commit-list' }, changes.map((change) => h('div', { class: 'row' },
        h('span', { class: 'chip', text: changeNames[change.st] || change.st }), h('span', { class: 'mono ell', text: change.path }))));
    const modal = openModal('Изменения LevelLab в проекте', h('div', { class: 'stack', style: { gap: '12px' } },
        h('p', { class: 'muted', text: 'Уровни, кривая и статистика уже лежат в рабочей копии проекта на портале. Коммит сохранит их в истории проекта — только файлы LevelLab, остальное не трогается.' }),
        list, field('Сообщение коммита', message),
        h('label', { class: 'row', style: { gap: '8px' } }, push, 'Отправить в репозиторий проекта (push)')), {
        width: '560px',
        foot: [h('div', { class: 'grow' }), h('button', { class: 'btn', onclick: () => modal.close() }, 'Отмена'),
               h('button', { class: 'btn primary', disabled: !changes.length || !S.vcs.canCommit, title: S.vcs.canCommit ? '' : 'У зрителя проекта нет права на коммит',
                             onclick: async () => {
                                 const done = await guarded(() => call('POST', '/api/vcs/commit', { message: message.value, push: push.checked }));
                                 if (!done)
                                     return;
                                 modal.close();
                                 toast('Закоммичено: ' + done.files.length + ' ' + plural(done.files.length, 'файл', 'файла', 'файлов') + (push.checked ? ' и отправлено' : ''));
                                 refreshVcs();
                             } }, icon('check'), 'Закоммитить')]
    });
}

async function openBuild()
{
    const state = await guarded(() => call('GET', '/api/build'));
    if (!state)
        return;
    const note = h('input', { class: 'input', placeholder: 'Что поменялось, для истории Live-ops' });
    const line = (label, part) => h('div', { class: 'build-line' }, h('span', { class: 'muted', text: label }),
        part.count ? h('b', { text: part.count + ' ' + plural(part.count, 'уровень', 'уровня', 'уровней') }) : h('b', { text: 'нет' }),
        part.count ? h('span', { class: 'chip ' + (part.differ ? 'warn' : 'good'), text: part.differ ? 'отличаются от LevelLab: ' + part.differ : 'совпадают с LevelLab' }) : null);
    const send = async (publish, clear) => {
        const done = await guarded(() => call('POST', '/api/build', { publish, clear, note: note.value }));
        if (!done)
            return;
        modal.close();
        toast(clear ? 'Уровни из билдов убраны' + (publish ? '' : ' в черновике') : publish ? 'Опубликовано: билды игры берут уровни LevelLab' : 'Уровни в черновике Live-ops: опубликует владелец проекта');
    };
    const modal = openModal('Уровни в билдах игры', h('div', { class: 'stack', style: { gap: '12px' } },
        h('p', { class: 'muted', text: 'Игра берёт уровень из удалённого конфига ' + state.key + ' по его id вместо собранного в билд — без новой сборки и обновления. ' +
                                       'Так меняются уровни уже вышедших билдов, подключённых к Live-ops. Порядок и число уровней задаёт сам билд.' }),
        h('div', { class: 'card build-card' }, line('В билдах сейчас', state.live), line('В черновике Live-ops', state.draft),
            state.publishedAt ? h('div', { class: 'muted', style: { fontSize: '12px' }, text: 'Последняя публикация: ' + new Date(state.publishedAt).toLocaleString('ru') + (state.note ? ' — ' + state.note : '') }) : null),
        field('Заметка', note)), {
        width: '600px',
        foot: [h('button', { class: 'btn danger', disabled: !state.live.count && !state.draft.count, onclick: () => send(state.canPublish, true) }, 'Убрать из билдов'),
               h('div', { class: 'grow' }),
               h('button', { class: 'btn', onclick: () => send(false, false), title: 'Положить ' + state.campaign + ' уровней в черновик Live-ops' }, 'В черновик'),
               h('button', { class: 'btn primary', disabled: !state.canPublish, title: state.canPublish ? 'Все игроки получат эти уровни при следующем запуске' : 'Публикует владелец проекта — положите уровни в черновик',
                             onclick: () => send(true, false) }, icon('upload'), 'Опубликовать')]
    });
}

function connect()
{
    if (backend)
    {
        onEvent(backend.hello());
        return;
    }
    const source = new EventSource('/api/events');
    source.onmessage = (message) => onEvent(JSON.parse(message.data));
    source.onerror = () => toast('Нет связи с сервером LevelLab — перезапустите server.mjs', 'bad', 5000);
}

function renderAll()
{
    renderLanguage();
    renderGameStatus();
    renderJobPill();
    renderKpis();
    renderEditor();
    renderLevelList();
    renderInspector();
    renderChart();
    if (!$('curveDrawer').classList.contains('hidden'))
        renderCurveDrawer();
}

// ================= start =================

async function init()
{
    if (onPortal)
    {
        // (an absolute URL: in the portal's sandbox this script is cross-origin, and a relative import() would have no base)
        const { createPortalBackend } = await import(new URL('portal.js', location.href).href);
        backend = await createPortalBackend((event) => onEvent(event));
        // the board's letters in the game's own font, from the project
        document.head.append(h('style', { text: '@font-face { font-family: "WordFallTile"; src: url("' + sprite('WordFall/game_font_heavy.ttf') + '") format("truetype"); font-display: block; }' }));
    }
    S.state = await call('GET', '/api/state');
    try { S.curveOpen = localStorage.getItem('levellab.curveOpen') != '0'; } catch (error) {}
    $('openGenerate').replaceChildren(icon('sparkle'), 'Генерация');
    $('openPlayers').replaceChildren(icon('users'), 'Боты');
    $('openWords').replaceChildren(icon('book'), 'Словарь');
    $('openCurve').replaceChildren(icon('sliders'), 'Параметры');
    $('toggleCurve').replaceChildren(icon(S.curveOpen ? 'chevronUp' : 'chevronDown'));
    $('chart').classList.toggle('hidden', !S.curveOpen);
    $('openGenerate').addEventListener('click', openGenerate);
    $('openPlayers').addEventListener('click', openPlayers);
    $('openWords').addEventListener('click', () => openWords());
    $('openCurve').addEventListener('click', openCurveDrawer);
    $('toggleCurve').addEventListener('click', toggleCurve);
    $('levelFilter').addEventListener('input', renderLevelList);

    window.addEventListener('keydown', (event) => {
        const typing = event.target.matches('input, textarea, select') || document.querySelector('.modal-back');
        if ((event.metaKey || event.ctrlKey) && event.code == 'KeyZ' && !event.target.matches('input, textarea'))
        {
            event.preventDefault();
            if (event.shiftKey) redo(); else undo();
            return;
        }
        if (typing || event.metaKey || event.ctrlKey || event.altKey)
            return;
        if (event.key == 'ArrowDown' || event.key == 'ArrowUp')
        {
            event.preventDefault();
            selectLevel(S.selected + (event.key == 'ArrowDown' ? 1 : -1));
            return;
        }
        if (event.code == 'KeyM')
        {
            S.mirror = !S.mirror;
            renderTools();
            return;
        }
        for (const group of tools)
            for (const item of group.items)
                if (item[2] == event.code)
                {
                    S.tool = item[0];
                    renderTools();
                    return;
                }
    });
    window.addEventListener('beforeunload', flushSave);
    window.addEventListener('resize', positionDrawer);

    bindChart();
    S.draft = S.state.campaign.length > 0 ? clone(levelAt(0)) : null;
    renderAll();
    connect();
    setInterval(() => { if (S.state.job && S.state.job.state == 'running') renderJobPill(); }, 1000);
    validateDraft();

    refreshVcs();
    const shapes = await guarded(() => call('GET', '/api/shapes'));
    if (shapes)
    {
        S.shapes = shapes.shapes;
        renderLevelList();
        renderBoardInfo();
        renderInspector();
    }
}

init().catch((error) => document.body.prepend(h('div', { class: 'problem', text: 'Не удалось загрузить LevelLab: ' + error.message })));
