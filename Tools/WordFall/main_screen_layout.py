"""Geometry of the WordFall main screen measured on the concept (Assets/Generated/concept_new.png,
471x1026 concept pixels). The game screen keeps the concept's aspect at the game's width: 768x1673,
so a concept pixel is S game pixels. Rectangles are (x0, y0, x1, y1), y down from the top.
"""

CONCEPT_W, CONCEPT_H = 471, 1026
SCREEN_W = 768
S = SCREEN_W / CONCEPT_W
SCREEN_H = round(CONCEPT_H * S)  # 1673

WORDS_PANEL = (8, 7, 330, 177)      # the dark panel with the level's words
WORD_TILE = (43, 41)                # a word tile, its pitch and the first tile inside the panel
WORD_PITCH = (45.7, 42)
WORD_ORIGIN = (2.5, 2.5)
WORD_ROWS, WORD_SLOTS = 4, 8

MOVES_BOX = (331, 3, 466, 131)      # parchment: caption and the number
STRIP = (7, 188, 463, 271)          # the other tasks: icon tile + counter each, the check at the end
STRIP_ICON = 47                     # icon tile size, its left offset from the item start
STRIP_FIRST = 12                    # first item's left offset inside the strip
STRIP_ITEM = 124                    # item pitch (icon + counter)
STRIP_CHECK = 50                    # the "all done" check

STAR = (6, 272, 69, 338)
BAR = (70, 284, 463, 322)

INPUT = (8, 334, 349, 395)
ACCEPT = (352, 333, 409, 393)
CANCEL = (410, 333, 464, 393)

COLUMNS, ROWS = 7, 8
BOARD_LEFT, BOARD_TOP = 8, 405      # the first tile's top-left corner
CELL = 65.7                         # grid pitch, both ways
TILE = 61.3                         # a tile without its shadow

BOOSTER_CENTERS = (47, 143, 240, 335, 425)
BOOSTER_Y = 975
BOOSTER_SIZE = 70

BACKGROUND = (243, 224, 192)
TEXT = (52, 26, 12)


def g(*values):
    """concept pixels -> game pixels"""
    return tuple(round(v * S, 1) for v in values)


def rect(r):
    """concept rectangle -> game (x, y, w, h)"""
    x0, y0, x1, y1 = r
    return g(x0, y0, x1 - x0, y1 - y0)
