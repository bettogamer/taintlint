-- expect: SV003=2
-- "attempt to concatenate a secret number value"
local label = "HP: " .. UnitHealth("player")
local text = tostring(UnitHealth("player"))
