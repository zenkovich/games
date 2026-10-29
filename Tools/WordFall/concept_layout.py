"""Geometry of the WordFall main screen in pixels of the concept (Assets/Generated/concept.png,
471x1026); the game screen is 768x1673, the same aspect, so a concept pixel is S game pixels.

CROPS are the static parts cut out of the concept by the Test pipeline (finish node crop, no AI);
a part with `erase` is first emptied by an AI edit limited to that region (the pixels outside the
region stay the concept's). The sprites land in WordFall/Sprites/<name>.png at the crop size
times S, and the screen draws each one at its crop rectangle, so the layout matches by construction.
"""

CONCEPT_W, CONCEPT_H = 471, 1026
SCREEN_W = 942  # exactly twice the concept: integer layout and a 1:2 render for the comparison
S = SCREEN_W / CONCEPT_W
SCREEN_H = round(CONCEPT_H * S)  # 2052

TILE_ERASE = ("Erase the letter and the small number printed on this tile so the tile is completely empty. "
              "Keep the tile exactly as it is otherwise: same shape, size, colors, outline, highlight and shadow.")

# name -> rect (x0, y0, x1, y1), optional slices (left, bottom, right, top) for a 9-sliced sprite,
# optional erase (prompt, region rect) applied before the cut
CROPS = {
    # the panel's clean right edge (the rest is under the tiles) and its mirror image as the left edge,
    # composed by the pipeline; the sprite is 9-sliced over the panel
    "cc_words_panel": dict(rect=(300, 7, 331, 131), mirror=True, slices=(14, 0, 14, 14)),
    "cc_moves_bg": dict(rect=(331, 2, 467, 132),
                        erase=("Remove the text 'Moves Left:' and the number '35' from this parchment box so it is blank. "
                               "Keep the parchment exactly as it is: torn edges, color, shading.", (342, 14, 458, 122))),
    # the strip's clean right part and its mirror image (the rest is under the tile, text, star and check)
    "cc_strip_bg": dict(rect=(300, 179, 464, 272), mirror=True, slices=(16, 16, 16, 16)),  # from below the panel rim
    "cc_input_back": dict(rect=(8, 336, 350, 395), slices=(18, 18, 18, 18)),
    "cc_accept": dict(rect=(352, 332, 409, 394)),
    "cc_cancel": dict(rect=(410, 332, 464, 392)),
    "cc_star": dict(rect=(5, 271, 69, 338)),
    "cc_strip_star": dict(rect=(160, 195, 236, 262)),
    "cc_strip_check": dict(rect=(235, 199, 291, 257)),
    "cc_progress_back": dict(rect=(350, 284, 463, 322), slices=(4, 0, 16, 0)),
    "cc_progress_fill": dict(rect=(70, 284, 130, 322), slices=(16, 0, 4, 0)),
    "cc_tile_cream": dict(rect=(7, 470, 73, 536), erase=(TILE_ERASE, (15, 478, 65, 528))),
    "cc_tile_peach": dict(rect=(74, 470, 140, 536), erase=(TILE_ERASE, (82, 478, 132, 528))),   # the S cell sits a pixel right
    "cc_tile_orange": dict(rect=(276, 536, 341, 602), erase=(TILE_ERASE, (284, 544, 334, 594))),  # a pixel narrower, stretched
    "cc_tile_yellow": dict(rect=(343, 602, 401, 663), erase=(TILE_ERASE, (350, 608, 396, 656))),  # a 58x61 tile, stretched to the cell
    # the background is nearly flat; the left margin is bluer than the interior (extraction edge), so a
    # horizontal strip from inside the screen is stretched over the whole screen
    "cc_background": dict(rect=(80, 325, 460, 333), size=(458, 512)),  # the backdrop between the bar and the input field, clear of the star
    # word-task tiles: the letter and the digit are erased by two small edits, so the tile's rim and
    # most of its body stay the concept's pixels
    "cc_word_tile": dict(rect=(9, 6, 53, 50), erase=[(TILE_ERASE, (20, 14, 42, 44)), (TILE_ERASE, (34, 35, 50, 49))]),
    "cc_word_tile_found": dict(rect=(55, 6, 99, 50), erase=[(TILE_ERASE, (65, 14, 88, 44)), (TILE_ERASE, (80, 35, 96, 49))]),
    # the letter tile of the strip
    "cc_strip_tile": dict(rect=(16, 198, 72, 260), erase=[("Erase the letter W from this tile so it is empty. Keep the tile's shape, colors, outline and shadow exactly.", (25, 207, 63, 246))]),
    # the five booster buttons with their shadows
    "cc_btn_0": dict(rect=(12, 940, 84, 1020)),
    "cc_btn_1": dict(rect=(109, 940, 181, 1020)),
    "cc_btn_2": dict(rect=(204, 940, 276, 1020)),
    "cc_btn_3": dict(rect=(301, 940, 370, 1020)),
    "cc_btn_4": dict(rect=(393, 940, 458, 1020)),
    "cc_word_tile_active": dict(rect=(146, 48, 190, 92),
                                erase=[("Erase the letter I from this tile, keeping the tile's cream fill and its light blue outline "
                                        "exactly as they are.", (161, 56, 176, 86)),
                                       (TILE_ERASE, (172, 76, 188, 90))]),
}

