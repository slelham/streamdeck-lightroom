--[[
  Develop preset listing, browser state, and apply helpers.
]]

local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrTasks = import "LrTasks"

local Presets = {}

local browser = {
	folderIndex = 1,
	pageIndex = 1,
	pageSize = 8,
	lastFolderName = nil,
}

local cache = {
	folders = nil,
	fetchedAt = 0,
	ttl = 5, -- seconds
}

local function scanFolders()
	local folders = {}
	local ok, result = pcall(function()
		return LrApplication.developPresetFolders()
	end)
	if not ok or type(result) ~= "table" then
		return folders
	end
	for _, fold in pairs(result) do
		local nameOk, name = pcall(function()
			return fold:getName()
		end)
		local presets = {}
		local presetsOk, presetList = pcall(function()
			return fold:getDevelopPresets()
		end)
		if presetsOk and type(presetList) == "table" then
			for _, pst in pairs(presetList) do
				local nOk, pName = pcall(function()
					return pst:getName()
				end)
				local uOk, uuid = pcall(function()
					return pst:getUuid()
				end)
				if nOk and uOk and pName and uuid then
					presets[#presets + 1] = {
						name = pName,
						uuid = uuid,
					}
				end
			end
		end
		table.sort(presets, function(a, b)
			return string.lower(a.name) < string.lower(b.name)
		end)
		folders[#folders + 1] = {
			name = nameOk and name or "Folder",
			presets = presets,
		}
	end
	table.sort(folders, function(a, b)
		return string.lower(a.name) < string.lower(b.name)
	end)
	return folders
end

local function getFolders(force)
	local now = os.clock()
	if force or cache.folders == nil or (now - cache.fetchedAt) > cache.ttl then
		cache.folders = scanFolders()
		cache.fetchedAt = now
	end
	return cache.folders
end

function Presets.listAll()
	return getFolders(true)
end

function Presets.getBrowserState(pageSize)
	if type(pageSize) == "number" and pageSize > 0 then
		browser.pageSize = math.floor(pageSize)
	end

	local folders = getFolders()
	if #folders == 0 then
		return {
			folderCount = 0,
			folderIndex = 1,
			folderName = "(no presets)",
			pageIndex = 1,
			pageCount = 1,
			pageSize = browser.pageSize,
			slots = {},
			folders = {},
		}
	end

	if browser.folderIndex < 1 then
		browser.folderIndex = 1
	end
	if browser.folderIndex > #folders then
		browser.folderIndex = #folders
	end

	local folder = folders[browser.folderIndex]
	local presets = folder.presets or {}
	local pageCount = math.max(1, math.ceil(#presets / browser.pageSize))
	if browser.pageIndex < 1 then
		browser.pageIndex = 1
	end
	if browser.pageIndex > pageCount then
		browser.pageIndex = pageCount
	end

	local startIdx = (browser.pageIndex - 1) * browser.pageSize + 1
	local slots = {}
	for i = 1, browser.pageSize do
		local pst = presets[startIdx + i - 1]
		if pst then
			slots[i] = {
				index = i,
				name = pst.name,
				uuid = pst.uuid,
				empty = false,
			}
		else
			slots[i] = {
				index = i,
				name = "—",
				uuid = nil,
				empty = true,
			}
		end
	end

	browser.lastFolderName = folder.name

	return {
		folderCount = #folders,
		folderIndex = browser.folderIndex,
		folderName = folder.name,
		presetCount = #presets,
		pageIndex = browser.pageIndex,
		pageCount = pageCount,
		pageSize = browser.pageSize,
		slots = slots,
	}
end

function Presets.browserCommand(action, opts)
	opts = opts or {}
	local pageSize = opts.pageSize
	local folders = getFolders()

	if action == "refresh" then
		getFolders(true)
	elseif action == "nextFolder" then
		if #folders > 0 then
			browser.folderIndex = browser.folderIndex + 1
			if browser.folderIndex > #folders then
				browser.folderIndex = 1
			end
			browser.pageIndex = 1
		end
	elseif action == "prevFolder" then
		if #folders > 0 then
			browser.folderIndex = browser.folderIndex - 1
			if browser.folderIndex < 1 then
				browser.folderIndex = #folders
			end
			browser.pageIndex = 1
		end
	elseif action == "setFolder" then
		local idx = tonumber(opts.folderIndex)
		if idx and idx >= 1 and idx <= #folders then
			browser.folderIndex = idx
			browser.pageIndex = 1
		elseif type(opts.folderName) == "string" then
			for i, f in ipairs(folders) do
				if f.name == opts.folderName then
					browser.folderIndex = i
					browser.pageIndex = 1
					break
				end
			end
		end
	elseif action == "nextPage" then
		browser.pageIndex = browser.pageIndex + 1
	elseif action == "prevPage" then
		browser.pageIndex = browser.pageIndex - 1
	elseif action == "setPage" then
		local idx = tonumber(opts.pageIndex)
		if idx then
			browser.pageIndex = idx
		end
	end

	return Presets.getBrowserState(pageSize)
end

function Presets.applyUuid(uuid)
	if type(uuid) ~= "string" or uuid == "" then
		return false, "missing uuid"
	end

	local catalog = LrApplication.activeCatalog()
	if not catalog then
		return false, "no catalog"
	end
	local photo = catalog:getTargetPhoto()
	if not photo then
		return false, "no photo selected"
	end

	local okPreset, preset = pcall(function()
		return LrApplication.developPresetByUuid(uuid)
	end)
	if not okPreset or preset == nil then
		return false, "preset not found"
	end

	local nameOk, presetName = pcall(function()
		return preset:getName()
	end)
	local label = nameOk and presetName or "preset"

	-- asynchronous write; caller is already inside LrTasks.startAsyncTask
	catalog:withWriteAccessDo("Apply preset " .. label, function()
		photo:applyDevelopPreset(preset)
		pcall(function()
			LrDialogs.showBezel(label, 1.2)
		end)
	end, {
		timeout = 5,
		asynchronous = true,
		callback = function()
			LrDialogs.showError("Could not apply preset (catalog busy).")
		end,
	})

	return true, { name = label, uuid = uuid }
end

function Presets.applySlot(slotIndex, pageSize)
	local state = Presets.getBrowserState(pageSize)
	local slot = state.slots[tonumber(slotIndex) or -1]
	if not slot or slot.empty or not slot.uuid then
		return false, "empty slot"
	end
	return Presets.applyUuid(slot.uuid)
end

return Presets
