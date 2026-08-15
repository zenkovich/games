# Механическая обработка нарезанных слоёв ArtSrc/composer-layers в игровые спрайты.
# Нарезка в масштабе composed-канвы 1024 (контент 572x1024); игровой экран 768x1376,
# коэффициент 1.343. Скрипт чистит альфу от шума нарезки, кропит по bbox и приводит
# слои к рендер-размерам; подложка поля собирается в 9-slice. Арт не рисует.
import os
from PIL import Image

SRC = 'ArtSrc/composer-layers/'
DST = 'Assets/WordFall/Sprites/'

def load_clean(name, threshold=8):
    img = Image.open(SRC + name).convert('RGBA')
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < threshold:
                px[x, y] = (r, g, b, 0)
    return img.crop(img.getbbox())

def save(img, name):
    img.save(DST + name)
    print(name, img.size)

def fit(name, out, size, threshold=8):
    img = load_clean(name, threshold)
    save(img.resize(size, Image.LANCZOS), out)

# фон: точный размер экрана
Image.open(SRC + 'background.png').convert('RGB').resize((768, 1376), Image.LANCZOS) \
     .save(DST + 'background.png')
print('background.png (768, 1376)')

# плитка: чёткий обвод без внешней тени — спрайт равен виджету (88)
fit('letter_bg.png', 'ui_tile.png', (88, 88))

# подложка поля: рендер 686x782, угол ~24 и нижняя кромка внутри бортов -> 9-slice 112x112
board = load_clean('field_bg.png').resize((686, 782), Image.LANCZOS)
b = 40
nine = Image.new('RGBA', (b*2 + 32, b*2 + 32))
w, h = board.size
nine.paste(board.crop((0, 0, b, b)), (0, 0))                          # углы
nine.paste(board.crop((w - b, 0, w, b)), (b + 32, 0))
nine.paste(board.crop((0, h - b, b, h)), (0, b + 32))
nine.paste(board.crop((w - b, h - b, w, h)), (b + 32, b + 32))
nine.paste(board.crop((b, 0, b + 32, b)), (b, 0))                     # кромки
nine.paste(board.crop((b, h - b, b + 32, h)), (b, b + 32))
nine.paste(board.crop((0, b, b, b + 32)), (0, b))
nine.paste(board.crop((w - b, b, w, b + 32)), (b + 32, b))
nine.paste(board.crop((b, b, b + 32, b + 32)), (b, b))                # центр
save(nine, 'ui_panel_board.png')

# лоток ввода слова: цельный спрайт под точный размер
fit('input_field.png', 'ui_input_tray.png', (490, 106))

# кнопки принять/сброс
fit('accept_btn.png', 'ui_btn_accept.png', (88, 95))
fit('cancel_btn.png', 'ui_btn_cancel.png', (92, 92))

# верхние боксы и панель очков
fit('level_bg.png', 'ui_level_box.png', (137, 116))
fit('moves_bg.png', 'ui_moves_box.png', (133, 114))
fit('progress_bg.png', 'ui_score_panel.png', (375, 113))

# заливка прогресса: точный размер выемки (325x34), тянется по ширине целиком
fit('progress_fill.png', 'ui_bar_fill.png', (325, 34), threshold=64)

# панель задач: шапка ~23px сверху; тянется по вертикали 9-slice'ом на рендере
fit('tasks.png', 'ui_tasks_panel.png', (713, 124))

# бустеры: молоток<-бомба, перемешать, подсказка<-лампа, джокер<-swap
fit('bomb_btn.png', 'ui_booster_hammer.png', (120, 114))
fit('shuffle_btn.png', 'ui_booster_shuffle.png', (120, 114))
fit('idea_btn.png', 'ui_booster_hint.png', (120, 114))
fit('swap_btn.png', 'ui_booster_joker.png', (120, 114))
