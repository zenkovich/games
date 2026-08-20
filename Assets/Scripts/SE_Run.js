// In-run gameplay: player, weapon evolution, enemies, gates, orbs, boss, HUD.
// Logic is view-independent: in headless mode no actors/widgets are created.
var SE = (typeof SE !== 'undefined') ? SE : {};

SE.Run = class
{
    constructor(game)
    {
        this.game = game;
        this.stats = SE.meta.Stats();
        this.loop = 0;

        this.time = 0;
        this.over = false;
        this.result = null;   // "win" | "lose"

        this.hp = this.stats.hp;
        this.maxHp = this.stats.hp;
        this.px = 0;
        this.py = -SE.H * 0.32;

        this.cannonLevel = 1;
        this.rocketLevel = 1;
        this.xpLevel = 1;
        this.orbs = 0;
        this.orbsNeeded = SE.cfg.weapons.xp.orbsToLevelBase;

        this.damageBuff = 1;
        this.fireRateBuff = 1;
        this.gateBuffsTaken = 0;
        this.coins = 0;
        this.blueprints = 0;
        this.equipDrops = 0;
        this.kills = 0;

        this.fireTimer = 0;
        this.rocketTimer = 0;
        this.gateStaticTimer = 3;
        this.gateTargetTimer = 5;

        this.bullets = [];
        this.enemyBullets = [];
        this.rockets = [];
        this.enemies = [];
        this.gates = [];
        this.orbEntities = [];
        this.popups = [];

        this.waveIndex = 0;
        this.waveSpawned = 0;
        this.waveTimer = SE.cfg.levels.waves[0].delay;
        this.wavesDone = false;
        this.bossTimer = 0;
        this.boss = null;

        this.root = null;
        this.hud = null;
    }

    // ------------------------------------------------------------------ setup
    Start()
    {
        if (!SE.headless)
        {
            this.root = SE.makeActor(this.game.root, "run", "Game");
            this.hud = SE.makeActor(this.game.root, "hud", "UI");
            this.BuildPlayerView();
            this.BuildHud();
        }

        this.fx = new SE.Fx(this.root, this.hud);

        if (!SE.meta.profile.tutorialDone)
        {
            this.tutorial = new SE.Tutorial(this);
            this.tutorial.Start();
        }
    }

    BuildPlayerView()
    {
        let ship = SE.meta.SelectedShip();
        this.playerView = SE.makeSprite(this.root, ship.sprite, 76, 76, 50);
        this.playerView.actor.GetTransform().SetPosition2D(new Vec2(this.px, this.py));

        this.laserView = SE.makeSprite(this.root, "SpaceEvolver/laser_beam.png", 40, SE.H, 45);
        this.laserView.actor.SetEnabled(false);
    }

    BuildHud()
    {
        let top = SE.H/2;
        this.xpBarBg = SE.makeRect(this.hud, SE.W - 40, 16, new Color4(30, 35, 60, 220), 100);
        this.xpBarBg.actor.GetTransform().SetPosition2D(new Vec2(0, top - 24));
        this.xpBar = SE.makeRect(this.hud, SE.W - 44, 12, new Color4(70, 200, 255, 255), 101);
        this.xpBar.actor.GetTransform().SetPosition2D(new Vec2(0, top - 24));

        this.lvlLabel = SE.makeLabel(this.hud, "LVL 1", 0, top - 24, 200, 20, new Color4(255, 255, 255, 255), 110);
        this.coinLabel = SE.makeLabel(this.hud, "0", -SE.W/2 + 90, top - 52, 160, 24,
                                      new Color4(255, 220, 120, 255), 110);
        this.waveLabel = SE.makeLabel(this.hud, "WAVE 1", SE.W/2 - 90, top - 52, 160, 24,
                                      new Color4(180, 200, 255, 255), 110);

        this.hpBarBg = SE.makeRect(this.hud, 240, 14, new Color4(60, 20, 30, 220), 100);
        this.hpBarBg.actor.GetTransform().SetPosition2D(new Vec2(0, -SE.H/2 + 30));
        this.hpBar = SE.makeRect(this.hud, 236, 10, new Color4(90, 230, 130, 255), 101);
        this.hpBar.actor.GetTransform().SetPosition2D(new Vec2(0, -SE.H/2 + 30));
        this.hpLabel = SE.makeLabel(this.hud, "", 0, -SE.H/2 + 30, 240, 18, new Color4(255, 255, 255, 255), 110);

        this.dmgLabel = SE.makeLabel(this.hud, "", -SE.W/2 + 110, -SE.H/2 + 62, 220, 20,
                                     new Color4(140, 230, 255, 255), 110);
        this.rocketLabel = SE.makeLabel(this.hud, "", SE.W/2 - 110, -SE.H/2 + 62, 220, 20,
                                        new Color4(255, 190, 130, 255), 110);

        this.bossBarBg = SE.makeRect(this.hud, SE.W - 60, 18, new Color4(60, 15, 25, 230), 100);
        this.bossBar = SE.makeRect(this.hud, SE.W - 64, 14, new Color4(240, 70, 90, 255), 101);
        this.bossBarBg.actor.GetTransform().SetPosition2D(new Vec2(0, top - 80));
        this.bossBar.actor.GetTransform().SetPosition2D(new Vec2(0, top - 80));
        this.bossLabel = SE.makeLabel(this.hud, "", 0, top - 80, 300, 20, new Color4(255, 255, 255, 255), 110);
        this.ShowBossBar(false);
    }

    ShowBossBar(on)
    {
        if (SE.headless) return;
        this.bossBarBg.actor.SetEnabled(on);
        this.bossBar.actor.SetEnabled(on);
        if (this.bossLabel) this.bossLabel.SetEnabled(on);
    }

    Destroy()
    {
        if (this.fx) this.fx.Destroy();
        if (this.tutorial) this.tutorial.Destroy();

        if (SE.headless) return;
        if (this.root) this.root.Destroy();
        if (this.hud) this.hud.Destroy();
        this.root = null;
        this.hud = null;
    }

    // ------------------------------------------------------------------ derived numbers
    CannonEvo() { return SE.cfg.weapons.cannon[Math.min(this.cannonLevel, SE.cfg.weapons.cannon.length) - 1]; }
    RocketEvo() { return SE.cfg.weapons.rockets[Math.min(this.rocketLevel, SE.cfg.weapons.rockets.length) - 1]; }

    CannonDamage()
    {
        return this.stats.damage * this.CannonEvo().damageMult * this.damageBuff;
    }

    RocketDamage()
    {
        return this.stats.rocketDamage * this.RocketEvo().damageMult * this.damageBuff;
    }

    // Damage per second used both for the elite HP threshold and the laser
    PlayerDps()
    {
        let evo = this.CannonEvo();
        if (evo.type == "laser")
            return this.CannonDamage();

        let shots = evo.type == "double" ? 2 : (evo.type == "fan" ? 3 : 1);
        return this.CannonDamage() * shots * evo.fireRate * this.fireRateBuff;
    }

    IsElite(hp) { return hp >= SE.cfg.levels.run.eliteHpFactor * Math.max(1, this.PlayerDps()); }

    // ------------------------------------------------------------------ update
    Update(dt)
    {
        if (this.over)
            return;

        this.time += dt;

        this.UpdatePlayer(dt);
        this.UpdateWeapons(dt);
        this.UpdateBullets(dt);
        this.UpdateRockets(dt);
        this.UpdateEnemies(dt);
        this.UpdateGates(dt);
        this.UpdateOrbs(dt);
        this.UpdatePopups(dt);
        this.UpdateWaves(dt);
        this.UpdateBoss(dt);
        this.fx.Update(dt);

        if (this.tutorial)
        {
            this.tutorial.Update(dt);
            this.tutorial.UpdateAfterFinish(dt);
        }

        this.UpdateHud();
    }

    // The ship holds its lane: steering is horizontal only, and the lane sits lower under a
    // finger than under a mouse cursor, which would otherwise leave the ship far above the touch
    UpdatePlayer(dt)
    {
        let ship = SE.cfg.player.ship;

        if (Bridge.IsCursorDown())
        {
            let k = Math.min(1, ship.moveLerpSpeed * dt);
            this.px += (Bridge.GetCursorX() - this.px) * k;
        }

        let lane = Bridge.IsTouchPointer() ? ship.touchShipY : ship.cursorShipY;
        this.py += (lane - this.py) * Math.min(1, ship.laneLerpSpeed * dt);

        this.px = SE.clamp(this.px, -SE.W/2 + 40, SE.W/2 - 40);
        this.py = SE.clamp(this.py, -SE.H/2 + 60, SE.H/2 - 120);

        if (!SE.headless)
            this.playerView.actor.GetTransform().SetPosition2D(new Vec2(this.px, this.py));
    }

    UpdateWeapons(dt)
    {
        let evo = this.CannonEvo();
        if (evo.type == "laser")
        {
            this.UpdateLaser(dt);
        }
        else
        {
            if (!SE.headless) this.laserView.actor.SetEnabled(false);

            this.fireTimer -= dt;
            if (this.fireTimer <= 0)
            {
                this.fireTimer = 1 / (evo.fireRate * this.fireRateBuff);
                this.Shoot(evo);
            }
        }

        this.rocketTimer -= dt;
        let rEvo = this.RocketEvo();
        if (this.rocketTimer <= 0)
        {
            this.rocketTimer = rEvo.cooldown * this.stats.rocketCooldownMult;
            this.LaunchRockets(rEvo);
        }
    }

    Shoot(evo)
    {
        let dmg = this.CannonDamage();
        if (evo.type == "single")
        {
            this.SpawnBullet(this.px, this.py + 40, 0, evo.projSpeed, dmg);
        }
        else if (evo.type == "double")
        {
            this.SpawnBullet(this.px - 16, this.py + 40, 0, evo.projSpeed, dmg);
            this.SpawnBullet(this.px + 16, this.py + 40, 0, evo.projSpeed, dmg);
        }
        else if (evo.type == "fan")
        {
            let a = evo.fanAngle * Math.PI / 180;
            for (let i = -1; i <= 1; i++)
                this.SpawnBullet(this.px, this.py + 40, Math.sin(a * i) * evo.projSpeed,
                                 Math.cos(a * i) * evo.projSpeed, dmg);
        }
    }

    SpawnBullet(x, y, vx, vy, dmg)
    {
        let b = { x: x, y: y, vx: vx, vy: vy, dmg: dmg, r: 8, view: null };
        if (!SE.headless)
        {
            b.view = SE.makeSprite(this.root, "SpaceEvolver/bullet_player.png", 16, 36, 40);
            b.view.actor.GetTransform().SetPosition2D(new Vec2(x, y));
        }
        this.bullets.push(b);
    }

    UpdateLaser(dt)
    {
        let dps = this.CannonDamage();
        let hits = [];
        for (let i = 0; i < this.enemies.length; i++)
        {
            let e = this.enemies[i];
            if (!e.dead && Math.abs(e.x - this.px) < e.r + 20 && e.y > this.py)
                hits.push(e);
        }

        for (let i = 0; i < hits.length; i++)
            this.DamageEnemy(hits[i], dps * dt, false);

        if (!SE.headless)
        {
            this.laserView.actor.SetEnabled(true);
            let topY = SE.H/2;
            let h = topY - (this.py + 40);
            this.laserView.actor.GetTransform().SetSize2D(new Vec2(40, h));
            this.laserView.actor.GetTransform().SetPosition2D(new Vec2(this.px, this.py + 40 + h/2));
        }
    }

    NearestEnemy()
    {
        let best = null, bestD = 1e12;
        for (let i = 0; i < this.enemies.length; i++)
        {
            let e = this.enemies[i];
            if (e.dead)
                continue;

            let dx = e.x - this.px, dy = e.y - this.py;
            let d = dx*dx + dy*dy;
            if (d < bestD) { bestD = d; best = e; }
        }
        return best;
    }

    LaunchRockets(evo)
    {
        for (let i = 0; i < evo.count; i++)
        {
            let r = {
                x: this.px + (i - (evo.count - 1)/2) * 22, y: this.py + 20,
                vx: (i - (evo.count - 1)/2) * 80, vy: 200,
                dmg: this.RocketDamage(), splash: evo.splashRadius, r: 8, life: 6, view: null
            };
            if (!SE.headless)
            {
                r.view = SE.makeSprite(this.root, "SpaceEvolver/rocket.png", 18, 44, 42);
                r.view.actor.GetTransform().SetPosition2D(new Vec2(r.x, r.y));
            }
            this.rockets.push(r);
        }
    }

    UpdateBullets(dt)
    {
        let alive = [];
        for (let i = 0; i < this.bullets.length; i++)
        {
            let b = this.bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;

            let hit = this.FindHitTarget(b.x, b.y, b.r);
            if (hit)
            {
                this.DamageEnemy(hit, b.dmg, true);
                this.KillView(b);
                continue;
            }

            if (b.y > SE.H/2 + 40 || Math.abs(b.x) > SE.W/2 + 40)
            {
                this.KillView(b);
                continue;
            }

            if (b.view) b.view.actor.GetTransform().SetPosition2D(new Vec2(b.x, b.y));
            alive.push(b);
        }
        this.bullets = alive;

        // enemy bullets
        let ealive = [];
        for (let i = 0; i < this.enemyBullets.length; i++)
        {
            let b = this.enemyBullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;

            let dx = b.x - this.px, dy = b.y - this.py;
            if (dx*dx + dy*dy < (b.r + 26) * (b.r + 26))
            {
                this.DamagePlayer(b.dmg);
                this.KillView(b);
                continue;
            }

            if (b.y < -SE.H/2 - 40 || Math.abs(b.x) > SE.W/2 + 60)
            {
                this.KillView(b);
                continue;
            }

            if (b.view) b.view.actor.GetTransform().SetPosition2D(new Vec2(b.x, b.y));
            ealive.push(b);
        }
        this.enemyBullets = ealive;
    }

    // Enemies and target gates are both shootable
    FindHitTarget(x, y, r)
    {
        for (let i = 0; i < this.enemies.length; i++)
        {
            let e = this.enemies[i];
            if (e.dead)
                continue;

            let dx = e.x - x, dy = e.y - y;
            if (dx*dx + dy*dy < (e.r + r) * (e.r + r))
                return e;
        }

        for (let i = 0; i < this.gates.length; i++)
        {
            let g = this.gates[i];
            if (g.dead || g.gateType != "target")
                continue;

            if (Math.abs(g.x - x) < g.w/2 + r && Math.abs(g.y - y) < g.h/2 + r)
                return g;
        }
        return null;
    }

    UpdateRockets(dt)
    {
        let alive = [];
        for (let i = 0; i < this.rockets.length; i++)
        {
            let r = this.rockets[i];
            r.life -= dt;

            let target = this.NearestEnemy();
            if (target)
            {
                let dx = target.x - r.x, dy = target.y - r.y;
                let len = Math.max(0.001, Math.sqrt(dx*dx + dy*dy));
                let speed = 420;
                r.vx += (dx/len * speed - r.vx) * Math.min(1, 4 * dt);
                r.vy += (dy/len * speed - r.vy) * Math.min(1, 4 * dt);
            }
            else
            {
                r.vy += 300 * dt;
            }

            r.x += r.vx * dt;
            r.y += r.vy * dt;

            let hit = this.FindHitTarget(r.x, r.y, r.r);
            if (hit)
            {
                this.DamageEnemy(hit, r.dmg, true);
                if (r.splash > 0)
                    this.SplashDamage(r.x, r.y, r.splash, r.dmg, hit);
                this.KillView(r);
                continue;
            }

            if (r.life <= 0 || r.y > SE.H/2 + 60 || Math.abs(r.x) > SE.W/2 + 80)
            {
                this.KillView(r);
                continue;
            }

            if (r.view)
            {
                r.view.actor.GetTransform().SetPosition2D(new Vec2(r.x, r.y));
                r.view.actor.GetTransform().SetAngle(-Math.atan2(r.vx, r.vy));
            }
            alive.push(r);
        }
        this.rockets = alive;
    }

    SplashDamage(x, y, radius, dmg, exclude)
    {
        let list = this.enemies.slice();
        for (let i = 0; i < list.length; i++)
        {
            let e = list[i];
            if (e == exclude)
                continue;

            let dx = e.x - x, dy = e.y - y;
            if (dx*dx + dy*dy < radius*radius)
                this.DamageEnemy(e, dmg * 0.6, true);
        }
    }

    // ------------------------------------------------------------------ enemies
    SpawnEnemy(typeId, x, y)
    {
        let def = SE.cfg.levels.enemyTypes[typeId];
        let hpScale = Math.pow(SE.cfg.levels.run.loopHpScale, this.loop);
        let e = {
            kind: "enemy", type: typeId, def: def,
            x: x, y: y, r: def.size * 0.45,
            hp: def.hp * hpScale, maxHp: def.hp * hpScale,
            speed: def.speed, phase: Math.random() * 6.28,
            baseX: x, view: null, hpLabel: null
        };

        if (!SE.headless)
        {
            e.view = SE.makeSprite(this.root, def.sprite, def.size, def.size, 30);
            e.view.actor.GetTransform().SetPosition2D(new Vec2(x, y));
            if (this.IsElite(e.hp))
                e.hpLabel = SE.makeLabel(this.hud, "", x, y, 200, 20, new Color4(255, 210, 230, 255), 108);
        }
        else if (this.IsElite(e.hp))
        {
            e.hpLabel = true; // logic-only marker for headless tests
        }

        this.enemies.push(e);
        return e;
    }

    UpdateEnemies(dt)
    {
        // Iterating a copy and pruning at the end: DestroyEnemy may run mid-loop (collisions,
        // splash), and mutating the array under the loop silently skips the next entity
        let list = this.enemies.slice();
        for (let i = 0; i < list.length; i++)
        {
            let e = list[i];
            if (e.dead || e.isBoss)
                continue;

            e.y -= e.speed * dt;
            if (e.def.movement == "sine")
                e.x = e.baseX + Math.sin(this.time * 1.6 + e.phase) * 110;

            let dx = e.x - this.px, dy = e.y - this.py;
            if (dx*dx + dy*dy < (e.r + 26) * (e.r + 26))
            {
                this.DamagePlayer(e.def.damage);
                this.DestroyEnemy(e, false);
                continue;
            }

            if (e.y < -SE.H/2 - 60)
            {
                this.DestroyEnemy(e, false);
                continue;
            }

            if (e.view)
            {
                e.view.actor.GetTransform().SetPosition2D(new Vec2(e.x, e.y));
                if (e.hpLabel && e.hpLabel !== true)
                {
                    SE.place(e.hpLabel, e.x, e.y + e.r + 16, 220, 20);
                    e.hpLabel.SetText("HP " + SE.fmt(e.hp) + " / " + SE.fmt(e.maxHp));
                }
            }
        }
    }

    DamageEnemy(target, dmg, popup)
    {
        if (target.dead) // a splash blast can reach a target the same volley already killed
            return;

        let perks = this.stats.perks;
        if (perks.crit && Math.random() < perks.crit.critChance)
            dmg *= perks.crit.critMult;

        target.hp -= dmg;
        if (popup)
            this.SpawnPopup(target.x, target.y, Math.round(dmg));

        if (target.hp <= 0)
        {
            if (target.kind == "enemy")
                this.DestroyEnemy(target, true);
            else if (target.kind == "gate")
                this.DestroyTargetGate(target);
        }
    }

    // The dead flag makes this idempotent: a splash blast may reach an enemy the same volley
    // already killed, and the loops walk copies, so removing here can't shift them
    DestroyEnemy(e, killed)
    {
        if (e.dead)
            return;

        e.dead = true;

        let idx = this.enemies.indexOf(e);
        if (idx >= 0)
            this.enemies.splice(idx, 1);

        if (e.isBoss)
        {
            this.OnBossKilled();
            return;
        }

        if (killed)
        {
            this.kills++;
            let coinScale = Math.pow(SE.cfg.levels.run.loopCoinScale, this.loop);
            this.coins += e.def.coins * coinScale;
            for (let i = 0; i < e.def.xpOrbs; i++)
                this.SpawnOrb(e.x, e.y, 120);

            this.fx.Flash(e.x, e.y, e.r * 3, e.r * 3, new Color4(255, 170, 120, 255));
            this.fx.Burst(e.x, e.y, new Color4(255, 140, 90, 255), 6, 200);
        }

        if (e.hpLabel && e.hpLabel !== true)
            e.hpLabel.Destroy();

        this.KillView(e);
    }

    DamagePlayer(dmg)
    {
        let perks = this.stats.perks;
        if (perks.reflect)
            dmg *= (1 - perks.reflect.reflectPct);

        this.hp -= dmg;
        if (this.hp <= 0)
        {
            this.hp = 0;
            this.Finish("lose");
        }
    }

    // ------------------------------------------------------------------ gates
    SpawnStaticGate()
    {
        let cfg = SE.cfg.gates.static;
        let buff = cfg.buffs[Math.floor(Math.random() * cfg.buffs.length)];
        let g = {
            kind: "gate", gateType: "static", buff: buff,
            x: (Math.random() - 0.5) * (SE.W - 240), y: SE.H/2 + 60,
            w: 220, h: 70, speed: cfg.speed, used: false,
            phase: Math.random() * 6.28, view: null, label: null
        };

        if (!SE.headless)
        {
            g.view = SE.makeSprite(this.root, "SpaceEvolver/gate_static.png", g.w, g.h, 20);
            g.view.actor.GetTransform().SetPosition2D(new Vec2(g.x, g.y));
            g.label = SE.makeLabel(this.hud, buff.label, g.x, g.y, 200, 22,
                                   new Color4(255, 225, 140, 255), 108);
        }

        this.gates.push(g);
        return g;
    }

    SpawnTargetGate()
    {
        let cfg = SE.cfg.gates.target;
        let hpScale = Math.pow(SE.cfg.levels.run.loopHpScale, this.loop);
        let g = {
            kind: "gate", gateType: "target", x: 0, y: SE.H/2 + 60,
            w: 150, h: 70, hp: cfg.hp * hpScale, maxHp: cfg.hp * hpScale,
            speed: cfg.speedY, phase: Math.random() * 6.28, view: null, label: null
        };
        g.kind = "gate";

        if (!SE.headless)
        {
            g.view = SE.makeSprite(this.root, "SpaceEvolver/gate_target.png", g.w, g.h, 20);
            g.view.actor.GetTransform().SetPosition2D(new Vec2(g.x, g.y));
        }

        this.gates.push(g);
        return g;
    }

    UpdateGates(dt)
    {
        let cfg = SE.cfg.gates;

        // While teaching, the only gate on the field is the one the tutorial placed
        let teaching = this.tutorial && !this.tutorial.done;
        if (!teaching)
        {
            this.gateStaticTimer -= dt;
            if (this.gateStaticTimer <= 0)
            {
                this.gateStaticTimer = cfg.static.spawnInterval;
                this.SpawnStaticGate();
            }

            this.gateTargetTimer -= dt;
            if (this.gateTargetTimer <= 0)
            {
                this.gateTargetTimer = cfg.target.spawnInterval;
                this.SpawnTargetGate();
            }
        }

        // Same rule as enemies: walk a copy, mark, and prune once at the end
        let list = this.gates.slice();
        for (let i = 0; i < list.length; i++)
        {
            let g = list[i];
            if (g.dead)
                continue;

            g.y -= g.speed * dt;

            if (g.gateType == "target")
                g.x = Math.sin(this.time * cfg.target.sineFrequency * 6.28 + g.phase) * cfg.target.sineAmplitude;

            if (g.gateType == "static" && !g.used &&
                Math.abs(g.y - this.py) < g.h/2 + 20 && Math.abs(g.x - this.px) < g.w/2)
            {
                g.used = true;
                this.ApplyGateBuff(g.buff);
                this.PlayGatePassed(g);
                this.RemoveGate(g); // a spent gate must not linger and read as still usable
                continue;
            }

            if (g.y < -SE.H/2 - 60)
            {
                this.RemoveGate(g);
                continue;
            }

            if (g.view)
            {
                let t = g.view.actor.GetTransform();
                t.SetPosition2D(new Vec2(g.x, g.y));

                // gentle breathing so a gate reads as active, not as scenery
                let pulse = 1 + Math.sin(this.time * 4 + g.phase) * 0.04;
                t.SetSize2D(new Vec2(g.w * pulse, g.h * pulse));

                if (g.label)
                    SE.place(g.label, g.x, g.y, 200, 22);
            }
        }
    }

    ApplyGateBuff(buff)
    {
        let pct = buff.pct * this.stats.gateBoostMult / 100;
        if (buff.type == "damage_boost")
            this.damageBuff *= (1 + pct);
        else if (buff.type == "firerate_boost")
            this.fireRateBuff *= (1 + pct);

        this.gateBuffsTaken++;
    }

    // Confirms the pickup: the gate blows into sparks and the buff flies up as a caption,
    // followed by the new weapon number, so the boost is readable at a glance
    PlayGatePassed(g)
    {
        let gold = new Color4(255, 205, 100, 255);
        this.fx.Flash(g.x, g.y, g.w * 0.9, g.h * 2.2, gold);
        this.fx.Burst(g.x, g.y, gold, 10, 260);
        this.fx.FloatingText(g.buff.label, this.px, this.py + 70, gold, 1.1);

        let evo = this.CannonEvo();
        let value = (evo.type == "laser") ? (SE.fmt(this.CannonDamage()) + " DPS")
                                          : (SE.fmt(this.CannonDamage()) + " DMG");
        this.fx.FloatingText(value, this.px, this.py + 34, new Color4(150, 235, 255, 255), 1.3);
    }

    DestroyTargetGate(g)
    {
        if (g.dead)
            return;

        let cfg = SE.cfg.gates.target;
        let n = Math.floor(cfg.orbsMin + Math.random() * (cfg.orbsMax - cfg.orbsMin + 1));
        for (let i = 0; i < n; i++)
            this.SpawnOrb(g.x, g.y, cfg.orbScatterImpulse);

        let pink = new Color4(255, 130, 170, 255);
        this.fx.Flash(g.x, g.y, g.w, g.h * 2, pink);
        this.fx.Burst(g.x, g.y, pink, 8, 240);

        this.coins += 10 * Math.pow(SE.cfg.levels.run.loopCoinScale, this.loop);
        this.RemoveGate(g);
    }

    RemoveGate(g)
    {
        if (g.dead)
            return;

        g.dead = true;
        if (g.label) g.label.Destroy();
        this.KillView(g);

        let idx = this.gates.indexOf(g);
        if (idx >= 0)
            this.gates.splice(idx, 1);
    }

    // ------------------------------------------------------------------ orbs & xp
    OrbScrollSpeed()
    {
        return SE.cfg.player.world.runScrollSpeed * SE.cfg.player.orbs.scrollFactor;
    }

    // Orbs scatter, but most of the impulse is aimed at the ship so drops come to the player
    SpawnOrb(x, y, impulse)
    {
        let cfg = SE.cfg.player.orbs;
        let a = Math.random() * 6.28;
        let dx = this.px - x, dy = this.py - y;
        let len = Math.max(1, Math.sqrt(dx*dx + dy*dy));
        let scatter = impulse * (1 - cfg.towardPlayerBias) * Math.random();
        let toward = impulse * cfg.towardPlayerBias;

        let o = {
            x: x, y: y,
            vx: Math.cos(a) * scatter + dx/len * toward,
            vy: Math.sin(a) * scatter + dy/len * toward,
            view: null
        };

        if (!SE.headless)
        {
            o.view = SE.makeSprite(this.root, "SpaceEvolver/orb_xp.png", 24, 24, 35);
            o.view.actor.GetTransform().SetPosition2D(new Vec2(x, y));
        }

        this.orbEntities.push(o);
    }

    UpdateOrbs(dt)
    {
        let cfg = SE.cfg.player.orbs;
        let magnet = this.stats.magnetRadius;
        let alive = [];
        for (let i = 0; i < this.orbEntities.length; i++)
        {
            let o = this.orbEntities[i];
            let dx = this.px - o.x, dy = this.py - o.y;
            let dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < magnet)
            {
                o.vx += dx/Math.max(1, dist) * cfg.magnetPull * dt;
                o.vy += dy/Math.max(1, dist) * cfg.magnetPull * dt;
            }

            o.vx *= (1 - Math.min(1, cfg.drag * dt));
            o.vy *= (1 - Math.min(1, cfg.drag * dt));
            o.x += o.vx * dt;

            // orbs drift down with the starfield, a touch slower so they read as a nearer layer
            o.y += o.vy * dt - this.OrbScrollSpeed() * dt;

            if (dist < cfg.collectRadius)
            {
                this.CollectOrb();
                this.KillView(o);
                continue;
            }

            if (o.y < -SE.H/2 - 40)
            {
                this.KillView(o);
                continue;
            }

            if (o.view) o.view.actor.GetTransform().SetPosition2D(new Vec2(o.x, o.y));
            alive.push(o);
        }
        this.orbEntities = alive;
    }

    CollectOrb()
    {
        this.orbs += SE.cfg.gates.target.orbXp * this.stats.orbValueMult;
        this.coins += 1;

        while (this.orbs >= this.orbsNeeded)
        {
            this.orbs -= this.orbsNeeded;
            this.LevelUp();
        }
    }

    LevelUp()
    {
        this.xpLevel++;
        let xp = SE.cfg.weapons.xp;
        this.orbsNeeded = Math.ceil(xp.orbsToLevelBase * Math.pow(xp.orbsToLevelGrowth, this.xpLevel - 1));

        // even levels upgrade the cannon, odd ones the rockets
        if (this.xpLevel % 2 == 0)
            this.cannonLevel = Math.min(this.cannonLevel + 1, SE.cfg.weapons.cannon.length);
        else
            this.rocketLevel = Math.min(this.rocketLevel + 1, SE.cfg.weapons.rockets.length);
    }

    // ------------------------------------------------------------------ popups
    SpawnPopup(x, y, value)
    {
        if (SE.headless)
            return;

        let p = { x: x, y: y, life: 0.8, label: SE.makeLabel(this.hud, SE.fmt(value), x, y, 120, 22,
                                                             new Color4(255, 230, 130, 255), 109) };
        this.popups.push(p);
    }

    UpdatePopups(dt)
    {
        let alive = [];
        for (let i = 0; i < this.popups.length; i++)
        {
            let p = this.popups[i];
            p.life -= dt;
            p.y += 70 * dt;

            if (p.life <= 0)
            {
                if (p.label) p.label.Destroy();
                continue;
            }

            if (p.label)
            {
                SE.place(p.label, p.x, p.y, 120, 22);
                p.label.SetTransparency(Math.min(1, p.life * 2));
            }
            alive.push(p);
        }
        this.popups = alive;
    }

    // ------------------------------------------------------------------ waves & boss
    UpdateWaves(dt)
    {
        if (this.wavesDone)
            return;

        if (this.tutorial && !this.tutorial.done) // the lesson must not drown in a wave
            return;

        let waves = SE.cfg.levels.waves;
        if (this.waveIndex >= waves.length)
        {
            this.wavesDone = true;
            this.bossTimer = SE.cfg.levels.boss.delayAfterWaves;
            return;
        }

        this.waveTimer -= dt;
        if (this.waveTimer > 0)
            return;

        let wave = waves[this.waveIndex];
        let x = (Math.random() - 0.5) * (SE.W - 120);
        this.SpawnEnemy(wave.enemy, x, SE.H/2 + 60);
        this.waveSpawned++;

        if (this.waveSpawned >= wave.count)
        {
            this.waveIndex++;
            this.waveSpawned = 0;
            this.waveTimer = (this.waveIndex < waves.length) ? waves[this.waveIndex].delay : 0;
        }
        else
        {
            this.waveTimer = wave.interval;
        }
    }

    UpdateBoss(dt)
    {
        if (!this.wavesDone || this.over)
            return;

        if (!this.boss)
        {
            this.bossTimer -= dt;
            if (this.bossTimer <= 0 && this.enemies.length == 0)
                this.SpawnBoss();
            return;
        }

        let cfg = SE.cfg.levels.boss;
        let b = this.boss;
        b.x += b.dir * cfg.speedX * dt;
        if (b.x > SE.W/2 - b.r) { b.x = SE.W/2 - b.r; b.dir = -1; }
        if (b.x < -SE.W/2 + b.r) { b.x = -SE.W/2 + b.r; b.dir = 1; }

        if (b.y > SE.H/2 - 160)
            b.y -= 60 * dt;

        b.volleyTimer -= dt;
        if (b.volleyTimer <= 0)
        {
            b.volleyTimer = cfg.volley.interval;
            this.BossVolley(b);
        }

        if (b.view)
            b.view.actor.GetTransform().SetPosition2D(new Vec2(b.x, b.y));
    }

    SpawnBoss()
    {
        let cfg = SE.cfg.levels.boss;
        let hpScale = Math.pow(SE.cfg.levels.run.loopHpScale, this.loop);
        let b = {
            kind: "enemy", isBoss: true, type: "boss",
            def: { damage: cfg.contactDamage, coins: cfg.loot.coins, xpOrbs: 0, movement: "boss" },
            x: 0, y: SE.H/2 + 100, r: cfg.width * 0.4,
            hp: cfg.hp * hpScale, maxHp: cfg.hp * hpScale,
            dir: 1, volleyTimer: cfg.volley.interval, view: null
        };

        if (!SE.headless)
        {
            b.view = SE.makeSprite(this.root, cfg.sprite, cfg.width, cfg.height, 32);
            b.view.actor.GetTransform().SetPosition2D(new Vec2(b.x, b.y));
            this.ShowBossBar(true);
        }

        this.boss = b;
        this.enemies.push(b);
        return b;
    }

    BossVolley(b)
    {
        let v = SE.cfg.levels.boss.volley;
        let toPlayerX = this.px - b.x, toPlayerY = this.py - b.y;
        let baseAngle = Math.atan2(toPlayerY, toPlayerX);
        let spread = v.spreadAngle * Math.PI / 180;

        for (let i = 0; i < v.bullets; i++)
        {
            let t = (v.bullets == 1) ? 0 : (i / (v.bullets - 1) - 0.5);
            let a = baseAngle + t * spread;
            let bullet = {
                x: b.x, y: b.y - 40,
                vx: Math.cos(a) * v.bulletSpeed, vy: Math.sin(a) * v.bulletSpeed,
                dmg: v.bulletDamage, r: 10, view: null
            };

            if (!SE.headless)
            {
                bullet.view = SE.makeSprite(this.root, "SpaceEvolver/bullet_enemy.png", 20, 20, 41);
                bullet.view.actor.GetTransform().SetPosition2D(new Vec2(bullet.x, bullet.y));
            }
            this.enemyBullets.push(bullet);
        }
    }

    OnBossKilled()
    {
        let loot = SE.cfg.levels.boss.loot;
        let scale = Math.pow(SE.cfg.levels.run.loopCoinScale, this.loop);
        this.coins += loot.coins * scale;
        this.blueprints += loot.blueprints;
        this.equipDrops += loot.equipmentDrops;
        this.kills++;

        this.KillView(this.boss);
        this.enemies = this.enemies.filter(function(e) { return !e.isBoss; });
        this.boss = null;
        this.ShowBossBar(false);

        this.Finish("win");
    }

    // ------------------------------------------------------------------ finish
    Finish(result)
    {
        if (this.over)
            return;

        this.over = true;
        this.result = result;

        SE.meta.AddCoins(this.coins);
        if (result == "win")
        {
            SE.meta.profile.runsWon++;
            let ships = SE.cfg.ships.ships;
            let locked = [];
            for (let i = 0; i < ships.length; i++)
            {
                if (!SE.meta.IsShipUnlocked(ships[i].id))
                    locked.push(ships[i].id);
            }
            let target = locked.length > 0 ? locked[Math.floor(Math.random() * locked.length)] : ships[0].id;
            SE.meta.AddBlueprints(target, this.blueprints);
            this.blueprintShip = target;

            for (let i = 0; i < this.equipDrops; i++)
            {
                let slots = SE.cfg.equipment.slots;
                SE.meta.AddItem(slots[Math.floor(Math.random() * slots.length)].id, "common");
            }
            SE.meta.AutoEquipBest();
        }
        SE.meta.Save();

        this.ShowResultScreen(result);
    }

    ShowResultScreen(result)
    {
        if (SE.headless)
            return;

        let panel = SE.makeRect(this.hud, 420, 300, new Color4(18, 22, 44, 235), 120);
        panel.actor.GetTransform().SetPosition2D(new Vec2(0, 0));
        this.resultPanel = panel;

        let title = result == "win" ? "SECTOR CLEARED" : "SHIP DESTROYED";
        let color = result == "win" ? new Color4(140, 255, 180, 255) : new Color4(255, 130, 130, 255);
        this.resultLabels = [
            SE.makeLabel(this.hud, title, 0, 110, 400, 40, color, 125),
            SE.makeLabel(this.hud, "Coins +" + SE.fmt(this.coins), 0, 55, 400, 30,
                         new Color4(255, 220, 130, 255), 125),
            SE.makeLabel(this.hud, result == "win" ? ("Blueprints +" + this.blueprints) : "No blueprints",
                         0, 15, 400, 30, new Color4(160, 200, 255, 255), 125),
            SE.makeLabel(this.hud, "Kills " + this.kills + "   LVL " + this.xpLevel, 0, -25, 400, 30,
                         new Color4(200, 210, 235, 255), 125)
        ];

        let self = this;
        this.resultButton = SE.makeButton(this.hud, "TO HANGAR", 0, -90, 240, 56, 126,
                                          function() { self.game.EndRunToHangar(); });
    }

    // ------------------------------------------------------------------ hud & utils
    UpdateHud()
    {
        if (SE.headless)
            return;

        let xpFrac = SE.clamp(this.orbs / this.orbsNeeded, 0, 1);
        let full = SE.W - 44;
        this.xpBar.actor.GetTransform().SetSize2D(new Vec2(Math.max(1, full * xpFrac), 12));
        this.xpBar.actor.GetTransform().SetPosition2D(new Vec2(-full/2 + full * xpFrac/2, SE.H/2 - 24));

        this.lvlLabel.SetText("LVL " + this.xpLevel);
        this.coinLabel.SetText("Coins " + SE.fmt(this.coins));
        this.waveLabel.SetText(this.boss ? "BOSS" : ("WAVE " + Math.min(this.waveIndex + 1, SE.cfg.levels.waves.length)));

        let hpFrac = SE.clamp(this.hp / this.maxHp, 0, 1);
        this.hpBar.actor.GetTransform().SetSize2D(new Vec2(Math.max(1, 236 * hpFrac), 10));
        this.hpBar.actor.GetTransform().SetPosition2D(new Vec2(-118 + 236 * hpFrac/2, -SE.H/2 + 30));
        this.hpLabel.SetText(SE.fmt(this.hp) + " / " + SE.fmt(this.maxHp));

        let evo = this.CannonEvo();
        this.dmgLabel.SetText(evo.type.toUpperCase() + " " + SE.fmt(this.CannonDamage()) +
                              (evo.type == "laser" ? " DPS" : " DMG"));
        let rEvo = this.RocketEvo();
        this.rocketLabel.SetText("ROCKET " + SE.fmt(this.RocketDamage()) + " x" + rEvo.count);

        if (this.boss)
        {
            let frac = SE.clamp(this.boss.hp / this.boss.maxHp, 0, 1);
            let bw = SE.W - 64;
            this.bossBar.actor.GetTransform().SetSize2D(new Vec2(Math.max(1, bw * frac), 14));
            this.bossBar.actor.GetTransform().SetPosition2D(new Vec2(-bw/2 + bw * frac/2, SE.H/2 - 80));
            this.bossLabel.SetText("BOSS  " + SE.fmt(this.boss.hp) + " / " + SE.fmt(this.boss.maxHp));
        }
    }

    KillView(entity)
    {
        if (entity.view && entity.view.actor)
            entity.view.actor.Destroy();
        entity.view = null;
    }

    // ------------------------------------------------------------------ test hooks
    // Counts live view actors whose name contains the part; catches sprites left behind
    // by entities that dropped out of the logic
    CountViewsByName(part)
    {
        if (!this.root)
            return 0;

        let children = this.root.GetChildren();
        let count = 0;
        for (let i = 0; i < children.length; i++)
        {
            if (children[i].GetName().indexOf(part) >= 0)
                count++;
        }
        return count;
    }

    CheatSkipToBoss()
    {
        let list = this.enemies.slice();
        for (let i = 0; i < list.length; i++)
            this.DestroyEnemy(list[i], false);

        this.waveIndex = SE.cfg.levels.waves.length;
        this.wavesDone = true;
        this.bossTimer = 0;
    }

    CheatKillBoss()
    {
        if (!this.boss)
            this.SpawnBoss();
        this.DamageEnemy(this.boss, this.boss.hp + 1, false);
    }

    CheatSetLevel(level)
    {
        while (this.xpLevel < level)
            this.LevelUp();
    }
};
