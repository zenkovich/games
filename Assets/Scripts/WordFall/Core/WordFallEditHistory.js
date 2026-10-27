// История правок редактора: снимки состояния до каждой правки. Undo возвращает предыдущий
// снимок и кладёт текущий в redo; новая правка сбрасывает redo. Снимок — непрозрачный
// объект {state, index}: состояние хранилища уровней и уровень, который правили
WordFallEditHistory = class WordFallEditHistory
{
    constructor(limit)
    {
        this.limit = limit || 100;
        this._undo = [];
        this._redo = [];
    }

    // Запоминает состояние до правки
    Push(snapshot)
    {
        var last = this._undo[this._undo.length - 1];
        if (last && last.state === snapshot.state)
            return;

        this._undo.push(snapshot);
        if (this._undo.length > this.limit)
            this._undo.shift();
        this._redo = [];
    }

    CanUndo() { return this._undo.length > 0; }
    CanRedo() { return this._redo.length > 0; }
    UndoCount() { return this._undo.length; }
    RedoCount() { return this._redo.length; }

    // current — состояние сейчас; возвращает снимок, к которому вернуться, или null
    Undo(current)
    {
        if (this._undo.length == 0)
            return null;
        this._redo.push(current);
        return this._undo.pop();
    }

    Redo(current)
    {
        if (this._redo.length == 0)
            return null;
        this._undo.push(current);
        return this._redo.pop();
    }

    Clear()
    {
        this._undo = [];
        this._redo = [];
    }
};
