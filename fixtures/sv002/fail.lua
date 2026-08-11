-- expect: SV002=3
-- "attempt to compare a secret number value"
if UnitHealth("target") > 0 then print("alive") end
local dead = UnitHealth("target") == 0
-- Possession secrecy (12.1) only exempts units under the player's DIRECT control:
-- party/raid members are not exempt even though identity restrictions spare them.
if UnitIsCharmed("party1") == true then print("charmed") end
