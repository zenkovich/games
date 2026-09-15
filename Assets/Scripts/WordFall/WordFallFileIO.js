globalThis.WordFallGame = globalThis.WordFallGame || {};

// Обмен файлами с игроком. В веб-сборке скрипты исполняет сам браузер, поэтому сохранение —
// это скачивание Blob, а загрузка — обычный <input type="file">: на телефоне он открывает
// «Файлы»/облако, на десктопе — системный диалог. В нативных сборках файл лежит рядом с игрой.
// Выбор файла асинхронный, результат ждёт в TakeResult() — вьюха забирает его в Update
WordFallFileIO = class WordFallFileIO
{
    static IsBrowser()
    {
        var document = globalThis.document;
        return !!document && typeof document.createElement == "function" && typeof globalThis.Blob == "function";
    }

    static SaveHint()
    {
        return WordFallFileIO.IsBrowser() ? "Сохранение — файл в загрузках браузера"
                                          : "Сохранение — файл рядом с игрой";
    }

    static LoadHint()
    {
        return WordFallFileIO.IsBrowser() ? "Загрузка — выбор файла на устройстве"
                                          : "Загрузка — файл рядом с игрой";
    }

    // Отдаёт текст игроку под именем fileName: {ok, message}
    static SaveText(fileName, text)
    {
        if (!WordFallFileIO.IsBrowser())
        {
            return o2.FileSystem.WriteFile(fileName, text) ? { ok: true, message: "Записан файл " + fileName }
                                                           : { ok: false, message: "Не удалось записать " + fileName };
        }

        try
        {
            var document = globalThis.document;
            var url = globalThis.URL.createObjectURL(new globalThis.Blob([text], { type: "application/json" }));
            var link = document.createElement("a");
            link.href = url;
            link.download = fileName;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            globalThis.setTimeout(function() { globalThis.URL.revokeObjectURL(url); }, 30000);
            return { ok: true, message: "Файл " + fileName + " — в загрузках" };
        }
        catch (error)
        {
            return { ok: false, message: "Браузер не дал сохранить файл: " + error };
        }
    }

    // Просит у игрока файл; прочитанное ждёт в TakeResult(). localPaths — откуда читать
    // в нативной сборке, берётся первый существующий. Возвращает {ok, message} про сам запрос
    static PickText(localPaths)
    {
        WordFallFileIO._result = null;

        if (!WordFallFileIO.IsBrowser())
        {
            var paths = localPaths || [];
            for (var i = 0; i < paths.length; i++)
            {
                var text = o2.FileSystem.ReadFile(paths[i]);
                if (text !== undefined)
                    return WordFallFileIO._Report(true, text, paths[i], "Прочитан файл " + paths[i]);
            }
            return WordFallFileIO._Report(false, "", "", "Рядом с игрой нет файла " + (paths[0] || ""));
        }

        try
        {
            var document = globalThis.document;
            var input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json,text/plain";
            input.style.position = "fixed";
            input.style.left = "-1000px";
            document.body.appendChild(input);

            // Касание экрана поверх канваса: движок разбирает нажатия в своём кадре, а
            // Safari открывает выбор файла только из настоящего обработчика события
            var cover = document.createElement("div");
            cover.id = "wordfall-file-cover";
            cover.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;background:transparent;z-index:2147483647";
            document.body.appendChild(cover);

            var drop = function()
            {
                if (input.parentNode)
                    input.parentNode.removeChild(input);
                if (cover.parentNode)
                    cover.parentNode.removeChild(cover);
            };
            var uncover = function()
            {
                if (cover.parentNode)
                    cover.parentNode.removeChild(cover);
                input.click();
            };
            cover.addEventListener("click", uncover, { once: true });
            cover.addEventListener("touchend", uncover, { once: true });

            input.onchange = function()
            {
                var file = input.files && input.files.length > 0 ? input.files[0] : null;
                drop();
                if (!file)
                {
                    WordFallFileIO._Report(false, "", "", "Файл не выбран");
                    return;
                }

                var reader = new globalThis.FileReader();
                reader.onload = function() { WordFallFileIO._Report(true, "" + reader.result, file.name, "Прочитан файл " + file.name); };
                reader.onerror = function() { WordFallFileIO._Report(false, "", file.name, "Не удалось прочитать " + file.name); };
                reader.readAsText(file);
            };
            input.oncancel = function()
            {
                drop();
                WordFallFileIO._Report(false, "", "", "Файл не выбран");
            };
            globalThis.setTimeout(function() { if (cover.parentNode) drop(); }, 120000);

            input.click();
            return { ok: true, message: "Выберите файл; если диалог не открылся — коснитесь экрана" };
        }
        catch (error)
        {
            return { ok: false, message: "Браузер не дал выбрать файл: " + error };
        }
    }

    // Прочитанный файл {ok, text, name, message} или null, если ничего не ждёт
    static TakeResult()
    {
        var result = WordFallFileIO._result;
        WordFallFileIO._result = null;
        return result || null;
    }

    static _Report(ok, text, name, message)
    {
        WordFallFileIO._result = { ok: ok, text: text, name: name, message: message };
        return { ok: ok, message: message };
    }
};

WordFallFileIO._result = null;
