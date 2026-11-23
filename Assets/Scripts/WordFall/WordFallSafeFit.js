// Экран, сделанный в своих единицах (макет designWidth×designHeight), целиком встаёт в безопасную область устройства:
// корень масштабируется так, чтобы макет поместился в SafeArea (safeAreaPath), но не крупнее maxScale — ширины кадра
// камеры. На телефоне с островком экран чуть меньше ширины камеры, фон вокруг — заливка камеры того же цвета
WordFallSafeFit = class WordFallSafeFit extends o2.Component
{
    constructor()
    {
        super();
        this.designWidth = 868;          // ширина макета экрана
        this.designHeight = 1813;        // высота макета экрана
        this.maxScale = 1179/868;        // не крупнее: макет по ширине кадра камеры
        this.safeAreaPath = "Safe";      // безопасная область среди детей корня
        this._area = null;
        this._scale = 0;
    }

    Update(dt)
    {
        if (!this._area)
            this._area = this._actor.GetChild(this.safeAreaPath);
        if (!this._area)
            return;

        // без камеры над экраном (прототип открыт сам по себе) прямоугольник пуст — масштаб из прототипа
        var rect = this._area.GetSafeWorldRect();
        var width = rect.right - rect.left, height = rect.top - rect.bottom;
        if (width <= 0 || height <= 0)
            return;

        var scale = Math.min(this.maxScale, width/this.designWidth, height/this.designHeight);
        if (Math.abs(scale - this._scale) < 0.0001)
            return;

        this._scale = scale;
        this._actor.GetTransform().SetScale2D(new Vec2(scale, scale));
    }
};
