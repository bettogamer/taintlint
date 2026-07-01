-- expect: none
-- type() accepts secrets; the call is an argument, not a comparison operand.
if type(UnitHealth("target")) == "number" then print("number-ish") end
-- Boolean test of a non-boolean secret is allowed.
if UnitName("target") then print("has name") end
