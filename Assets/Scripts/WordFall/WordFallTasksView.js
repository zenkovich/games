// Вьюха панели задач: строки заданий с прогрессом, выполненные — зелёные.
// Синк по ревизии сервиса

WordFallTasksView = class WordFallTasksView extends o2.Component
{
    constructor()
    {
        super();
        this.firstRowY = 44;  // первая строка задач: отступ от верха панели
        this.rowStep = 32;    // шаг строк

        this._svc = null;
        this._labels = [];
        this._lastRevision = -1;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.tasks = this;

        this._svc = this.serviceActor.GetComponent("WordFallGameService");
        this._rows = [];
        for (var i = 0; i < 5; i++)
        {
            var row = this._actor.GetChild("Task" + i);
            this._rows.push(row);
            this._labels.push(row.GetChild("Text"));
        }

        this._LayoutRows();
    }

    // Вертикальная раскладка строк по полям firstRowY/rowStep (редактируются в
    // прототипе); горизонталь задают якоря-колонки, выставленные при сборке
    _LayoutRows()
    {
        for (var i = 0; i < this._rows.length; i++)
        {
            var rowY = -this.firstRowY - Math.floor(i/2)*this.rowStep;
            var layout = this._rows[i].GetLayout();
            var offMin = layout.GetOffsetMin();
            var offMax = layout.GetOffsetMax();
            layout.SetOffsetMin(new Vec2(offMin.x, rowY - 15));
            layout.SetOffsetMax(new Vec2(offMax.x, rowY + 15));
        }
    }

    _TaskText(task)
    {
        if (task.type == "word")
            return "Слово " + task.word;
        if (task.type == "length")
            return "Слова из " + task.length + " букв: " + task.progress + "/" + task.count;
        if (task.type == "powerup")
        {
            var names = { bomb: "Бомба", rocket: "Ракета", wand: "Палочка" };
            return (names[task.kind] || "Бонус") + ": " + task.progress + "/" + task.count;
        }
        if (task.type == "anyWords")
            return "Собрать слов: " + task.progress + "/" + task.count;
        if (task.type == "wordScore")
            return "Слово на " + task.score + "+ очков";
        return "Разбить весь лёд";
    }

    Sync()
    {
        var tasks = this._svc.GetTasks();
        for (var i = 0; i < this._labels.length; i++)
        {
            var label = this._labels[i];
            if (i >= tasks.length)
            {
                label.SetText("");
                continue;
            }

            var task = tasks[i];
            label.SetText((task.done ? "✓ " : "• ") + this._TaskText(task));
            label.SetColor(task.done ? new Color4(150, 240, 140, 255) : new Color4(255, 255, 255, 255));
        }
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        var revision = this._svc.GetRevision();
        if (revision != this._lastRevision)
        {
            this._lastRevision = revision;
            this.Sync();
        }
    }
};
