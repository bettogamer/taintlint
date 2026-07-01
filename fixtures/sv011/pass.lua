-- expect: none
-- The MRT-style shim: safe on every client.
local issecretvalue = issecretvalue or function() return false end
local issecrettable = issecrettable or function() return false end
