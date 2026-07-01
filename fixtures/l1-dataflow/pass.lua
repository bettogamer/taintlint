-- expect: none
-- Guarded with issecretvalue: handled, no report (coarse whole-function guard).
local hp = UnitHealth("target")
if issecretvalue and issecretvalue(hp) then hp = 0 end
local pct = hp / 100

-- Reassignment kills the taint before use.
local power = UnitPower("focus", 0)
power = 0
local ok = power / 5

-- Aliased value: guarding the alias clears the original too (same value).
local guid = UnitGUID("target")
local guid2 = guid
if issecretvalue(guid2) then guid = nil end
local t = {}
t[guid] = true

-- Shadowing: the inner 'name' is a fresh, safe local.
local name = UnitName("boss1")
do
  local name = "safe"
  print(name .. "!")
end

-- Function parameters shadow outer taints.
local realm = UnitName("mouseover")
local function fmt(realm)
  return "r: " .. realm
end
