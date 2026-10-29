"""Geometry of the WordFall main screen taken from the HTML layout (Tools/WordFall/CssScreen/game.html and
game.css; the tray and the booster charges from play.css / play.js): 1 rem is a concept pixel of the
471x1026 page. The game screen is 768x1673, so a rem is S game pixels. Rectangles are (x, y, w, h) in rem,
y down from the top of the screen, as getBoundingClientRect gives them on the page.
"""

CONCEPT_W, CONCEPT_H = 471, 1026
SCREEN_W = 768
S = SCREEN_W / CONCEPT_W
SCREEN_H = round(CONCEPT_H * S)  # 1673

# .top: the words panel and the moves parchment
WORDS = (8, 8, 328, 174)
WORDS_INSET = 4                     # border 1 + padding 3
WORD_TILE = (44, 40)                # .tile.small
WORD_GAP = 2                        # between the tiles of a word and between the words
MOVES = (341, 4, 122, 126)
MOVES_CAPTION = (0, 20, 122, 20)    # .moves .caption inside the box, font 20
MOVES_VALUE = (0, 50, 122, 64)      # .moves .value, font 64

# .task: the tasks strip - a tile with its counter per task, the star slot and the check after them
TASK = (8, 189, 455, 81)
TASK_PAD = 13                       # border 1 + padding 12
TASK_GAP = 14
TASK_TILE = 56                      # .tile.medium
TASK_COUNT = (90, 32)               # .task .count: width and font
TASK_SLOT = (56, 54)                # .slot, the star inside it 50 at (3, 2)
TASK_SLOT_STAR = (3, 2, 50)
TASK_CHECK = (52, 56)               # .task .btn

# .progress
PROGRESS = (6, 268, 457, 62)
STAR = (6, 270, 58, 58)
BAR = (70, 280, 393, 38)
BAR_BORDER = 2
BAR_TEXT = 22

# .input
FIELD = (7, 334, 338, 59)
ACCEPT = (352, 335.5, 52, 56)
CANCEL = (411, 335.5, 52, 56)
TRAY_SLOT_STEP = 48                 # play.js TRAY: small tiles 44 wide, 48 apart, 320 for the whole word
TRAY_INNER = 320

# .board
BOARD = (8, 404)
COLUMNS, ROWS = 7, 8
TILE = 61
PITCH = ((455 - 61) / 6, 66)

# .boosters, the charge badge of play.css (right -2, top -2 of the padding box)
BOOSTER_LEFTS = (11, 105.25, 199.5, 293.75, 388)
BOOSTER_TOP = 940
BOOSTER = 72
BADGE = (53, 0, 20, 20)
MODE_TOP = 924

# text: font sizes in rem and the ink
LETTER = {"board": 44, "small": 32, "medium": 37}
POINTS = {"board": (12, 9, 4), "small": (7.5, 5, 3)}   # font, right, bottom (from the padding box)
# o2 centres the cap height of the font's A in a text rect, the page centres a line box of the font size:
# how much higher each kind of text is put to land where the page draws it (measured on the renders)
TEXT_RAISE = {"board": 0.55, "small": 2.27, "medium": 0.65, "count": 1.43, "moves": 1.56}
INK = (42, 10, 0)
LIGHT = (255, 246, 228)
PAPER = (242, 219, 185)


def g(*values):
    """rem -> game pixels"""
    return tuple(round(v * S, 2) for v in values)
