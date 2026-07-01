-- expect: SV005=2
-- "attempt to store a secret value as a table key"
local seen = {}
seen[UnitGUID("target")] = true
local cache = { [UnitName("focus")] = 1 }
