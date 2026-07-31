local Bridge = require "Bridge"

-- Runs for LrShutdownPlugin / disable-style unload.
Bridge.stop()

-- Required shape for LrShutdownApp.
return {
	LrShutdownFunction = function(doneFunction, progressFunction)
		progressFunction(0.5, "Stopping Stream Deck bridge…")
		Bridge.stop()
		progressFunction(1, "Stopped")
		doneFunction()
	end,
}
