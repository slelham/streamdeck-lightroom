--[[
  Command handlers executed inside Lightroom Classic.
]]

local LrApplicationView = import "LrApplicationView"
local LrDevelopController = import "LrDevelopController"
local LrSelection = import "LrSelection"
local LrUndo = import "LrUndo"
local LrTasks = import "LrTasks"

local Config = require "Config"
local Presets = require "Presets"

local Actions = {}

local basicParamSet = {}
for _, p in ipairs(Config.BASIC_PARAMS) do
	basicParamSet[p] = true
end

local function safeCall(fn)
	local ok, result = pcall(fn)
	if ok then
		return true, result
	end
	return false, tostring(result)
end

local function ensureDevelop()
	local mod
	pcall(function()
		mod = LrApplicationView.getCurrentModuleName()
	end)
	if mod ~= "develop" then
		local ok = pcall(function()
			LrApplicationView.switchToModule("develop")
		end)
		if ok then
			LrTasks.sleep(0.2)
		end
	end
end

function Actions.getState(opts)
	opts = opts or {}
	local state = {
		module = nil,
		rating = 0,
		flag = 0,
		label = "none",
		params = {},
	}

	pcall(function()
		state.module = LrApplicationView.getCurrentModuleName()
	end)
	pcall(function()
		state.rating = LrSelection.getRating() or 0
	end)
	pcall(function()
		state.flag = LrSelection.getFlag() or 0
	end)
	pcall(function()
		state.label = LrSelection.getColorLabel() or "none"
	end)

	if state.module == "develop" then
		for _, param in ipairs(Config.BASIC_PARAMS) do
			local ok, value = pcall(LrDevelopController.getValue, param)
			if ok and type(value) == "number" then
				state.params[param] = value
			end
		end
		local okTool, tool = pcall(LrDevelopController.getSelectedTool)
		if okTool then
			state.tool = tool
		end
	end

	if not opts.light then
		local okBrowser, browser = pcall(function()
			return Presets.getBrowserState()
		end)
		if okBrowser and type(browser) == "table" then
			-- Keep heartbeat payloads smaller: omit full folder index list
			browser.folders = nil
			state.presetBrowser = browser
		end
	elseif _G.SDLR and _G.SDLR.lastState and _G.SDLR.lastState.presetBrowser then
		-- Preserve last browser snapshot on light updates
		state.presetBrowser = _G.SDLR.lastState.presetBrowser
	end

	return state
end

