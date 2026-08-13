// First-run tutorial: four steps woven into a real run. Each step sets up what it teaches
// (an enemy, a gate) and waits for the player to actually do it. Waves are held back until
// the tutorial is over, so the lesson isn't buried under a wave of enemies.
var SE = (typeof SE !== 'undefined') ? SE : {};

SE.Tutorial = class
{
    constructor(run)
    {
        this.run = run;
        this.done = false;
        this.index = 0;
        this.timeInStep = 0;
        this.startX = run.px;
        this.startY = run.py;

        // Every step provides what it teaches and re-provides it if the player misses:
        // a missed gate must not leave the tutorial waiting for something that is gone
        this.steps = [
            {
                id: "drag",
                text: "Веди корабль пальцем",
                Provide: function(run) {},
                NeedsProvide: function(run) { return false; },
                IsComplete: function(run, tut)
                {
                    let dx = run.px - tut.startX, dy = run.py - tut.startY;
                    return Math.sqrt(dx*dx + dy*dy) > 60;
                }
            },
            {
                id: "shoot",
                text: "Стрельба автоматическая — сбей врага",
                Provide: function(run) { run.SpawnEnemy("drone", 0, SE.H/2 - 120); },
                NeedsProvide: function(run) { return run.enemies.length == 0; },
                IsComplete: function(run, tut) { return run.kills > 0; }
            },
            {
                id: "gate",
                text: "Пролети сквозь золотые ворота",
                Provide: function(run)
                {
                    let gate = run.SpawnStaticGate();
                    gate.x = 0;
                    gate.y = SE.H/2 - 40;
                    gate.speed = 80; // slower than usual, so a first-timer can line the ship up
                },
                NeedsProvide: function(run) { return run.gates.length == 0; },
                IsComplete: function(run, tut) { return run.gateBuffsTaken > 0; }
            },
            {
                id: "orbs",
                text: "Разбей мишень и собери сферы",
                Provide: function(run)
                {
                    let gate = run.SpawnTargetGate();
                    gate.y = SE.H/2 - 80;
                    gate.speed = 40;
                    gate.hp = Math.max(1, run.PlayerDps() * 1.5);
                    gate.maxHp = gate.hp;
                },
                NeedsProvide: function(run)
                {
                    return run.gates.length == 0 && run.orbEntities.length == 0;
                },
                IsComplete: function(run, tut) { return run.xpLevel > 1; }
            }
        ];

        this.panel = null;
        this.label = null;
    }

    Start()
    {
        // The hint sits high on the screen: the thumb lives at the bottom and would cover it
        if (!SE.headless && this.run.hud)
        {
            this.panel = SE.makeRect(this.run.hud, SE.W - 36, 52, new Color4(16, 22, 44, 228), 118);
            this.panel.actor.GetTransform().SetPosition2D(new Vec2(0, SE.H/2 - 130));
            this.label = SE.makeLabel(this.run.hud, "", 0, SE.H/2 - 130, SE.W - 52, 46,
                                      new Color4(150, 230, 255, 255), 119, 15);
        }

        this.EnterStep(0);
    }

    CurrentStep() { return this.done ? null : this.steps[this.index]; }

    EnterStep(index)
    {
        this.index = index;
        this.timeInStep = 0;
        this.startX = this.run.px;
        this.startY = this.run.py;

        let step = this.steps[index];
        step.Provide(this.run);

        if (this.label)
            this.label.SetText(step.text);
    }

    Update(dt)
    {
        if (this.done)
            return;

        this.timeInStep += dt;

        let step = this.steps[this.index];

        if (this.timeInStep > 1.0 && step.NeedsProvide(this.run))
        {
            step.Provide(this.run);
            this.timeInStep = 0;
        }

        if (!step.IsComplete(this.run, this))
            return;

        this.run.fx.FloatingText("Отлично!", this.run.px, this.run.py + 90,
                                 new Color4(150, 255, 190, 255), 1.0);

        if (this.index + 1 < this.steps.length)
        {
            this.EnterStep(this.index + 1);
            return;
        }

        this.Finish();
    }

    Finish()
    {
        this.done = true;

        if (this.label)
            this.label.SetText("Обучение пройдено. Вперёд, к боссу!");

        SE.meta.profile.tutorialDone = true;
        SE.meta.Save();

        this.hideTimer = 2.5;
    }

    // Called from the run after Finish to fade the panel away
    UpdateAfterFinish(dt)
    {
        if (!this.done || this.hideTimer === undefined)
            return;

        this.hideTimer -= dt;
        if (this.hideTimer > 0)
            return;

        this.hideTimer = undefined;
        this.HidePanel();
    }

    HidePanel()
    {
        if (this.panel && this.panel.actor) this.panel.actor.Destroy();
        if (this.label) this.label.Destroy();
        this.panel = null;
        this.label = null;
    }

    Destroy() { this.HidePanel(); }
};
