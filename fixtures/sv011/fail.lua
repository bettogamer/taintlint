-- expect: SV011=1
-- Without a fallback this is nil on pre-12.0 clients and calling it throws.
local issecretvalue = issecretvalue
