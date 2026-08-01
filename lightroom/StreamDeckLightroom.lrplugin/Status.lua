local LrDialogs = import "LrDialogs"
local LrTasks = import "LrTasks"
local Config = require "Config"
local Library = require "Library"

-- Menu items run outside a task; getAllPhotos/findPhotos must yield inside one.
LrTasks.startAsyncTask(function()
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
	local scopeLine = string.format(
		"\nScope: %s\nSource: %s\nPhotos in source: %s",
		tostring(counts.scope or "?"),
		tostring(counts.sourceName or "?"),
		tostring(counts.photoCount or "?")
	)

	LrDialogs.message(
		"Stream Deck Lightroom Bridge",
		string.format(
			"Plugin version: %s\n\nRunning: %s\nReceive port (commands): %d\nSend port (state): %d\nReceive connected: %s\nSend connected: %s\n\nFlagged (picks): %s\nRejects: %s\nCount method: %s%s%s\n\nConnection key icon should show v%s.\nFlag counts are for the folder/collection you have selected in Library — not the whole catalog (unless that is your source).",
			version,
			tostring(running),
			Config.RECEIVE_PORT,
			Config.SEND_PORT,
			tostring(recv),
			tostring(send),
			tostring(counts.pick or "?"),
			tostring(counts.reject or "?"),
			tostring(counts.method or "?"),
			scopeLine,
			errLine,
			version
		)
	)
end)
