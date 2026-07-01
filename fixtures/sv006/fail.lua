-- expect: SV006=2
-- Aura data tables can be secret; indexing one throws. Unit heuristic does NOT
-- apply: aura restriction covers the player's own auras in combat.
local spellId = C_UnitAuras.GetAuraDataByIndex("player", 1).spellId
local lowered = UnitName("target"):lower()
