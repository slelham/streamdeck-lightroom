--[[
  Library view filters and catalog counts (labels, flags).
]]

local LrApplication = import "LrApplication"
local LrApplicationView = import "LrApplicationView"
local LrTasks = import "LrTasks"

local Library = {}

local LABEL_KEYS = {
	red = "label1",
	yellow = "label2",
	green = "label3",
	blue = "label4",
	purple = "label5",
}

local countCache = {
	fetchedAt = 0,
	ttl = 3,
	pick = 0,
	reject = 0,
	lastError = nil,
	method = nil,
}

local function catalog()
	return LrApplication.activeCatalog()
end

--- Yield-safe pcall (Lua pcall around getAllPhotos causes "We can only wait from within a task")
local function taskPcall(fn)
	if LrTasks and LrTasks.pcall then
		return LrTasks.pcall(fn)
	end
	return pcall(fn)
end

local function ensureLibrary()
	local mod
	pcall(function()
		mod = LrApplicationView.getCurrentModuleName()
	end)
	if mod ~= "library" then
		pcall(function()
			LrApplicationView.switchToModule("library")
		end)
		if LrTasks.canYield and LrTasks.canYield() then
			LrTasks.sleep(0.15)
		end
	end
end

function Library.getViewFilter()
	local cat = catalog()
	if not cat then
		return nil
	end
	local ok, filter = pcall(function()
		return cat:getCurrentViewFilter()
	end)
	if ok then
		return filter
	end
	return nil
end

local function blankLabelFilter()
	return {
		filtersActive = true,
		columnBrowserActive = false,
		searchStringActive = false,
		label1 = false,
		label2 = false,
		label3 = false,
		label4 = false,
		label5 = false,
		customLabel = false,
		nolabel = false,
		minRating = 0,
		ratingOp = ">=",
		pick = "",
		whichCopies = "masterImages,virtualCopies,videos",
		searchOp = "all",
		searchString = "",
		searchTarget = "all",
	}
end

function Library.setLabelFilter(labels, opts)
	opts = opts or {}
	ensureLibrary()
	local cat = catalog()
	if not cat then
		return false, "no catalog"
	end

	local filter = blankLabelFilter()
	local current = Library.getViewFilter()
	if type(current) == "table" then
		filter.whichCopies = current.whichCopies or filter.whichCopies
		if opts.keepPick and current.pick then
			filter.pick = current.pick
		end
	end

	local any = false
	if type(labels) == "table" then
		for _, name in ipairs(labels) do
			local key = LABEL_KEYS[string.lower(tostring(name))]
			if key then
				filter[key] = true
				any = true
			end
		end
	end

	filter.filtersActive = any and true or false

	local ok, changed = pcall(function()
		return cat:setViewFilter(filter)
	end)
	if not ok then
		return false, tostring(changed)
	end
	return true, {
		active = any,
		labels = labels,
		changed = changed,
		filter = Library.summarizeFilter(Library.getViewFilter()),
	}
end

function Library.clearAttributeFilter()
	ensureLibrary()
	local cat = catalog()
	if not cat then
		return false, "no catalog"
	end
	local filter = blankLabelFilter()
	filter.filtersActive = false
	filter.pick = ""
	local ok, err = pcall(function()
		cat:setViewFilter(filter)
	end)
	if not ok then
		return false, tostring(err)
	end
	return true, { active = false, filter = Library.summarizeFilter(Library.getViewFilter()) }
end

function Library.setPickFilter(pickMode, opts)
	opts = opts or {}
	ensureLibrary()
	local cat = catalog()
	if not cat then
		return false, "no catalog"
	end

	local filter = Library.getViewFilter() or blankLabelFilter()
	if type(filter) ~= "table" then
		filter = blankLabelFilter()
	end

	if pickMode and pickMode ~= "" and pickMode ~= "none" then
		filter.filtersActive = true
		filter.pick = pickMode
	else
		filter.pick = ""
		local labelsOn = filter.label1 or filter.label2 or filter.label3 or filter.label4 or filter.label5 or filter.nolabel or filter.customLabel
		if not labelsOn then
			filter.filtersActive = false
		end
	end

	local ok, err = pcall(function()
		cat:setViewFilter(filter)
	end)
	if not ok then
		return false, tostring(err)
	end
	return true, { pick = filter.pick, filter = Library.summarizeFilter(Library.getViewFilter()) }
end

