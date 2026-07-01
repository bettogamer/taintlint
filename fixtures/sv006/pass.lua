-- expect: none
-- Store first, guard with issecrettable, then use.
local aura = C_UnitAuras.GetAuraDataByIndex("player", 1)
if aura and not (issecrettable and issecrettable(aura)) then
  print(aura.spellId)
end
