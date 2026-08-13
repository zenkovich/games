// Meta progression: persistent profile, upgrade costs, ships, equipment and merge
var SE = (typeof SE !== 'undefined') ? SE : {};

SE.Meta = class
{
    constructor()
    {
        this.profile = null;
    }

    DefaultProfile()
    {
        let p = SE.cfg.player;
        return {
            coins: p.startCoins,
            blueprints: {},
            upgrades: { health: 0, mainAttack: 0, rocketAttack: 0, magnetRadius: 0, offlineIncome: 0 },
            multipliers: { orbValue: 0, gateBoost: 0 },
            unlockedShips: ["viper_x"],
            selectedShip: "viper_x",
            inventory: [],     // { slot, rarity }
            equipped: {},      // slot -> { slot, rarity }
            lastSeenTs: Bridge.GetTimeSec(),
            tutorialDone: false,
            runsWon: 0,
            bestLoop: 0
        };
    }

    Load()
    {
        let text = Bridge.LoadPersistent();
        if (text && text.length > 2)
        {
            try { this.profile = JSON.parse(text); }
            catch (e) { this.profile = null; }
        }

        if (!this.profile)
            this.profile = this.DefaultProfile();

        // forward-compatible defaults for a profile written by an older build
        let def = this.DefaultProfile();
        for (let k in def)
        {
            if (this.profile[k] === undefined)
                this.profile[k] = def[k];
        }

        this.CollectOfflineIncome();
        return this.profile;
    }

    Save()
    {
        Bridge.SavePersistent(JSON.stringify(this.profile));
    }

    // ---------------------------------------------------------------- upgrades
    UpgradeDef(id)
    {
        return SE.cfg.player.upgrades[id] || SE.cfg.player.multipliers[id];
    }

    UpgradeLevel(id)
    {
        return (this.profile.upgrades[id] !== undefined) ? this.profile.upgrades[id] : this.profile.multipliers[id];
    }

    UpgradeCost(id)
    {
        let def = this.UpgradeDef(id);
        return Math.ceil(def.baseCost * Math.pow(def.costMult, this.UpgradeLevel(id)));
    }

    CanBuyUpgrade(id)
    {
        return this.profile.coins >= this.UpgradeCost(id);
    }

    BuyUpgrade(id)
    {
        let cost = this.UpgradeCost(id);
        if (this.profile.coins < cost)
            return false;

        this.profile.coins -= cost;
        if (this.profile.upgrades[id] !== undefined)
            this.profile.upgrades[id]++;
        else
            this.profile.multipliers[id]++;

        this.Save();
        return true;
    }

    // ---------------------------------------------------------------- ships
    ShipDef(id)
    {
        let list = SE.cfg.ships.ships;
        for (let i = 0; i < list.length; i++)
        {
            if (list[i].id == id)
                return list[i];
        }
        return list[0];
    }

    SelectedShip() { return this.ShipDef(this.profile.selectedShip); }

    IsShipUnlocked(id) { return this.profile.unlockedShips.indexOf(id) >= 0; }

    Blueprints(id) { return this.profile.blueprints[id] || 0; }

    AddBlueprints(id, count)
    {
        this.profile.blueprints[id] = this.Blueprints(id) + count;
    }

    CanUnlockShip(id)
    {
        let def = this.ShipDef(id);
        return !this.IsShipUnlocked(id) && this.Blueprints(id) >= def.blueprintsCost;
    }

    UnlockShip(id)
    {
        if (!this.CanUnlockShip(id))
            return false;

        let def = this.ShipDef(id);
        this.profile.blueprints[id] = this.Blueprints(id) - def.blueprintsCost;
        this.profile.unlockedShips.push(id);
        this.Save();
        return true;
    }

    SelectShip(id)
    {
        if (!this.IsShipUnlocked(id))
            return false;

        this.profile.selectedShip = id;
        this.Save();
        return true;
    }

    // ---------------------------------------------------------------- equipment
    RarityIndex(id)
    {
        let r = SE.cfg.equipment.rarities;
        for (let i = 0; i < r.length; i++)
        {
            if (r[i].id == id)
                return i;
        }
        return 0;
    }

    RarityDef(id) { return SE.cfg.equipment.rarities[this.RarityIndex(id)]; }

    AddItem(slot, rarity)
    {
        this.profile.inventory.push({ slot: slot, rarity: rarity });
    }

    CountItems(slot, rarity)
    {
        let n = 0;
        for (let i = 0; i < this.profile.inventory.length; i++)
        {
            let it = this.profile.inventory[i];
            if (it.slot == slot && it.rarity == rarity)
                n++;
        }
        return n;
    }

    CanMerge(slot, rarity)
    {
        let rules = SE.cfg.equipment.merge;
        let maxIdx = SE.cfg.equipment.rarities.length - 1;
        return this.RarityIndex(rarity) < maxIdx && this.CountItems(slot, rarity) >= rules.count;
    }

    Merge(slot, rarity)
    {
        if (!this.CanMerge(slot, rarity))
            return false;

        let need = SE.cfg.equipment.merge.count;
        let left = [];
        let removed = 0;
        for (let i = 0; i < this.profile.inventory.length; i++)
        {
            let it = this.profile.inventory[i];
            if (removed < need && it.slot == slot && it.rarity == rarity)
                removed++;
            else
                left.push(it);
        }

        this.profile.inventory = left;
        let next = SE.cfg.equipment.rarities[this.RarityIndex(rarity) + 1].id;
        this.AddItem(slot, next);
        this.AutoEquipBest();
        this.Save();
        return true;
    }

    BuyItem(slot)
    {
        let cost = SE.cfg.equipment.shop.itemCost;
        if (this.profile.coins < cost)
            return false;

        this.profile.coins -= cost;
        this.AddItem(slot, "common");
        this.AutoEquipBest();
        this.Save();
        return true;
    }

    // Equips the highest rarity item of every slot
    AutoEquipBest()
    {
        this.profile.equipped = {};
        for (let i = 0; i < this.profile.inventory.length; i++)
        {
            let it = this.profile.inventory[i];
            let cur = this.profile.equipped[it.slot];
            if (!cur || this.RarityIndex(it.rarity) > this.RarityIndex(cur.rarity))
                this.profile.equipped[it.slot] = it;
        }
    }

    // Equipment bonus percent for a stat: hp / damage / magnet / speed
    EquipBonusPct(stat)
    {
        let pct = 0;
        let slots = SE.cfg.equipment.slots;
        for (let i = 0; i < slots.length; i++)
        {
            let s = slots[i];
            let it = this.profile.equipped[s.id];
            if (it && s.bonusStat == stat)
                pct += this.RarityDef(it.rarity).bonusPct;
        }
        return pct;
    }

    ActivePerks()
    {
        let perks = {};
        for (let slotId in this.profile.equipped)
        {
            let it = this.profile.equipped[slotId];
            let rd = this.RarityDef(it.rarity);
            if (rd.perk)
                perks[rd.perk] = SE.cfg.equipment.perks[rd.perk];
        }
        return perks;
    }

    // ---------------------------------------------------------------- derived combat stats
    Stats()
    {
        let cfg = SE.cfg.player;
        let ship = this.SelectedShip();
        let up = this.profile.upgrades;

        let hp = (cfg.ship.baseHp + up.health * cfg.upgrades.health.perLevel)
                 * ship.hpMult * (1 + this.EquipBonusPct("hp") / 100);

        let dmg = (cfg.ship.baseDamage + up.mainAttack * cfg.upgrades.mainAttack.perLevel)
                  * ship.damageMult * (1 + this.EquipBonusPct("damage") / 100);

        let rocket = (cfg.ship.baseRocketDamage + up.rocketAttack * cfg.upgrades.rocketAttack.perLevel)
                     * (1 + this.EquipBonusPct("damage") / 100);

        let magnet = (cfg.ship.magnetRadius + up.magnetRadius * cfg.upgrades.magnetRadius.perLevel)
                     * (1 + this.EquipBonusPct("magnet") / 100);

        return {
            hp: hp,
            damage: dmg,
            rocketDamage: rocket,
            magnetRadius: magnet,
            speed: cfg.ship.speed * ship.speedMult * (1 + this.EquipBonusPct("speed") / 100),
            rocketCooldownMult: ship.rocketCooldownMult,
            orbValueMult: 1 + this.profile.multipliers.orbValue * cfg.multipliers.orbValue.perLevelPct / 100,
            gateBoostMult: 1 + this.profile.multipliers.gateBoost * cfg.multipliers.gateBoost.perLevelPct / 100,
            perks: this.ActivePerks()
        };
    }

    // ---------------------------------------------------------------- currency & offline
    AddCoins(n) { this.profile.coins += Math.round(n); }

    OfflineRate() { return this.profile.upgrades.offlineIncome * SE.cfg.player.upgrades.offlineIncome.perLevel; }

    CollectOfflineIncome()
    {
        let now = Bridge.GetTimeSec();
        let elapsed = Math.max(0, now - (this.profile.lastSeenTs || now));
        let capped = Math.min(elapsed, SE.cfg.player.offline.maxHours * 3600);
        let income = Math.floor(capped * this.OfflineRate());
        this.profile.lastSeenTs = now;
        if (income > 0)
            this.AddCoins(income);
        return income;
    }
};
