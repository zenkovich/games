include("Scripts/WordFall/WordFallWindow.js");

// Настройки (WordFall/UI/SettingsWindow.proto, шестерёнка главного экрана): звук и музыка (флаги в прогрессе
// игрока: звуков в игре пока нет), язык поля и словаря, обучение заново
WordFallSettingsView = class WordFallSettingsView extends WordFallWindow
{
    constructor() { super("settings"); }

    static get LanguageNames() { return { ru: "RUSSIAN", en: "ENGLISH" }; }

    OnInit()
    {
        var self = this;
        this._toggles = {};
        ["sound", "music"].forEach(function(name) {
            var path = "dialog/parchment/" + name + "/toggle";
            var button = self._Bind(path, function() { self._Toggle(name); });
            self._toggles[name] = {
                off: button ? button.GetLayer("off") : null,
                on: self._Child(path + "/on"),
                offLabel: self._Child(path + "/off")
            };
        });
        this._language = this._Child("dialog/parchment/language/switch/value");
        this._Bind("dialog/parchment/language/switch", function() { self._NextLanguage(); });
        this._tutorial = this._Child("dialog/parchment/tutorial/replay/value");
        this._Bind("dialog/parchment/tutorial/replay", function() { self._ReplayTutorial(); });
        this._version = this._Child("dialog/version");
    }

    OnOpen()
    {
        for (var name in this._toggles)
            this._ShowToggle(name);
        this._ShowLanguage();
        this._SetText(this._tutorial, "REPLAY");
        this._SetText(this._version, "Word fall · level " + (this._svc.GetLevelIndex() + 1));
    }

    _ShowToggle(name)
    {
        var on = this._svc.GetSetting(name), toggle = this._toggles[name];
        if (toggle.off)
            toggle.off.SetEnabled(!on);
        if (toggle.on)
            toggle.on.SetEnabled(on);
        if (toggle.offLabel)
            toggle.offLabel.SetEnabled(!on);
    }

    _ShowLanguage()
    {
        var code = this._svc.GetLanguage();
        this._SetText(this._language, WordFallSettingsView.LanguageNames[code] || code.toUpperCase());
    }

    _Toggle(name)
    {
        if (!this.IsOpen())
            return;
        this._svc.SetSetting(name, !this._svc.GetSetting(name));
        this._ShowToggle(name);
    }

    _NextLanguage()
    {
        if (!this.IsOpen())
            return;
        this._svc.SetLanguage(WordFallLanguages.Next(this._svc.GetLanguage()));
        this._ShowLanguage();
    }

    _ReplayTutorial()
    {
        if (!this.IsOpen())
            return;
        this._svc.ResetTutorials();
        this._SetText(this._tutorial, "DONE");
    }
};
