// Hangar hub: stat upgrades, fleet, equipment merge and the run launcher
var SE = (typeof SE !== 'undefined') ? SE : {};

SE.Hangar = class
{
    constructor(game)
    {
        this.game = game;
        this.root = null;
        this.upgradeRows = [];
        this.shipCards = [];
        this.equipCards = [];
        this.offlineIncome = 0;
    }

    Build()
    {
        this.offlineIncome = SE.meta.CollectOfflineIncome();

        if (SE.headless)
            return;

        this.root = SE.makeActor(this.game.root, "hangar", "UI");
        let top = SE.H/2;

        SE.makeLabel(this.root, "HANGAR", 0, top - 40, 400, 44, new Color4(200, 220, 255, 255), 110);
        this.coinLabel = SE.makeLabel(this.root, "", -SE.W/2 + 110, top - 82, 240, 28,
                                      new Color4(255, 220, 120, 255), 110);
        this.incomeLabel = SE.makeLabel(this.root, "", SE.W/2 - 110, top - 82, 240, 24,
                                        new Color4(150, 220, 180, 255), 110);

        this.BuildShipPreview();
        this.BuildFleet();
        this.BuildUpgrades();
        this.BuildEquipment();

        let self = this;
        SE.makeButton(this.root, "START RUN", 0, -SE.H/2 + 50, 300, 64, 120,
                      function() { self.game.StartRun(); });

        this.Refresh();
    }

    BuildShipPreview()
    {
        let ship = SE.meta.SelectedShip();
        this.shipView = SE.makeSprite(this.root, ship.sprite, 150, 150, 10, "UI");
        this.shipView.actor.GetTransform().SetPosition2D(new Vec2(0, SE.H/2 - 190));
        this.shipNameLabel = SE.makeLabel(this.root, ship.name, 0, SE.H/2 - 280, 400, 32,
                                          new Color4(150, 230, 255, 255), 110);
        this.shipStatsLabel = SE.makeLabel(this.root, "", 0, SE.H/2 - 312, 460, 24,
                                           new Color4(200, 210, 235, 255), 110);
    }

    BuildFleet()
    {
        let ships = SE.cfg.ships.ships;
        let y = SE.H/2 - 390;
        for (let i = 0; i < ships.length; i++)
        {
            let def = ships[i];
            let x = -SE.W/2 + 75 + i * 130;
            let card = SE.makeRect(this.root, 118, 106, new Color4(25, 30, 55, 220), 100);
            card.actor.GetTransform().SetPosition2D(new Vec2(x, y));

            let icon = SE.makeSprite(this.root, def.sprite, 62, 62, 102, "UI");
            icon.actor.GetTransform().SetPosition2D(new Vec2(x, y + 14));

            let label = SE.makeLabel(this.root, "", x, y - 36, 120, 20,
                                     new Color4(190, 205, 235, 255), 110);

            let self = this;
            let id = def.id;
            let btn = SE.makeButton(this.root, "", x, y, 118, 106, 103, function() { self.OnShipCard(id); });
            if (btn) btn.SetTransparency(0.01);

            this.shipCards.push({ def: def, card: card, label: label });
        }
    }

    OnShipCard(id)
    {
        if (SE.meta.IsShipUnlocked(id))
            SE.meta.SelectShip(id);
        else
            SE.meta.UnlockShip(id);

        let ship = SE.meta.SelectedShip();
        if (this.shipView)
        {
            this.shipView.img.LoadFromImage(ship.sprite);
            this.shipView.actor.GetTransform().SetSize2D(new Vec2(150, 150));
            this.shipNameLabel.SetText(ship.name);
        }
        this.Refresh();
    }

    BuildUpgrades()
    {
        let ids = ["health", "mainAttack", "rocketAttack", "magnetRadius", "offlineIncome",
                   "orbValue", "gateBoost"];
        let y0 = SE.H/2 - 462;
        for (let i = 0; i < ids.length; i++)
        {
            let id = ids[i];
            let y = y0 - i * 44;
            let row = SE.makeRect(this.root, SE.W - 30, 38, new Color4(22, 27, 50, 220), 100);
            row.actor.GetTransform().SetPosition2D(new Vec2(0, y));

            let nameLabel = SE.makeLabel(this.root, "", -SE.W/2 + 130, y, 250, 22,
                                         new Color4(215, 225, 245, 255), 110);

            let self = this;
            let btn = SE.makeButton(this.root, "", SE.W/2 - 90, y, 150, 34, 105,
                                    function() { self.OnBuyUpgrade(id); });

            this.upgradeRows.push({ id: id, nameLabel: nameLabel, button: btn });
        }
    }

    OnBuyUpgrade(id)
    {
        SE.meta.BuyUpgrade(id);
        this.Refresh();
    }

    BuildEquipment()
    {
        let slots = SE.cfg.equipment.slots;
        let y = -SE.H/2 + 138;
        for (let i = 0; i < slots.length; i++)
        {
            let slot = slots[i];
            let x = -SE.W/2 + 75 + i * 130;
            let card = SE.makeRect(this.root, 118, 108, new Color4(25, 30, 55, 220), 100);
            card.actor.GetTransform().SetPosition2D(new Vec2(x, y));

            let icon = SE.makeSprite(this.root, slot.icon, 50, 50, 102, "UI");
            icon.actor.GetTransform().SetPosition2D(new Vec2(x, y + 24));

            let label = SE.makeLabel(this.root, "", x, y - 10, 130, 18,
                                     new Color4(200, 215, 240, 255), 110);

            let self = this;
            let id = slot.id;
            let btn = SE.makeButton(this.root, "", x, y - 36, 106, 28, 105,
                                    function() { self.OnEquipCard(id); });

            this.equipCards.push({ slot: slot, card: card, icon: icon, label: label, button: btn });
        }
    }

    // One button per slot: merges when possible, otherwise buys a common item
    OnEquipCard(slotId)
    {
        let rarities = SE.cfg.equipment.rarities;
        for (let i = rarities.length - 2; i >= 0; i--)
        {
            if (SE.meta.CanMerge(slotId, rarities[i].id))
            {
                SE.meta.Merge(slotId, rarities[i].id);
                this.Refresh();
                return;
            }
        }

        SE.meta.BuyItem(slotId);
        this.Refresh();
    }

    Refresh()
    {
        if (SE.headless)
            return;

        let p = SE.meta.profile;
        let stats = SE.meta.Stats();

        this.coinLabel.SetText("Coins " + SE.fmt(p.coins));
        this.incomeLabel.SetText(this.offlineIncome > 0 ? ("Offline +" + SE.fmt(this.offlineIncome))
                                                        : ("Income " + SE.fmt(SE.meta.OfflineRate()) + "/s"));

        this.shipStatsLabel.SetText("DMG " + SE.fmt(stats.damage) + "   HP " + SE.fmt(stats.hp) +
                                    "   ROCKET " + SE.fmt(stats.rocketDamage) +
                                    "   MAG " + SE.fmt(stats.magnetRadius));

        for (let i = 0; i < this.shipCards.length; i++)
        {
            let c = this.shipCards[i];
            let id = c.def.id;
            if (SE.meta.IsShipUnlocked(id))
            {
                c.label.SetText(p.selectedShip == id ? "ACTIVE" : "OWNED");
                c.card.img.SetColor(p.selectedShip == id ? new Color4(40, 80, 110, 235)
                                                         : new Color4(25, 30, 55, 220));
            }
            else
            {
                c.label.SetText(SE.meta.Blueprints(id) + "/" + c.def.blueprintsCost + " BP");
                c.card.img.SetColor(new Color4(25, 30, 55, 220));
            }
        }

        for (let i = 0; i < this.upgradeRows.length; i++)
        {
            let row = this.upgradeRows[i];
            let def = SE.meta.UpgradeDef(row.id);
            row.nameLabel.SetText(def.label + "   LV " + SE.meta.UpgradeLevel(row.id));
            if (row.button)
                row.button.SetCaption(SE.fmt(SE.meta.UpgradeCost(row.id)));
        }

        for (let i = 0; i < this.equipCards.length; i++)
        {
            let c = this.equipCards[i];
            let equipped = p.equipped[c.slot.id];
            let rarity = equipped ? SE.meta.RarityDef(equipped.rarity) : null;
            let count = equipped ? SE.meta.CountItems(c.slot.id, equipped.rarity) : 0;

            c.label.SetText(rarity ? (rarity.name + " x" + count) : "EMPTY");
            if (rarity)
            {
                c.card.img.SetColor(new Color4(rarity.color[0], rarity.color[1], rarity.color[2], 150));
            }

            if (c.button)
            {
                let canMerge = equipped && SE.meta.CanMerge(c.slot.id, equipped.rarity);
                c.button.SetCaption(canMerge ? "MERGE 3" : ("BUY " + SE.cfg.equipment.shop.itemCost));
            }
        }
    }

    Update(dt) {}

    Destroy()
    {
        if (this.root)
            this.root.Destroy();
        this.root = null;
        this.upgradeRows = [];
        this.shipCards = [];
        this.equipCards = [];
    }
};
