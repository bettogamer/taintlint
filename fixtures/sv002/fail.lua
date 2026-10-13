-- expect: SV002=4
-- "attempt to compare a secret number value"
if UnitHealth("target") > 0 then print("alive") end
local dead = UnitHealth("target") == 0
-- Possession secrecy (12.1) only exempts units under the player's DIRECT control:
-- party/raid members are not exempt even though identity restrictions spare them.
if UnitIsCharmed("party1") == true then print("charmed") end
-- 12.1.5 table.count is secret when the subject table holds secret keys: a table that
-- is itself a (conditionally) secret value cannot be ruled out.
local aura = C_UnitAuras.GetAuraDataByIndex("target", 1)
if table.count(aura) > 0 then print("fields") end