function Actions.handle(msg)
	local cmd = msg.cmd
	if not cmd then
		return false, "missing cmd"
	end

	if cmd == "ping" then
		return true, { pong = true }
	end

	if cmd == "getState" then
		return true, Actions.getState()
	end

	if cmd == "setRating" then
		local rating = tonumber(msg.rating) or 0
		if rating < 0 then rating = 0 end
		if rating > 5 then rating = 5 end
		LrSelection.setRating(rating)
		return true
	end

	if cmd == "increaseRating" then
		LrSelection.increaseRating()
		return true
	end

	if cmd == "decreaseRating" then
		LrSelection.decreaseRating()
		return true
	end

	if cmd == "flag" then
		local flag = msg.flag
		if flag == "pick" then
			LrSelection.flagAsPick()
		elseif flag == "reject" then
			LrSelection.flagAsReject()
		else
			LrSelection.removeFlag()
		end
		return true
	end

	if cmd == "label" then
		local label = msg.label or "none"
		LrSelection.setColorLabel(label)
		return true
	end

	if cmd == "nextPhoto" then
		LrSelection.nextPhoto()
		return true
	end

	if cmd == "previousPhoto" then
		LrSelection.previousPhoto()
		return true
	end

	if cmd == "undo" then
		if LrUndo.canUndo() then
			LrUndo.undo()
		end
		return true
	end

	if cmd == "redo" then
		if LrUndo.canRedo() then
			LrUndo.redo()
		end
		return true
	end

	if cmd == "showModule" then
		local module = msg.module or "develop"
		LrApplicationView.switchToModule(module)
		return true
	end

	if cmd == "showView" then
		local view = msg.view or "loupe"
		local map = {
			loupe = "loupe",
			grid = "grid",
			compare = "compare",
			survey = "survey",
			people = "people",
			develop_loupe = "develop_loupe",
			develop_before_after_horiz = "develop_before_after_horiz",
			develop_before_after_vert = "develop_before_after_vert",
			develop_before = "develop_before",
			develop_reference_view = "reference",
		}
		local target = map[view] or view
		local ok = safeCall(function()
			LrApplicationView.showView(target)
		end)
		return ok
	end

	if cmd == "zoomToggle" then
		LrApplicationView.toggleZoom()
		return true
	end

	if cmd == "zoomOneToOne" then
		LrApplicationView.zoomToOneToOne()
		return true
	end

	if cmd == "autoTone" then
		ensureDevelop()
		local ok = safeCall(function()
			LrDevelopController.setAutoTone()
		end)
		return ok
	end

	if cmd == "resetAll" then
		ensureDevelop()
		LrDevelopController.resetAllDevelopAdjustments()
		return true
	end

	if cmd == "resetParam" then
		local param = msg.param
		if not param then
			return false, "missing param"
		end
		ensureDevelop()
		LrDevelopController.resetToDefault(param)
		return true
	end

	if cmd == "increment" or cmd == "decrement" then
		local param = msg.param
		if not param then
			return false, "missing param"
		end
		ensureDevelop()
		if cmd == "increment" then
			LrDevelopController.increment(param)
		else
			LrDevelopController.decrement(param)
		end
		return true
	end

	if cmd == "nudge" then
		local param = msg.param
		local delta = tonumber(msg.delta)
		if not param or not delta then
			return false, "missing param/delta"
		end
		ensureDevelop()
		local ok, current = pcall(LrDevelopController.getValue, param)
		if not ok or type(current) ~= "number" then
			return false, "cannot read " .. tostring(param)
		end
		local nextValue = current + delta
		local minV, maxV
		local rangeOk = pcall(function()
			minV, maxV = LrDevelopController.getRange(param)
		end)
		if rangeOk and type(minV) == "number" and type(maxV) == "number" then
			if nextValue < minV then nextValue = minV end
			if nextValue > maxV then nextValue = maxV end
		end
		LrDevelopController.setValue(param, nextValue)
		return true, { param = param, value = nextValue }
	end

	if cmd == "setParam" then
		local param = msg.param
		local value = tonumber(msg.value)
		if not param or value == nil then
			return false, "missing param/value"
		end
		ensureDevelop()
		LrDevelopController.setValue(param, value)
		return true
	end

	if cmd == "startTracking" then
		local param = msg.param
		if not param then
			return false, "missing param"
		end
		ensureDevelop()
		LrDevelopController.startTracking(param)
		return true
	end

	if cmd == "stopTracking" then
		safeCall(function()
			LrDevelopController.stopTracking()
		end)
		return true
	end

	if cmd == "selectTool" then
		local tool = msg.tool or "loupe"
		ensureDevelop()
		LrDevelopController.selectTool(tool)
		return true
	end

	if cmd == "editInPhotoshop" then
		ensureDevelop()
		safeCall(function()
			LrDevelopController.editInPhotoshop()
		end)
		return true
	end

	if cmd == "createMask" then
		local maskType = msg.maskType or "aiSelection"
		local subtype = msg.subtype
		ensureDevelop()
		local ok = safeCall(function()
			LrDevelopController.goToMasking()
			if subtype then
				LrDevelopController.createNewMask(maskType, subtype)
			else
				LrDevelopController.createNewMask(maskType)
			end
		end)
		return ok
	end

	if cmd == "selectSubject" then
		return Actions.handle({ cmd = "createMask", maskType = "aiSelection", subtype = "subject" })
	end

	if cmd == "selectSky" then
		return Actions.handle({ cmd = "createMask", maskType = "aiSelection", subtype = "sky" })
	end

	if cmd == "selectBackground" then
		return Actions.handle({ cmd = "createMask", maskType = "aiSelection", subtype = "background" })
	end

	if cmd == "selectPeople" then
		return Actions.handle({ cmd = "createMask", maskType = "aiSelection", subtype = "people" })
	end

	if cmd == "copySettings" then
		ensureDevelop()
		local ok = safeCall(function()
			LrDevelopController.copySettings()
		end)
		return ok
	end

	if cmd == "pasteSettings" then
		ensureDevelop()
		local ok = safeCall(function()
			LrDevelopController.pasteSettings()
		end)
		return ok
	end

	if cmd == "listPresets" then
		local folders = Presets.listAll()
		return true, { folders = folders }
	end

	if cmd == "presetBrowser" then
		local browser = Presets.browserCommand(msg.action or "refresh", {
			pageSize = tonumber(msg.pageSize),
			folderIndex = tonumber(msg.folderIndex),
			folderName = msg.folderName,
			pageIndex = tonumber(msg.pageIndex),
		})
		return true, browser
	end

	if cmd == "applyPreset" then
		ensureDevelop()
		if msg.uuid then
			return Presets.applyUuid(msg.uuid)
		end
		if msg.slot then
			return Presets.applySlot(msg.slot, tonumber(msg.pageSize))
		end
		return false, "missing uuid or slot"
	end

	return false, "unknown cmd: " .. tostring(cmd)
end

return Actions
