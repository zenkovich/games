"""Converts the exported ScriptableObjects and Localization tables into JSON data assets for the JS game code.

Out: Assets/DragonCrashers/Data/GameData.json, Localization.json
"""
import glob
import json
import os
import re

from port_common import ASSETS, DC, EXPORT, UNITY, load_json, meta, write_if_changed

SPRITES = load_json(os.path.join(ASSETS, DC, "Sprites", "sprites.json"))
LOC_DIR = os.path.join(UNITY, "Assets", "Localization", "StringTables")
TABLE_GUID = "dade14b2149874cc188fc560cf8f29d8"


def yaml_scalar(raw):
    """A plain, single- or double-quoted YAML scalar, possibly folded over several lines."""
    raw = raw.strip()
    if raw.startswith('"'):
        body = raw[1:-1] if raw.endswith('"') else raw[1:]
        body = re.sub(r"\\\n\s*", "", body)
        body = re.sub(r"\n[ \t]*\n[ \t]*", "\n", body)
        body = re.sub(r"\n[ \t]*", " ", body)
        out, i = [], 0
        esc = {"n": "\n", "t": "\t", '"': '"', "\\": "\\", "/": "/", "r": "\r", " ": " ", "0": "\0"}
        while i < len(body):
            c = body[i]
            if c == "\\" and i + 1 < len(body):
                n = body[i + 1]
                if n == "x":
                    out.append(chr(int(body[i + 2:i + 4], 16))); i += 4; continue
                if n == "u":
                    out.append(chr(int(body[i + 2:i + 6], 16))); i += 6; continue
                if n == "U":
                    out.append(chr(int(body[i + 2:i + 10], 16))); i += 10; continue
                out.append(esc.get(n, n)); i += 2; continue
            out.append(c); i += 1
        return "".join(out)
    if raw.startswith("'"):
        body = raw[1:-1] if raw.endswith("'") else raw[1:]
        body = re.sub(r"\n[ \t]*\n[ \t]*", "\n", body)
        body = re.sub(r"\n[ \t]*", " ", body)
        return body.replace("''", "'")
    return re.sub(r"\n[ \t]*", " ", raw)


def read_yaml_entries(path, id_key, value_key):
    text = open(path, encoding="utf-8").read()
    res = {}
    for m in re.finditer(r"- m_Id: (\d+)\n\s+" + value_key + r": ?(.*?)\n\s+m_Metadata", text, re.S):
        res[int(m.group(1))] = yaml_scalar(m.group(2))
    return res


def load_localization():
    keys = read_yaml_entries(os.path.join(LOC_DIR, "SettingsTable Shared Data.asset"), "m_Id", "m_Key")
    tables = {}
    for f in glob.glob(os.path.join(LOC_DIR, "SettingsTable_*.asset")):
        code = os.path.basename(f)[len("SettingsTable_"):-len(".asset")]
        vals = read_yaml_entries(f, "m_Id", "m_Localized")
        tables[code] = {keys[i]: v for i, v in vals.items() if i in keys}
    return keys, tables


KEYS, TABLES = load_localization()


def loc_key(ref):
    """LocalizedString -> table key."""
    if not isinstance(ref, dict):
        return None
    entry = ref.get("m_TableEntryReference", {})
    if entry.get("m_Key"):
        return entry["m_Key"]
    kid = entry.get("m_KeyId", 0)
    return KEYS.get(kid)


def sprite_ref(ref):
    if not isinstance(ref, dict) or ref.get("type") not in ("Sprite", "Texture2D"):
        return None
    key = ("sprite:%s/%s" % (ref.get("tex"), ref["name"])) if ref["type"] == "Sprite" else ("tex:" + ref["name"])
    info = SPRITES.get(key)
    return info["asset"] if info else None


def so_list(objs, type_name):
    return sorted([o for o in objs if o["type"] == "UIToolkitDemo." + type_name], key=lambda o: o["path"])