# every word-task tile of the concept is its own cut: plain ones as the back, found / active ones as the
# state back of that slot (the colour keeps its meaning in the game)
WORD_STATES = ("nfffnn", "fnaan", "nfaaa", "nfnfnfn")
for _w, _states in enumerate(WORD_STATES):
    for _l, _state in enumerate(_states):
        if _state in "nfa":  # found / active slots become that slot's state back (see the layout script)
            _x, _y = 9 + 46 * _l, 6 + 42 * _w
            CROPS["cc_wslot_%d_%d" % (_w, _l)] = dict(rect=(_x, _y, _x + 44, _y + 44), erase=(TILE_ERASE, (_x + 6, _y + 6, _x + 40, _y + 42)))

# the rest of the layout, concept pixels
PANEL_RECT = (8, 7, 331, 179)   # where the word-task panel is drawn (its sprite is the clean right edge, 9-sliced)
# the concept's grid is slightly irregular (columns 7, 73, 141, 208, 276, 343, 405); the game draws a
# regular one through its least-squares fit, so every tile is the same size
BOARD_LEFT, BOARD_TOP = 7, 404
CELL = 66                       # the tile sprite (a cell cut of the concept)
CELL_X, CELL_Y = 67, 66         # the grid pitch (integers: the game pixels stay integer at S = 2)
DRAW_SHIFT = (-1, 0)            # measured: the render lands a concept pixel right of the cuts; even game pixels only

# every cell of the concept board is its own cut (the letter and digit erased), so the board carries the
# concept's hand-drawn variety: cream and peach cells as the plain back, orange and yellow ones as that
# cell's "rare" / "doubled" back (the tint keeps its meaning in the game)
CELL_LEFTS = (7, 73, 141, 208, 276, 343, 405)
ROW_TOPS = (404, 470, 536, 601, 667, 733, 799, 865)
BOARD_STYLES = ("cccppco", "cpppccp", "cppcocc", "ppccpyc", "pccppcc", "ppcpppc", "occpppc", "cccccop")  # rows top-down
for _r, _row in enumerate(BOARD_STYLES):
    for _c, _style in enumerate(_row):
        if _style in "cpoy":  # tinted cells become that cell's "rare"/"doubled" back (see the layout script)
            # cut where the game's regular grid draws the cell, so the cut lands back on its own pixels;
            # the letter is erased inside the measured cell, whatever the grid
            _x, _y = BOARD_LEFT + CELL_X * _c, BOARD_TOP + CELL_Y * _r
            _ex, _ey = CELL_LEFTS[_c], ROW_TOPS[_r]
            # the concept's last two columns are 5 px narrower: their cells are cut narrow and stretched to the standard tile
            _w = 61 if _c >= 5 else 66
            CROPS["cc_cell_%d_%d" % (_c, len(BOARD_STYLES) - 1 - _r)] = dict(
                rect=(_x, _y, _x + _w, _y + 66), size=(132, 132),
                erase=[(TILE_ERASE, (_ex + 8, _ey + 8, _ex + 58, _ey + 58)),
                       ("Erase the small number in the corner of this tile completely, leaving plain tile surface; keep the tile's rim and shading.",
                        (_ex + 42, _ey + 40, _ex + 63, _ey + 62))])

COLUMNS, ROWS = 7, 8
WORD_TILE = (37, 39)            # tile of a word task; the found tile is the board's orange tile scaled down
WORD_ORIGIN = (8, 6)            # first tile rectangle origin (the cut is 44x44 at pitch 46x42)
WORD_PITCH = (46, 42)
STRIP_TILE = (18, 200, 52, 52)  # x, y, w, h of the letter tile in the strip
STRIP_TEXT = (88, 200, 80, 52)
BOOSTER_CENTERS = (47, 143, 240, 335, 425)
BOOSTER_CENTER_Y = 975
BOOSTER_SIZE = (64, 70)


def g(*values):
    """concept pixels -> game pixels"""
    return tuple(round(v * S, 1) for v in values)


def crop_size(name):
    if "size" in CROPS[name]:
        return CROPS[name]["size"]
    x0, y0, x1, y1 = CROPS[name]["rect"]
    return round((x1 - x0) * S), round((y1 - y0) * S)
STRIP_RECT = (6, 179, 464, 272)  # where the strip is drawn

BAR = (70, 284, 463, 322)       # the score bar (cc_progress_back stretched over it)
BAR_TEXT_RIGHT = 406            # the bar text is centred between the bar's left edge and this
BAR_FILL_FRACTION = 170 / 393   # the concept paints its 1200 / 2500 with the fill ending at x = 240
BOARD_LETTER_SHIFT = (-1.9, -2.0)
