-- expect: SV010=1
-- Returning a raw secretable value moves the hazard to every caller.
local function guidOf(unit)
  return UnitGUID(unit)
end
