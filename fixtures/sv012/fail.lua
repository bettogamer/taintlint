-- expect: SV012=2
-- Direct CLEU registration errors on 12.0+: use C_CombatLog instead.
local f = CreateFrame("Frame")
f:RegisterEvent("COMBAT_LOG_EVENT_UNFILTERED")
f:RegisterEvent("COMBAT_LOG_EVENT")
