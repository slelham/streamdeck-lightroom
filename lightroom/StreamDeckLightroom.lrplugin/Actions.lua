--[[
  Command handlers executed inside Lightroom Classic.
]]

local LrApplication = import "LrApplication"
local LrApplicationView = import "LrApplicationView"
local LrDevelopController = import "LrDevelopController"
local LrSelection = import "LrSelection"
local LrUndo = import "LrUndo"
local LrTasks = import "LrTasks"

local Config = require "Config"
local Library = require "Library"
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

local function targetPhoto()
	local catalog = LrApplication.activeCatalog()
	if not catalog then
		return nil, nil, "no catalog"
	end
	local photo = catalog:getTargetPhoto()
	if not photo then
		return nil, catalog, "no photo selected"
	end
	return photo, catalog, nil
end

--- JSON / PI may send true, "true", or 1
local function wantAdvance(v)
	return v == true or v == 1 or v == "true" or v == "1"
end

local function advancePhoto()
	-- Brief yield so flag/rating write settles before filmstrip moves
	LrTasks.sleep(0.12)
	LrSelection.nextPhoto()
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

		local okCounts, counts = pcall(function()
			return Library.getFlagCounts(false)
		end)
		if okCounts and type(counts) == "table" then
			state.flagCounts = counts
		end

		local okFilter, filter = pcall(function()
			return Library.summarizeFilter(Library.getViewFilter())
		end)
		if okFilter and type(filter) == "table" then
			state.viewFilter = filter
		end
	else
		if _G.SDLR and _G.SDLR.lastState then
			state.presetBrowser = _G.SDLR.lastState.presetBrowser
			state.flagCounts = _G.SDLR.lastState.flagCounts
			state.viewFilter = _G.SDLR.lastState.viewFilter
		end
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
		if wantAdvance(msg.advance) then
			advancePhoto()
		end
		return true
	end

	if cmd == "increaseRating" then
		LrSelection.increaseRating()
		if wantAdvance(msg.advance) then
			advancePhoto()
		end
		return true
	end

	if cmd == "decreaseRating" then
		LrSelection.decreaseRating()
		if wantAdvance(msg.advance) then
			advancePhoto()
		end
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
		Library.invalidateCounts()
		-- Advance in the same task (separate nextPhoto races and can no-op)
		if wantAdvance(msg.advance) and (flag == "pick" or flag == "reject") then
			advancePhoto()
		end
		return true
	end

	if cmd == "label" then
		local label = msg.label or "none"
		LrSelection.setColorLabel(label)
		if wantAdvance(msg.advance) and label ~= "none" then
			advancePhoto()
		end
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

	if cmd == "selectObjects" then
		return Actions.handle({ cmd = "createMask", maskType = "aiSelection", subtype = "objects" })
	end

	if cmd == "selectLandscape" then
		return Actions.handle({ cmd = "createMask", maskType = "aiSelection", subtype = "landscape" })
	end

	if cmd == "maskBrush" then
		return Actions.handle({ cmd = "createMask", maskType = "brush" })
	end

	if cmd == "maskLinear" then
		return Actions.handle({ cmd = "createMask", maskType = "gradient" })
	end

	if cmd == "maskRadial" then
		return Actions.handle({ cmd = "createMask", maskType = "radialGradient" })
	end

	if cmd == "maskRangeColor" then
		return Actions.handle({ cmd = "createMask", maskType = "rangeMask", subtype = "color" })
	end

	if cmd == "maskRangeLuminance" then
		return Actions.handle({ cmd = "createMask", maskType = "rangeMask", subtype = "luminance" })
	end

	if cmd == "maskRangeDepth" then
		return Actions.handle({ cmd = "createMask", maskType = "rangeMask", subtype = "depth" })
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

	-- Sync develop settings from the most-selected photo to the rest of the selection
	if cmd == "syncSettings" then
		ensureDevelop()
		local photo, catalog, err = targetPhoto()
		if err then
			return false, err
		end
		local settings
		local okRead = pcall(function()
			settings = photo:getDevelopSettings()
		end)
		if not okRead or type(settings) ~= "table" then
			return false, "cannot read develop settings"
		end
		local selected = catalog:getTargetPhotos() or { photo }
		local applied = 0
		local okWrite, writeErr = pcall(function()
			catalog:withWriteAccessDo("Sync settings", function()
				for _, p in ipairs(selected) do
					if p ~= photo then
						p:applyDevelopSettings(settings)
						applied = applied + 1
					end
				end
			end, { timeout = 8 })
		end)
		if not okWrite then
			return false, tostring(writeErr)
		end
		return true, { applied = applied }
	end

	if cmd == "autoWhiteBalance" then
		ensureDevelop()
		local ok = safeCall(function()
			LrDevelopController.setAutoWhiteBalance()
		end)
		return ok
	end

	if cmd == "showClipping" then
		ensureDevelop()
		local ok = safeCall(function()
			LrDevelopController.showClipping()
		end)
		return ok
	end

	if cmd == "convertToGrayscale" or cmd == "toggleGrayscale" then
		ensureDevelop()
		local photo, catalog, err = targetPhoto()
		if err then
			return false, err
		end
		local settings
		local okRead = pcall(function()
			settings = photo:getDevelopSettings()
		end)
		if not okRead or type(settings) ~= "table" then
			return false, "cannot read develop settings"
		end
		local nextVal = true
		if cmd == "toggleGrayscale" then
			nextVal = not settings.ConvertToGrayscale
		elseif msg.value == false or msg.value == 0 or msg.value == "false" then
			nextVal = false
		end
		settings.ConvertToGrayscale = nextVal
		local okWrite, writeErr = pcall(function()
			catalog:withWriteAccessDo("B&W", function()
				photo:applyDevelopSettings(settings)
			end, { timeout = 5 })
		end)
		if not okWrite then
			return false, tostring(writeErr)
		end
		return true, { ConvertToGrayscale = nextVal }
	end

	-- AI Enhance: denoise | rawDetails | superRes (Lightroom Classic 15.3+)
	if cmd == "setEnhance" or cmd == "aiEnhance" then
		ensureDevelop()
		local param = msg.param or msg.enhance or "denoise"
		local value = msg.value
		if value == nil then
			value = true
		end
		if value == "false" or value == 0 then
			value = false
		elseif value == "true" or value == 1 then
			value = true
		end
		local denoiseAmount = tonumber(msg.denoiseAmount or msg.amount)
		local ok = safeCall(function()
			if denoiseAmount ~= nil then
				LrDevelopController.setEnhance(param, value, denoiseAmount)
			else
				LrDevelopController.setEnhance(param, value)
			end
		end)
		return ok
	end

	if cmd == "createSnapshot" then
		ensureDevelop()
		local photo, catalog, err = targetPhoto()
		if err then
			return false, err
		end
		local name = msg.name
		if type(name) ~= "string" or name == "" then
			name = os.date("SD %Y-%m-%d %H:%M:%S")
		end
		local ok = safeCall(function()
			catalog:withWriteAccessDo("Create snapshot", function()
				photo:createDevelopSnapshot(name, false)
			end, { timeout = 5 })
		end)
		return ok, { name = name }
	end

	if cmd == "applySnapshot" then
		ensureDevelop()
		local photo, catalog, err = targetPhoto()
		if err then
			return false, err
		end
		local snaps
		local okList = pcall(function()
			snaps = photo:getDevelopSnapshots()
		end)
		if not okList or type(snaps) ~= "table" or #snaps == 0 then
			return false, "no snapshots"
		end
		local target = snaps[#snaps]
		if type(msg.name) == "string" and msg.name ~= "" then
			for _, s in ipairs(snaps) do
				local n
				pcall(function()
					n = s.name or (s.getName and s:getName())
				end)
				if n == msg.name then
					target = s
					break
				end
			end
		elseif msg.index ~= nil then
			local idx = tonumber(msg.index)
			if idx and snaps[idx] then
				target = snaps[idx]
			end
		end
		local id = target
		if type(target) == "table" then
			id = target.id or target
		end
		local ok = safeCall(function()
			catalog:withWriteAccessDo("Apply snapshot", function()
				photo:applyDevelopSnapshot(id)
			end, { timeout = 5 })
		end)
		return ok
	end

	if cmd == "listSnapshots" then
		local photo, _, err = targetPhoto()
		if err then
			return false, err
		end
		local snaps = {}
		pcall(function()
			local list = photo:getDevelopSnapshots() or {}
			for i, s in ipairs(list) do
				local name
				pcall(function()
					name = s.name or (s.getName and s:getName()) or ("Snapshot " .. i)
				end)
				snaps[#snaps + 1] = { index = i, name = name or ("Snapshot " .. i) }
			end
		end)
		return true, { snapshots = snaps }
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

	if cmd == "setLabelFilter" then
		local labels = msg.labels
		if type(labels) == "string" then
			-- "blue,green" or "blue-green"
			local list = {}
			for part in string.gmatch(labels, "[^,;%-%s]+") do
				list[#list + 1] = part
			end
			labels = list
		end
		if type(labels) ~= "table" then
			return false, "missing labels"
		end
		return Library.setLabelFilter(labels, { keepPick = msg.keepPick })
	end

	if cmd == "clearLabelFilter" or cmd == "clearViewFilter" then
		return Library.clearAttributeFilter()
	end

	if cmd == "toggleLabelFilter" then
		local labels = msg.labels
		if type(labels) == "string" then
			local list = {}
			for part in string.gmatch(labels, "[^,;%-%s]+") do
				list[#list + 1] = part
			end
			labels = list
		end
		if type(labels) ~= "table" or #labels == 0 then
			labels = { "blue", "green" }
		end
		local summary = Library.summarizeFilter(Library.getViewFilter())
		local already = summary.active
		if already then
			-- If currently filtering exactly these labels (order-insensitive), clear; else apply
			local wanted = {}
			for _, n in ipairs(labels) do
				wanted[string.lower(n)] = true
			end
			local current = {}
			for _, n in ipairs(summary.labels or {}) do
				current[string.lower(n)] = true
			end
			local same = true
			local countWanted = 0
			for k, _ in pairs(wanted) do
				countWanted = countWanted + 1
				if not current[k] then
					same = false
					break
				end
			end
			local countCurrent = 0
			for _ in pairs(current) do
				countCurrent = countCurrent + 1
			end
			if same and countWanted == countCurrent and (summary.pick or "") == "" then
				return Library.clearAttributeFilter()
			end
		end
		return Library.setLabelFilter(labels, { keepPick = false })
	end

	if cmd == "setPickFilter" then
		return Library.setPickFilter(msg.pick or "flagged")
	end

	if cmd == "getFlagCounts" then
		Library.invalidateCounts()
		-- Nest under flagCounts so Stream Deck never confuses this with
		-- setPickFilter's pick = "flagged" string field.
		return true, { flagCounts = Library.getFlagCounts(true) }
	end

	return false, "unknown cmd: " .. tostring(cmd)
end

return Actions