function Library.summarizeFilter(filter)
	if type(filter) ~= "table" then
		return { active = false, labels = {}, pick = "" }
	end
	local labels = {}
	for name, key in pairs(LABEL_KEYS) do
		if filter[key] then
			labels[#labels + 1] = name
		end
	end
	table.sort(labels)
	return {
		active = filter.filtersActive and true or false,
		labels = labels,
		pick = filter.pick or "",
		green = filter.label3 and true or false,
		blue = filter.label4 and true or false,
	}
end

local function countTable(photos)
	if type(photos) ~= "table" then
		return 0
	end
	local n = 0
	for _ in ipairs(photos) do
		n = n + 1
	end
	if n == 0 then
		n = #photos
	end
	return n
end

--- Smart-collection style searchDesc. Keep criteria simple (no value2 for ==).
local function countByFindPhotos(value)
	local cat = catalog()
	if not cat then
		return nil, "no catalog"
	end

	local attempts = {
		-- Canonical SDK form
		{
			criteria = "pick",
			operation = "==",
			value = value,
		},
		-- Combined form some Lr builds prefer
		{
			combine = "intersect",
			{
				criteria = "pick",
				operation = "==",
				value = value,
			},
		},
	}

	local lastErr = nil
	for _, desc in ipairs(attempts) do
		local ok, photos = taskPcall(function()
			return cat:findPhotos { searchDesc = desc }
		end)
		if ok and type(photos) == "table" then
			local n = countTable(photos)
			-- Empty can be a real zero OR a bad descriptor; caller may scan as fallback
			return n, nil
		end
		lastErr = tostring(photos)
	end
	return nil, lastErr or "findPhotos failed"
end

--- Reliable fallback: scan catalog pickStatus (must allow yield via LrTasks.pcall).
local function countByScan()
	local cat = catalog()
	if not cat then
		return nil, nil, "no catalog"
	end

	local ok, photos = taskPcall(function()
		return cat:getAllPhotos()
	end)
	if not ok or type(photos) ~= "table" then
		return nil, nil, "getAllPhotos failed: " .. tostring(photos)
	end

	local pick = 0
	local reject = 0

	-- Prefer bulk metadata when available (much faster on large catalogs)
	local bulkOk, bulk = pcall(function()
		if cat.batchGetRawMetadata then
			return cat:batchGetRawMetadata(photos, { "pickStatus" })
		end
		return nil
	end)
	if bulkOk and type(bulk) == "table" then
		for _, photo in ipairs(photos) do
			local row = bulk[photo]
			local status = 0
			if type(row) == "table" then
				status = tonumber(row.pickStatus) or 0
			end
			if status == 1 then
				pick = pick + 1
			elseif status == -1 then
				reject = reject + 1
			end
		end
		return pick, reject, nil
	end

	for _, photo in ipairs(photos) do
		local status = 0
		pcall(function()
			status = tonumber(photo:getRawMetadata("pickStatus")) or 0
		end)
		if status == 1 then
			pick = pick + 1
		elseif status == -1 then
			reject = reject + 1
		end
	end
	return pick, reject, nil
end

function Library.getFlagCounts(force)
	local now = os.time()
	if not force and countCache.fetchedAt > 0 and (now - countCache.fetchedAt) < countCache.ttl then
		return {
			pick = countCache.pick,
			reject = countCache.reject,
			totalFlagged = countCache.pick,
			cached = true,
			error = countCache.lastError,
			method = countCache.method,
		}
	end

	local pick, pickErr = countByFindPhotos(1)
	local reject, rejectErr = countByFindPhotos(-1)
	local method = "findPhotos"
	local err = pickErr or rejectErr

	-- findPhotos often returns {} with a bad searchDesc instead of erroring — always try scan when zeros/nil
	local needScan = (pick == nil and reject == nil) or ((pick or 0) == 0 and (reject or 0) == 0)
	if needScan then
		local sp, sr, sErr = countByScan()
		if sp ~= nil then
			if pick == nil or reject == nil or sp > (pick or 0) or sr > (reject or 0) or ((pick or 0) == 0 and (reject or 0) == 0 and (sp > 0 or sr > 0)) then
				pick = sp
				reject = sr
				method = "scan"
				err = nil
			end
		else
			-- Keep findPhotos numbers if any; surface scan error
			err = sErr or err
			if pick == nil then
				pick = 0
			end
			if reject == nil then
				reject = 0
			end
		end
	end

	if pick == nil then
		pick = countCache.pick or 0
	end
	if reject == nil then
		reject = countCache.reject or 0
	end

	countCache.pick = pick
	countCache.reject = reject
	countCache.fetchedAt = now
	countCache.lastError = err
	countCache.method = method

	return {
		pick = pick,
		reject = reject,
		totalFlagged = pick,
		cached = false,
		error = err,
		method = method,
	}
end

function Library.invalidateCounts()
	countCache.fetchedAt = 0
end

return Library
