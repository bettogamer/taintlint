-- expect: none
-- Storing a secret is allowed; L0 does not follow locals (L1 will).
local hp = UnitHealth("target")
if issecretvalue and issecretvalue(hp) then hp = 0 end
local pct = hp / 100
-- Non-secretable APIs are free.
local elapsed = GetTime() / 100
