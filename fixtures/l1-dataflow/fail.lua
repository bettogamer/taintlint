-- expect: SV001=1, SV002=1, SV005=1, SV003=1
-- L1: the secret travels through a local; every unguarded use downstream throws.
local hp = UnitHealth("target")
local pct = hp / 100
if hp > 0 then print("alive") end

local guid = UnitGUID("target")
local seen = {}
seen[guid] = true

-- Lua expands the last call: realm is UnitName's second return, also secretable.
local name, realm = UnitName("mouseover")
print("from " .. realm)
