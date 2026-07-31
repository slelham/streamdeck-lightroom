local LrDialogs = import "LrDialogs"
local Config = require "Config"

local running = _G.SDLR and _G.SDLR.running
local send = _G.SDLR and _G.SDLR.sendConnected
local recv = _G.SDLR and _G.SDLR.receiveConnected

LrDialogs.message(
	"Stream Deck Lightroom Bridge",
	string.format(
		"Running: %s\nReceive port (commands): %d\nSend port (state): %d\nReceive connected: %s\nSend connected: %s\n\nEnable this plug-in, then launch the Stream Deck plugin.",
		tostring(running),
		Config.RECEIVE_PORT,
		Config.SEND_PORT,
		tostring(recv),
		tostring(send)
	)
)
