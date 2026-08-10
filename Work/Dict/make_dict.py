#!/usr/bin/env python3
"""Собирает игровой словарь Word Fall из корпуса русских существительных
(Harrix/Russian-Nouns, MIT) и вписывает его в Assets/Scripts/WordFallGame.js.

Фильтры: 3–8 букв, только кириллица без дефисов, «ё»→«е», без «ъ» (в мешке нет
такой плитки), без обсценной лексики (подсказка не должна её подсвечивать).
"""

import re

ROOT = "/Users/andreizenkovich/work/zenkovich.space/gamesTemplate/"
SRC = ROOT + "Work/Dict/russian_nouns.txt"
GAME_JS = ROOT + "Assets/Scripts/WordFallGame.js"

# корпус Harrix/Russian-Nouns обсценной лексики не содержит (проверено грепом по
# корням) — фильтр только точный, на случай будущей смены корпуса
BANNED_EXACT = {"манда"}

words = set()
with open(SRC, encoding="utf-8") as f:
    for line in f:
        w = line.strip().lower().replace("ё", "е")
        if not (3 <= len(w) <= 8):
            continue
        if not re.fullmatch(r"[а-я]+", w) or "ъ" in w:
            continue
        if w in BANNED_EXACT:
            continue
        words.add(w.upper())

ordered = sorted(words, key=lambda w: (len(w), w))
print("words:", len(words))

blob = " ".join(ordered)
block = (
    "// Словарь: %d русских существительных 3–8 букв в начальной форме\n"
    "// (корпус Harrix/Russian-Nouns, MIT; «ё»→«е», без слов с «ъ» — такой плитки нет\n"
    "// в мешке). Регенерация: Work/Dict/make_dict.py. Одна строка парсится быстрее\n"
    "// массива литералов.\n"
    "WordDict = (\"%s\").split(\" \");"
) % (len(words), blob)

src = open(GAME_JS, encoding="utf-8").read()
new_src, count = re.subn(r"(?:// Словарь:.*?\n)*WordDict = [^;]+;", block, src, count=1, flags=re.S)
assert count == 1, "WordDict block not found"
open(GAME_JS, "w", encoding="utf-8").write(new_src)
print("written to", GAME_JS)
