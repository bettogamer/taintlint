-- expect: none
-- Identity restriction never applies to player/party/raid unit tokens.
local nameLen = #UnitName("player")
local other = #UnitName("raid7")
