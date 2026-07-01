-- expect: SV002=2
-- "attempt to compare a secret number value"
if UnitHealth("target") > 0 then print("alive") end
local dead = UnitHealth("target") == 0
