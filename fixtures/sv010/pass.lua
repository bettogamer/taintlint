-- expect: none
-- Return a non-secret answer instead of the raw value.
local function unitExists(unit)
  local guid = UnitGUID(unit)
  if guid then
    return true
  end
  return false
end
