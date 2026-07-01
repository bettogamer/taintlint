-- expect: SV007=1
-- Calling a (possibly) secret value as a function throws.
local result = C_UnitAuras.GetAuraDataByIndex("target", 1)()
