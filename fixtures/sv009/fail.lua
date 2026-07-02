-- expect: SV009=2
-- Code compiled at runtime executes under *** ForceTaint_Strong ***: EVERY
-- secretable API returns secrets there, ALWAYS, even out of combat.
local trigger = loadstring("return UnitHealth('player') / UnitHealthMax('player') < 0.3")
