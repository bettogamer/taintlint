-- expect: none
-- Calling the result of a non-secretable getter is fine.
local cb = GetTime
cb()
