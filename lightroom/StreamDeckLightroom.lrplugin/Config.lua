--[[
  Shared runtime config / globals for the Stream Deck bridge.
]]

local Config = {
	-- Keep in sync with streamdeck/package.json + manifest Version
	VERSION_STRING = "1.4.1",
	-- Distinct from MIDI2LR defaults (58763/58764)
	RECEIVE_PORT = 59837,
	SEND_PORT = 59838,
	-- Params mirrored into state.params for live key/dial feedback
	BASIC_PARAMS = {
		-- Basic
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
		-- Tone Curve (parametric)
		"ParametricDarks",
		"ParametricLights",
		"ParametricShadows",
		"ParametricHighlights",
		"ParametricShadowSplit",
		"ParametricMidtoneSplit",
		"ParametricHighlightSplit",
		-- Color Grading / Split Toning
		"SplitToningShadowHue",
		"SplitToningShadowSaturation",
		"ColorGradeShadowLum",
		"SplitToningHighlightHue",
		"SplitToningHighlightSaturation",
		"ColorGradeHighlightLum",
		"ColorGradeMidtoneHue",
		"ColorGradeMidtoneSat",
		"ColorGradeMidtoneLum",
		"ColorGradeGlobalHue",
		"ColorGradeGlobalSat",
		"ColorGradeGlobalLum",
		"SplitToningBalance",
		"ColorGradeBlending",
		-- Detail (common dial targets)
		"Sharpness",
		"LuminanceSmoothing",
		"ColorNoiseReduction",
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
