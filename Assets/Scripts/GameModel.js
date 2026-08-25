// Color Town rules: economy, storage with overflow conversion, orders, population,
// construction and the affinity meta. Pure data logic — the C++ side only renders and
// forwards taps. All getters return numbers, strings or string arrays for easy interop.

var CT = {
    resources: {
        wheat:    { name: "Wheat",    building: "farm" },
        berry:    { name: "Berry",    building: "farm" },
        cotton:   { name: "Cotton",   building: "farm" },
        iron:     { name: "Iron",     building: "mine" },
        gold:     { name: "Gold",     building: "mine" },
        coal:     { name: "Coal",     building: "mine" },
        apple:    { name: "Apple",    building: "orchard" },
        honey:    { name: "Honey",    building: "orchard" },
        flower:   { name: "Flower",   building: "orchard" },
        wood:     { name: "Wood",     building: "sawmill" },
        resin:    { name: "Resin",    building: "sawmill" },
        mushroom: { name: "Mushroom", building: "sawmill" }
    },

    goods: {
        bread:    { name: "Bread",      building: "bakery",  inputs: { wheat: 3 },                     price: 12,  time: 5,  premium: false },
        pie:      { name: "Berry Pie",  building: "bakery",  inputs: { wheat: 2, berry: 2 },           price: 30,  time: 10, premium: false },
        cake:     { name: "Honey Cake", building: "bakery",  inputs: { wheat: 3, berry: 2, honey: 2 }, price: 70,  time: 20, premium: true },
        nails:    { name: "Nails",      building: "forge",   inputs: { iron: 2, coal: 1 },             price: 15,  time: 6,  premium: false },
        tools:    { name: "Tools",      building: "forge",   inputs: { iron: 3, coal: 2, wood: 2 },    price: 45,  time: 15, premium: false },
        cloth:    { name: "Cloth",      building: "weaver",  inputs: { cotton: 3 },                    price: 14,  time: 6,  premium: false },
        dress:    { name: "Dress",      building: "weaver",  inputs: { cotton: 4, flower: 2 },         price: 55,  time: 15, premium: true },
        ring:     { name: "Gold Ring",  building: "jeweler", inputs: { gold: 2 },                      price: 60,  time: 12, premium: true },
        necklace: { name: "Necklace",   building: "jeweler", inputs: { gold: 3, flower: 1, resin: 1 }, price: 120, time: 25, premium: true }
    },

    buildings: {
        farm:      { name: "Farm",      tier: 1, npc: "tom",  colors: ["wheat", "berry", "cotton"] },
        mine:      { name: "Mine",      tier: 1, npc: "rick", colors: ["iron", "gold", "coal"] },
        orchard:   { name: "Orchard",   tier: 1, npc: "leo",  colors: ["apple", "honey", "flower"] },
        sawmill:   { name: "Sawmill",   tier: 1, npc: "max",  colors: ["wood", "resin", "mushroom"] },
        bakery:    { name: "Bakery",    tier: 2, cost: { coins: 0 },                                  buildTime: 0 },
        forge:     { name: "Forge",     tier: 2, cost: { coins: 150, items: { wood: 4 } },            buildTime: 10 },
        weaver:    { name: "Weaver",    tier: 2, cost: { coins: 300, items: { wood: 6, nails: 4 } },  buildTime: 20 },
        jeweler:   { name: "Jeweler",   tier: 2, cost: { coins: 600, items: { nails: 8, tools: 6 } }, buildTime: 30 },
        cottage:   { name: "Cottage",   tier: 3, cost: { coins: 100 },  population: 50,  needBeauty: 0,  buildTime: 5 },
        townhouse: { name: "Townhouse", tier: 3, cost: { coins: 400 },  population: 150, needBeauty: 10, buildTime: 10 },
        manor:     { name: "Manor",     tier: 3, cost: { coins: 1500 }, population: 500, needBeauty: 30, buildTime: 20 },
        fountain:  { name: "Fountain",  tier: 4, cost: { coins: 80 },   beauty: 5,  dateSpot: false, buildTime: 3 },
        park:      { name: "Park",      tier: 4, cost: { coins: 250 },  beauty: 10, dateSpot: true,  buildTime: 5 },
        cafe:      { name: "Cafe",      tier: 4, cost: { coins: 500 },  beauty: 15, dateSpot: true,  buildTime: 8 }
    },

    tier1Upgrades: [{ coins: 200, affinity: 1 }, { coins: 600, affinity: 2 }],
    tier1Yield: [1.0, 1.3, 1.6],
    tier1MaxBalls: [56, 66, 76],

    npcs: {
        tom:  { name: "Tom",  title: "Farmer",     building: "farm" },
        rick: { name: "Rick", title: "Miner",      building: "mine" },
        leo:  { name: "Leo",  title: "Gardener",   building: "orchard" },
        max:  { name: "Max",  title: "Lumberjack", building: "sawmill" }
    },

    affinityLevels: [0, 30, 80, 160, 300, 500],
    giftRepeatPenalty: 0.5,
    datePoints: 40,
    yieldBuffLevel: 3,
    priceBuffLevel: 5,

    populationTiers: [{ min: 0, mult: 1.0 }, { min: 100, mult: 1.5 }, { min: 500, mult: 2.0 }, { min: 1500, mult: 2.5 }],
    cityLevels: [0, 100, 300, 700, 1500],
    slotCount: 8,
    slotsPerLevel: [3, 5, 7, 8, 8],

    storageCaps: [30, 60],
    storageUpgradeCost: 300,
    startCoins: 50,

    stories: {
        tom_park:   ["Tom: I planted these roses myself, you know.", "Tom: The town looks so alive from here...", "Tom: Thanks for spending the evening with me."],
        tom_cafe:   ["Tom: Fresh bread from our wheat — nothing beats it.", "Tom: You always notice the little things.", "Tom: Same table next time?"],
        rick_park:  ["Rick: Sunlight. I almost forgot what it feels like.", "Rick: Underground it's just me and the pickaxe.", "Rick: With you, up here, it's better."],
        rick_cafe:  ["Rick: Coffee? Strong as bedrock, please.", "Rick: Found a gold vein today. Thought of you first.", "Rick: Don't tell the others I smiled."],
        leo_park:   ["Leo: Every bench here has a story.", "Leo: The bees like it when the town is calm.", "Leo: You make it calm."],
        leo_cafe:   ["Leo: Honey cake — my recipe, the baker's oven.", "Leo: I brought you an apple. The best one.", "Leo: Let's do this again soon."],
        max_park:   ["Max: I carved that bench. Sit, it's sturdy.", "Max: The forest is loud tonight. Good loud.", "Max: You're easy to be around, you know."],
        max_cafe:   ["Max: They let me in even with sawdust on my boots.", "Max: Cake? Fine. But only because you're here.", "Max: Walk you home?"]
    }
};

