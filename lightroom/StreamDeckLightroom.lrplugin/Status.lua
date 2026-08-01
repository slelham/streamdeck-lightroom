local LrDialogs = import "LrDialogs"
local Config = require "Config"
local Library = require "Library"

local running = _G.SDLR and _G.SDLR.running
local send = _G.SDLR and _G.SDLR.sendConnected
local recv = _G.SDLR and _G.SDLR.receiveConnected
local version = Config.VERSION_STRING or "?.?.?"

Library.invalidateCounts()
local counts = Library.getFlagCounts(true) or {}
local errLine = ""
if counts.error then
	errLine = "\nCount note: " .. tostring(counts.error)
end

LrDialogs.message(
	"Stream Deck Lightroom Bridge",
	string.format(
		"Plugin version: %s\n\nRunning: %s\nReceive port (commands): %d\nSend port (state): %d\nReceive connected: %s\nSend connected: %s\n\nFlagged (picks): %s\nRejects: %s\nCount method: %s%s\n\nConnection key icon should show v1.4.0.",
		version,
		tostring(running),
		Config.RECEIVE_PORT,
		Config.SEND_PORT,
		tostring(recv),
		tostring(send),
		tostring(counts.pick or "?"),
		tostring(counts.reject or "?"),
		tostring(counts.method or "?"),
		errLine
	)
)
