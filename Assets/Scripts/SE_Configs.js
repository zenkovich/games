// Balance configs loader: reads Assets/Configs/*.json through the C++ bridge
var SE = (typeof SE !== 'undefined') ? SE : {};

SE.LoadConfigs = function()
{
    let read = function(name)
    {
        let text = Bridge.LoadConfig(name);
        if (!text || text.length == 0)
        {
            Bridge.Log("SE: config not found - " + name);
            return null;
        }
        return JSON.parse(text);
    };

    SE.cfg = {
        player: read("player_base_stats.json"),
        ships: read("ships_config.json"),
        weapons: read("weapon_evolution.json"),
        gates: read("gates_config.json"),
        equipment: read("equipment_and_merge.json"),
        levels: read("levels_and_waves.json")
    };

    return SE.cfg;
};