def main():
    objs = load_json(os.path.join(EXPORT, "Data", "scriptable_objects.json"))
    data = {}

    data["skills"] = {}
    for o in so_list(objs, "SkillSO"):
        f = o["fields"]
        data["skills"][o["name"]] = {
            "name": loc_key(f["m_SkillNameLocalized"]), "category": f["m_Category"],
            "damagePoints": f["m_DamagePoints"], "damageTime": f["m_DamageTime"], "icon": sprite_ref(f["m_IconSprite"])}

    data["equipment"] = []
    for o in so_list(objs, "EquipmentSO"):
        f = o["fields"]
        data["equipment"].append({"id": o["name"], "name": f["equipmentName"], "type": f["equipmentType"],
                                  "rarity": f["rarity"], "points": f["points"], "icon": sprite_ref(f["sprite"])})

    data["characters"] = {}
    for o in so_list(objs, "CharacterBaseSO"):
        f = o["fields"]
        prefab = (f.get("m_CharacterVisualsPrefab") or {}).get("name", "")
        spine = {"PV_Character_Knight": "Knight", "PV_Character_Witch": "Witch", "PV_Character_Wolfman": "Wolfman",
                 "PV_Character_Skeleton_A": "Skeleton_A", "PV_Character_Skeleton_B": "Skeleton_B",
                 "PV_Character_Skeleton_C": "Skeleton_C"}.get(prefab, prefab)
        gear = lambda k: (f.get(k) or {}).get("name")
        data["characters"][o["name"]] = {
            "name": f["m_CharacterName"], "spine": spine, "prefab": prefab,
            "class": f["m_CharacterClass"], "classKey": loc_key(f["m_CharacterClassLocalized"]),
            "rarity": f["m_Rarity"], "rarityKey": loc_key(f["m_RarityLocalized"]),
            "attackType": f["m_AttackType"], "attackTypeKey": loc_key(f["m_AttackTypeLocalized"]),
            "bioTitle": f["m_BioTitle"], "bioTitleKey": loc_key(f["m_BioTitleLocalized"]), "bio": f["m_Bio"],
            "basePoints": {"life": f["m_BasePointsLife"], "defense": f["m_BasePointsDefense"], "attack": f["m_BasePointsAttack"],
                           "attackSpeed": f["m_BasePointsAttackSpeed"], "specialAttack": f["m_BasePointsSpecialAttack"],
                           "criticalHit": f["m_BasePointsCriticalHit"]},
            "skills": [(f.get(k) or {}).get("name") for k in ("m_Skill1", "m_Skill2", "m_Skill3")],
            "defaultGear": [gear("m_DefaultWeapon"), gear("m_DefaultShieldAndArmor"), gear("m_DefaultHelmet"),
                            gear("m_DefaultBoots"), gear("m_DefaultGloves")]}

    data["shopItems"] = []
    for o in so_list(objs, "ShopItemSO"):
        f = o["fields"]
        data["shopItems"].append({
            "id": o["name"], "group": os.path.basename(os.path.dirname(o["path"])), "name": f["m_ItemName"],
            "nameKey": loc_key(f["m_ItemNameLocalized"]), "icon": sprite_ref(f["m_Icon"]), "cost": f["m_Cost"],
            "discount": f["m_Discount"], "promo": f["m_PromoBannerText"], "promoKey": loc_key(f["m_PromoBannerLocalized"]),
            "freeKey": loc_key(f["m_FreeTextLocalized"]), "contentValue": f["m_ContentValue"], "contentType": f["m_ContentType"]})

    data["mail"] = []
    for o in so_list(objs, "MailMessageSO"):
        f = o["fields"]
        data["mail"].append({"id": o["name"], "sender": f["sender"], "subject": f["subjectLine"], "date": f["date"],
                             "text": f["emailText"], "picture": sprite_ref(f["emailPicAttachment"]),
                             "rewardValue": f["rewardValue"], "rewardType": f["rewardType"], "isClaimed": f["isClaimed"],
                             "isImportant": f["isImportant"], "isNew": f["isNew"], "isDeleted": f["isDeleted"]})

    data["chat"] = [{"id": o["name"], "name": o["fields"]["chatname"], "message": o["fields"]["message"]}
                    for o in so_list(objs, "ChatSO")]

    data["levels"] = []
    for o in so_list(objs, "LevelSO"):
        f = o["fields"]
        data["levels"].append({"id": o["name"], "number": f["levelNumber"], "label": f["levelLabel"], "scene": f["sceneName"],
                               "thumbnail": sprite_ref(f["thumbnail"]), "prefixKey": loc_key(f["m_LocalizedLevelNamePrefix"]),
                               "subtitleKey": loc_key(f["m_LocalizedLevelSubtitle"])})

    data["links"] = [{"id": o["name"], "button": o["fields"]["m_ButtonElementId"], "label": o["fields"]["m_ButtonLabel"],
                      "url": o["fields"]["m_TargetURL"]} for o in so_list(objs, "ResourceLinkSO")]

    icons = so_list(objs, "GameIconsSO")[0]["fields"]

    def icon_table(lst, key_field):
        res = {}
        for item in lst:
            k = None
            for kf in item:
                if kf != "icon" and kf != "sprite":
                    k = item[kf]
            spr = item.get("icon") or item.get("sprite")
            res[str(k)] = sprite_ref(spr)
        return res

    data["icons"] = {k: (icon_table(v, None) if isinstance(v, list) else sprite_ref(v)) for k, v in icons.items()}

    data["units"] = {
        "info": {o["name"]: {"name": o["fields"]["unitName"], "avatar": sprite_ref(o["fields"]["unitAvatar"]),
                             "totalHealth": o["fields"]["totalHealth"]} for o in so_list(objs, "UnitInfoData")},
        "abilities": {o["name"]: {"name": o["fields"]["abilityName"], "value": o["fields"]["valueModifer"],
                                  "range": o["fields"]["valueRange"], "cooldown": o["fields"]["cooldownTime"],
                                  "target": o["fields"]["targetType"]} for o in so_list(objs, "UnitAbilityData")},
        "sfx": {o["name"]: {"getHit": [c["name"] for c in o["fields"]["audioClipsGetHit"] if c],
                            "death": [c["name"] for c in o["fields"]["audioClipsDeath"] if c]} for o in so_list(objs, "UnitSFXData")},
    }

    ui_bindings = {}
    for f in glob.glob(os.path.join(UNITY, "Assets", "UI", "Uxml", "**", "*.uxml"), recursive=True):
        text = open(f, encoding="utf-8").read()
        for m in re.finditer(r'<ui:(\w+)[^>]*?name="([^"]+)"[^>]*?>\s*<Bindings>\s*<UnityEngine\.Localization\.LocalizedString property="(\w+)" table="GUID:' + TABLE_GUID + r'" entry="Id\((\d+)\)"', text):
            key = KEYS.get(int(m.group(4)))
            if key:
                ui_bindings[m.group(2)] = {"property": m.group(3), "key": key}
    data["uiBindings"] = ui_bindings

    out = f"{DC}/Data/GameData.json"
    write_if_changed(os.path.join(ASSETS, out), json.dumps(data, indent=1, ensure_ascii=False))
    meta(out, "o2::DefaultAssetMeta<o2::DataAsset>")
    out = f"{DC}/Data/Localization.json"
    write_if_changed(os.path.join(ASSETS, out), json.dumps(TABLES, indent=1, ensure_ascii=False, sort_keys=True))
    meta(out, "o2::DefaultAssetMeta<o2::DataAsset>")
    meta(f"{DC}/Data", "o2::DefaultAssetMeta<o2::FolderAsset>")
    print("characters", len(data["characters"]), "skills", len(data["skills"]), "equipment", len(data["equipment"]),
          "shop", len(data["shopItems"]), "mail", len(data["mail"]), "chat", len(data["chat"]), "bindings", len(ui_bindings),
          "locales", {k: len(v) for k, v in TABLES.items()})


if __name__ == "__main__":
    main()
