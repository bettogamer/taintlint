-- expect: none
-- string.format is explicitly allowed to receive secrets.
local label = string.format("HP: %d", UnitHealth("player"))
-- Concatenating non-secretable values is free.
local msg = "took " .. GetTime() .. "s"
