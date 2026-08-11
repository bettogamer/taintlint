-- expect: none
-- type() accepts secrets; the call is an argument, not a comparison operand.
if type(UnitHealth("target")) == "number" then print("number-ish") end
-- Boolean test of a non-boolean secret is allowed.
if UnitName("target") then print("has name") end
-- SecretWhenUnitPossessionRestricted spares unit tokens under the player's direct control.
if UnitIsPossessed("player") == true then print("possessed") end
if UnitIsCharmed("pet") == false then print("free pet") end
