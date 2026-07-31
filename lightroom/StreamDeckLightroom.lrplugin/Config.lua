--[[
  Shared runtime config / globals for the Stream Deck bridge.
]]

local Config = {
	-- Distinct from MIDI2LR defaults (58763/58764)
	RECEIVE_PORT = 59837,
	SEND_PORT = 59838,
	BASIC_PARAMS = {
		"Temperature",
		"Tint",
		"Exposure",
		"Contrast",
		"Highlights",
		"Shadows",
		"Whites",
		"Blacks",
		"Texture",
		"Clarity",
		"Dehaze",
		"Vibrance",
		"Saturation",
	},
}

-- Plugin-wide mutable state (kept in _G so Init/Shutdown can share it)
_G.SDLR = _G.SDLR or {
	running = false,
	sendConnected = false,
	receiveConnected = false,
	server = nil,
	client = nil,
	lastState = nil,
}

return Config
