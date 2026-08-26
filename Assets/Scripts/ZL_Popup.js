// Game over overlay: dim, panel with the final and best scores, PLAY AGAIN button
ZL.Popup = class
{
    constructor(root, onRestart)
    {
        this.visible = false;
        this.score = 0;
        this.best = 0;
        this.isNewBest = false;

        if (ZL.headless)
            return;

        this.node = ZL.makeActor(root, "Popup");
        this.dim = ZL.makeRect(this.node, ZL.W, ZL.H, ZL.color(ZL.colors.dim, 170), 200);
        this.panel = ZL.makeSprite(this.node, "ZeroLine/panel.png", 440, 360, 201);
        ZL.setPos(this.panel.actor, 0, 20);

        ZL.makeLabel(this.node, "TIME'S UP", 0, 150, 400, 50, 40, 210, true);
        ZL.makeLabel(this.node, "SCORE", 0, 85, 200, 30, 22, 210, true, ZL.colors.muted);
        this.scoreLabel = ZL.makeLabel(this.node, "0", 0, 45, 400, 70, 56, 210, true);
        this.bestLabel = ZL.makeLabel(this.node, "BEST 0", 0, -15, 400, 40, 26, 210, true, ZL.colors.muted);

        this.button = ZL.makeButton(this.node, "btn.png", "PLAY AGAIN", 0, -90, 260, 76, 28, 210);
        this.button.onClick = function() { onRestart(); };

        this.node.SetEnabled(false);
    }

    Show(score, best, isNewBest)
    {
        this.visible = true;
        this.score = score;
        this.best = best;
        this.isNewBest = isNewBest;

        if (ZL.headless)
            return;

        this.scoreLabel.SetText("" + score);
        this.bestLabel.SetText(isNewBest ? "NEW BEST!" : "BEST " + best);
        this.bestLabel.SetColor(ZL.color(isNewBest ? ZL.colors.gold : ZL.colors.muted));
        this.node.SetEnabled(true);
    }

    Hide()
    {
        this.visible = false;
        if (this.node)
            this.node.SetEnabled(false);
    }
};
