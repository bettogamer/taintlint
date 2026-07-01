-- expect: none
-- Group unit tokens are always player units: identity is never restricted.
local seen = {}
seen[UnitGUID("player")] = true
seen[UnitName("raid1")] = 1
seen[UnitName("party3")] = 2