var GameModel = class GameModel extends o2.Component
{
    constructor()
    {
        super();
        this.Reset();
    }

    Reset()
    {
        const s = {
            coins: CT.startCoins,
            xp: 0,
            storageLevel: 0,
            items: {},
            tier1: { farm: 1, mine: 1, orchard: 1, sawmill: 1 },
            slots: [],
            constructions: [],
            crafts: [],
            npcs: {},
            notifications: [],
            storiesSeen: []
        };

        for (let i = 0; i < CT.slotCount; i++)
            s.slots.push("");
        s.slots[0] = "bakery";

        for (const id in CT.npcs)
            s.npcs[id] = { affinity: 0, lastGifts: [] };

        this._s = s;
    }

    OnStart() { }

    Update(dt)
    {
        const s = this._s;

        for (let i = s.crafts.length - 1; i >= 0; i--)
        {
            const craft = s.crafts[i];
            craft.timeLeft -= dt;
            if (craft.timeLeft <= 0)
            {
                s.crafts.splice(i, 1);
                this.AddItem(craft.good, 1);
                this._Notify(CT.goods[craft.good].name + " is ready");
            }
        }

        for (let i = s.constructions.length - 1; i >= 0; i--)
        {
            const c = s.constructions[i];
            c.timeLeft -= dt;
            if (c.timeLeft <= 0)
            {
                s.constructions.splice(i, 1);
                s.slots[c.slot] = c.id;
                s.xp += 20;
                this._Notify(CT.buildings[c.id].name + " is built");
            }
        }
    }

    // --- economy -------------------------------------------------------------

    GetCoins() { return this._s.coins; }
    GetXp() { return this._s.xp; }
    AddCoins(n) { this._s.coins += n; }

    GetCityLevel()
    {
        let level = 0;
        for (let i = 0; i < CT.cityLevels.length; i++)
            if (this._s.xp >= CT.cityLevels[i]) level = i;
        return level;
    }

    GetNextLevelXp()
    {
        const level = this.GetCityLevel();
        return level + 1 < CT.cityLevels.length ? CT.cityLevels[level + 1] : CT.cityLevels[level];
    }

    GetPopulation()
    {
        let population = 0;
        for (const id of this._s.slots)
            if (id && CT.buildings[id].population) population += CT.buildings[id].population;
        return population;
    }

    GetMultiplier()
    {
        const population = this.GetPopulation();
        let mult = 1.0;
        for (const tier of CT.populationTiers)
            if (population >= tier.min) mult = tier.mult;
        return mult;
    }

    GetNextPopulationTier()
    {
        const population = this.GetPopulation();
        for (const tier of CT.populationTiers)
            if (population < tier.min) return tier.min;
        return 0;
    }

    GetBeauty()
    {
        let beauty = 0;
        for (const id of this._s.slots)
            if (id && CT.buildings[id].beauty) beauty += CT.buildings[id].beauty;
        return beauty;
    }

    // --- storage -------------------------------------------------------------

    GetStorageCap() { return CT.storageCaps[this._s.storageLevel]; }
    GetStorageLevel() { return this._s.storageLevel; }
    GetStorageUpgradeCost() { return CT.storageUpgradeCost; }

    CanUpgradeStorage()
    {
        return this._s.storageLevel + 1 < CT.storageCaps.length && this._s.coins >= CT.storageUpgradeCost;
    }

    UpgradeStorage()
    {
        if (!this.CanUpgradeStorage()) return false;
        this._s.coins -= CT.storageUpgradeCost;
        this._s.storageLevel++;
        return true;
    }

    GetItem(id) { return this._s.items[id] || 0; }
    GetResourceIds() { return Object.keys(CT.resources); }
    GetGoodIds() { return Object.keys(CT.goods); }
    IsGood(id) { return id in CT.goods; }
    GetItemName(id) { return (CT.resources[id] || CT.goods[id] || { name: id }).name; }

    // Stores what fits; the rest converts to coins and city XP (overflow conversion). Returns the overflow count
    AddItem(id, count)
    {
        const s = this._s;
        const have = s.items[id] || 0;
        const space = Math.max(0, this.GetStorageCap() - have);
        const stored = Math.min(count, space);
        const overflow = count - stored;
        s.items[id] = have + stored;

        if (overflow > 0)
        {
            const good = CT.goods[id];
            const coins = good ? Math.floor(good.price * 0.5) * overflow : overflow;
            const xp = good ? 3 * overflow : overflow;
            s.coins += coins;
            s.xp += xp;
            this._Notify("Storage full: " + overflow + " " + this.GetItemName(id) + " sold for " + coins + " coins");
        }

        return overflow;
    }

    RemoveItem(id, count)
    {
        const have = this.GetItem(id);
        if (have < count) return false;
        this._s.items[id] = have - count;
        return true;
    }

    // --- tier 1: glass buildings ---------------------------------------------

    GetTier1Ids() { return ["farm", "mine", "orchard", "sawmill"]; }
    GetBuildingName(id) { return CT.buildings[id].name; }
    GetBuildingTier(id) { return CT.buildings[id].tier; }
    GetBuildingNpc(id) { return CT.buildings[id].npc || ""; }
    GetGlassColors(id) { return CT.buildings[id].colors.slice(); }
    GetTier1Level(id) { return this._s.tier1[id]; }
    GetGlassMaxBalls(id) { return CT.tier1MaxBalls[this._s.tier1[id] - 1]; }

    GetYieldMultiplier(id)
    {
        let mult = CT.tier1Yield[this._s.tier1[id] - 1];
        if (this.GetAffinityLevel(CT.buildings[id].npc) >= CT.yieldBuffLevel)
            mult *= 1.15;
        return mult;
    }

    // Pops of a group of `count` balls; a group of 5+ also pays a small coin bonus. Returns units gained
    Harvest(buildingId, resource, count)
    {
        const gained = Math.max(count, Math.round(count * this.GetYieldMultiplier(buildingId)));
        this.AddItem(resource, gained);
        if (count >= 5)
            this._s.coins += count - 4;
        return gained;
    }

    GetTier1UpgradeCost(id)
    {
        const level = this._s.tier1[id];
        return level - 1 < CT.tier1Upgrades.length ? CT.tier1Upgrades[level - 1].coins : 0;
    }

    GetTier1UpgradeAffinity(id)
    {
        const level = this._s.tier1[id];
        return level - 1 < CT.tier1Upgrades.length ? CT.tier1Upgrades[level - 1].affinity : 0;
    }

    IsTier1MaxLevel(id) { return this._s.tier1[id] - 1 >= CT.tier1Upgrades.length; }

    CanUpgradeTier1(id)
    {
        if (this.IsTier1MaxLevel(id)) return false;
        const up = CT.tier1Upgrades[this._s.tier1[id] - 1];
        return this._s.coins >= up.coins && this.GetAffinityLevel(CT.buildings[id].npc) >= up.affinity;
    }

    UpgradeTier1(id)
    {
        if (!this.CanUpgradeTier1(id)) return false;
        this._s.coins -= CT.tier1Upgrades[this._s.tier1[id] - 1].coins;
        this._s.tier1[id]++;
        this._s.xp += 30;
        return true;
    }

    // --- tier 2: workshops and orders ----------------------------------------

    IsBuilt(id)
    {
        return this._s.slots.indexOf(id) >= 0;
    }

    GetRecipes(buildingId)
    {
        const result = [];
        for (const id in CT.goods)
            if (CT.goods[id].building === buildingId) result.push(id);
        return result;
    }

    GetGoodName(id) { return CT.goods[id].name; }
    GetGoodBuilding(id) { return CT.goods[id].building; }
    GetGoodBasePrice(id) { return CT.goods[id].price; }
    GetGoodTime(id) { return CT.goods[id].time; }
    IsGoodPremium(id) { return !!CT.goods[id].premium; }
    GetGoodInputIds(id) { return Object.keys(CT.goods[id].inputs); }
    GetGoodInputCount(id, resource) { return CT.goods[id].inputs[resource] || 0; }

    HasInputs(good)
    {
        const inputs = CT.goods[good].inputs;
        for (const res in inputs)
            if (this.GetItem(res) < inputs[res]) return false;
        return true;
    }

    IsCrafting(buildingId)
    {
        return this._s.crafts.some(c => CT.goods[c.good].building === buildingId);
    }

    GetCraftGood(buildingId)
    {
        const craft = this._s.crafts.find(c => CT.goods[c.good].building === buildingId);
        return craft ? craft.good : "";
    }

    GetCraftTimeLeft(buildingId)
    {
        const craft = this._s.crafts.find(c => CT.goods[c.good].building === buildingId);
        return craft ? Math.max(0, craft.timeLeft) : 0;
    }

    CanCraft(good)
    {
        const building = CT.goods[good].building;
        return this.IsBuilt(building) && !this.IsCrafting(building) && this.HasInputs(good);
    }

    StartCraft(good)
    {
        if (!this.CanCraft(good)) return false;
        const inputs = CT.goods[good].inputs;
        for (const res in inputs)
            this.RemoveItem(res, inputs[res]);
        this._s.crafts.push({ good: good, timeLeft: CT.goods[good].time });
        return true;
    }

    // Price after the population multiplier and the affinity price buff of the source NPC
    GetSellPrice(good)
    {
        const def = CT.goods[good];
        let price = def.price * this.GetMultiplier();
        for (const res in def.inputs)
        {
            const npc = CT.buildings[CT.resources[res].building].npc;
            if (this.GetAffinityLevel(npc) >= CT.priceBuffLevel)
            {
                price *= 1.1;
                break;
            }
        }
        return Math.floor(price);
    }

    Sell(good, count)
    {
        count = Math.min(count, this.GetItem(good));
        if (count <= 0) return 0;
        const price = this.GetSellPrice(good);
        this.RemoveItem(good, count);
        const total = price * count;
        this._s.coins += total;
        this._s.xp += Math.floor(total * 0.1);
        return total;
    }

    // --- construction --------------------------------------------------------

    GetSlotCount() { return CT.slotCount; }
    GetUnlockedSlots() { return CT.slotsPerLevel[this.GetCityLevel()]; }
    GetSlot(index) { return this._s.slots[index]; }

    IsSlotConstructing(index)
    {
        return this._s.constructions.some(c => c.slot === index);
    }

    GetSlotConstructionId(index)
    {
        const c = this._s.constructions.find(c => c.slot === index);
        return c ? c.id : "";
    }

    GetSlotConstructionTimeLeft(index)
    {
        const c = this._s.constructions.find(c => c.slot === index);
        return c ? Math.max(0, c.timeLeft) : 0;
    }

    GetBuildableIds()
    {
        const result = [];
        for (const id in CT.buildings)
        {
            const def = CT.buildings[id];
            if (def.tier === 1) continue;
            if (def.tier === 2 && (this.IsBuilt(id) || this._s.constructions.some(c => c.id === id))) continue;
            result.push(id);
        }
        return result;
    }

    GetBuildCost(id) { return CT.buildings[id].cost.coins; }
    GetBuildItemIds(id) { return Object.keys(CT.buildings[id].cost.items || {}); }
    GetBuildItemCount(id, item) { return (CT.buildings[id].cost.items || {})[item] || 0; }
    GetBuildTime(id) { return CT.buildings[id].buildTime; }
    GetBuildingPopulation(id) { return CT.buildings[id].population || 0; }
    GetBuildingBeauty(id) { return CT.buildings[id].beauty || 0; }
    GetBuildingNeedBeauty(id) { return CT.buildings[id].needBeauty || 0; }
    IsDateSpot(id) { return !!CT.buildings[id].dateSpot; }

    // Empty string when buildable, otherwise the reason
    GetBuildBlocker(id)
    {
        const def = CT.buildings[id];
        if (this._s.coins < def.cost.coins) return "Need " + def.cost.coins + " coins";
        const items = def.cost.items || {};
        for (const item in items)
            if (this.GetItem(item) < items[item]) return "Need " + items[item] + " " + this.GetItemName(item);
        if ((def.needBeauty || 0) > this.GetBeauty()) return "Need beauty " + def.needBeauty;
        return "";
    }

    CanBuild(id) { return this.GetBuildBlocker(id) === ""; }

    Build(slot, id)
    {
        if (slot < 0 || slot >= this.GetUnlockedSlots()) return false;
        if (this._s.slots[slot] !== "" || this.IsSlotConstructing(slot)) return false;
        if (!this.CanBuild(id)) return false;

        const def = CT.buildings[id];
        this._s.coins -= def.cost.coins;
        const items = def.cost.items || {};
        for (const item in items)
            this.RemoveItem(item, items[item]);

        if (def.buildTime <= 0)
        {
            this._s.slots[slot] = id;
            this._s.xp += 20;
        }
        else
            this._s.constructions.push({ slot: slot, id: id, timeLeft: def.buildTime });

        return true;
    }

    GetDateSpots()
    {
        const result = [];
        for (const id of this._s.slots)
            if (id && CT.buildings[id].dateSpot && result.indexOf(id) < 0) result.push(id);
        return result;
    }

    // --- affinity ------------------------------------------------------------

    GetNpcIds() { return Object.keys(CT.npcs); }
    GetNpcName(id) { return CT.npcs[id].name; }
    GetNpcTitle(id) { return CT.npcs[id].title; }
    GetNpcBuilding(id) { return CT.npcs[id].building; }
    GetAffinity(id) { return this._s.npcs[id].affinity; }
    GetMaxAffinityLevel() { return CT.affinityLevels.length - 1; }

    GetAffinityLevel(id)
    {
        const points = this._s.npcs[id].affinity;
        let level = 0;
        for (let i = 0; i < CT.affinityLevels.length; i++)
            if (points >= CT.affinityLevels[i]) level = i;
        return level;
    }

    GetAffinityLevelStart(level) { return CT.affinityLevels[Math.min(level, CT.affinityLevels.length - 1)]; }

    GetNextAffinityPoints(id)
    {
        const level = this.GetAffinityLevel(id);
        return level + 1 < CT.affinityLevels.length ? CT.affinityLevels[level + 1] : CT.affinityLevels[level];
    }

    GetGiftPoints(npc, good)
    {
        const def = CT.goods[good];
        let points = Math.floor(def.price / 2 * (def.premium ? 1.5 : 1));
        const last = this._s.npcs[npc].lastGifts;
        if (last.length >= 2 && last[last.length - 1] === good && last[last.length - 2] === good)
            points = Math.floor(points * CT.giftRepeatPenalty);
        return Math.max(1, points);
    }

    Gift(npc, good)
    {
        if (this.GetItem(good) < 1) return 0;
        const points = this.GetGiftPoints(npc, good);
        this.RemoveItem(good, 1);
        const n = this._s.npcs[npc];
        n.affinity += points;
        n.lastGifts.push(good);
        if (n.lastGifts.length > 3) n.lastGifts.shift();
        return points;
    }

    GetPremiumGoodsInStock()
    {
        const result = [];
        for (const id in CT.goods)
            if (CT.goods[id].premium && this.GetItem(id) > 0) result.push(id);
        return result;
    }

    CanDate(npc, spot, good)
    {
        return this.IsBuilt(spot) && CT.buildings[spot].dateSpot && CT.goods[good] && CT.goods[good].premium && this.GetItem(good) > 0;
    }

    // Consumes the premium gift, pays the affinity and returns the scene lines
    Date(npc, spot, good)
    {
        if (!this.CanDate(npc, spot, good)) return [];
        this.RemoveItem(good, 1);
        this._s.npcs[npc].affinity += CT.datePoints;
        const key = npc + "_" + spot;
        if (this._s.storiesSeen.indexOf(key) < 0) this._s.storiesSeen.push(key);
        return (CT.stories[key] || ["..."]).slice();
    }

    IsStorySeen(npc, spot) { return this._s.storiesSeen.indexOf(npc + "_" + spot) >= 0; }

    GetNpcBuffText(npc)
    {
        const level = this.GetAffinityLevel(npc);
        const parts = [];
        if (level >= CT.yieldBuffLevel) parts.push("+15% yield");
        if (level >= CT.priceBuffLevel) parts.push("+10% price");
        return parts.join(", ");
    }

    // --- notifications and persistence ---------------------------------------

    _Notify(text) { this._s.notifications.push(text); }
    PopNotification() { return this._s.notifications.length > 0 ? this._s.notifications.shift() : ""; }

    ToJson() { return JSON.stringify(this._s); }

    FromJson(text)
    {
        try
        {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed.coins === "number")
            {
                this.Reset();
                Object.assign(this._s, parsed);
                return true;
            }
        }
        catch (e) { }
        return false;
    }
}
