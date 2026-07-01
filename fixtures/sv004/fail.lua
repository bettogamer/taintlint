-- expect: SV004=1
-- "attempt to get length of a secret value" — target is not a guaranteed-safe unit.
local nameLen = #UnitName("target")
