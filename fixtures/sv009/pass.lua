-- expect: none
-- No secretable API inside the compiled chunk.
local f = loadstring("return 1 + 1")
-- Dynamic strings are out of scope (documented false negative).
local userCode = SomeDB.customTrigger
local g = loadstring(userCode)
