-- expect: SV008=2
-- Boss-mod callbacks run as the external addon's callback: args can be secret
-- on 12.0.x. Operating them without a surgical guard throws mid-encounter.
local bars = {}
BigWigsLoader.RegisterMessage(myAddon, "BigWigs_StartBar", function(event, module, key, text, duration)
  local endTime = GetTime() + duration
  bars[text] = endTime
end)
