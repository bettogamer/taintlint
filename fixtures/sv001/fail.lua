-- expect: SV001=3
-- Arithmetic on a secretable call throws in tainted code:
-- "attempt to perform arithmetic on a secret number value"
local pct = UnitHealth("target") / 100
local off = 5 + UnitHealth("target")
local neg = -UnitHealth("player")
