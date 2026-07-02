-- expect: none
-- The surgical guard from the field: check ONLY the args you operate on, and
-- degrade that timer instead of discarding the whole event.
local bars = {}
BigWigsLoaderX.RegisterMessage(myAddon, "BigWigs_StartBar", function(event, module, key, text, duration)
  if issecretvalue(duration) or issecretvalue(text) then return end
  local endTime = GetTime() + duration
  bars[text] = endTime
end)
-- The event name (first arg) is never secret: comparing it must not be flagged.
DBMWrap.RegisterCallback(myAddon, "DBM_TimerStart", function(event, id)
  if event == "DBM_TimerStart" then
    print("timer")
  end
end)
