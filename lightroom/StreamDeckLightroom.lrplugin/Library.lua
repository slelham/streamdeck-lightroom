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
	ttl = 2,
	fp = "",
	pick = 0,
	reject = 0,
	lastError = nil,
	method = nil,
	scope = nil,
	sourceName = nil,
	photoCount = nil,
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

local function countPickReject(photos)
	local pick, reject = 0, 0
	if type(photos) ~= "table" then
		return 0, 0
	end
	local cat = catalog()
	local bulkOk, bulk = pcall(function()
		if cat and cat.batchGetRawMetadata then
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
		return pick, reject
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
	return pick, reject
end

local function sourceLabel(source)
	if type(source) == "string" then
		return source
	end
	local name
	pcall(function()
		name = source:getName()
	end)
	if (not name or name == "") and source.getPath then
		pcall(function()
			name = source:getPath()
		end)
	end
	return name or "source"
end

local function appendPhotos(dest, seen, list)
	if type(list) ~= "table" then
		return
	end
	for _, photo in ipairs(list) do
		if photo ~= nil and not seen[photo] then
			seen[photo] = true
			dest[#dest + 1] = photo
		end
	end
end

--- Recurse collection sets into child collections.
local function collectFromCollectionSet(set, dest, seen, depth)
	if depth > 24 or set == nil then
		return
	end
	local kids
	pcall(function()
		kids = set:getChildCollections()
	end)
	if type(kids) == "table" then
		for _, col in ipairs(kids) do
			local ok, photos = taskPcall(function()
				return col:getPhotos()
			end)
			if ok then
				appendPhotos(dest, seen, photos)
			end
		end
	end
	local nested
	pcall(function()
		nested = set:getChildCollectionSets()
	end)
	if type(nested) == "table" then
		for _, child in ipairs(nested) do
			collectFromCollectionSet(child, dest, seen, depth + 1)
		end
	end
end

local function photosFromSource(source, dest, seen)
	if source == nil then
		return "empty"
	end
	if type(source) == "string" then
		-- Catalog specials: All Photographs / Quick Collection / etc.
		local cat = catalog()
		if not cat then
			return "catalog"
		end
		local ok, photos = taskPcall(function()
			return cat:getAllPhotos()
		end)
		if ok then
			appendPhotos(dest, seen, photos)
		end
		return "catalog"
	end

	-- Folder: include subfolders (matches typical Library “show photos in subfolders”)
	local okFolder, folderPhotos = taskPcall(function()
		return source:getPhotos(true)
	end)
	if okFolder and type(folderPhotos) == "table" then
		appendPhotos(dest, seen, folderPhotos)
		return "folder"
	end

	-- Collection / published collection
	local okCol, colPhotos = taskPcall(function()
		return source:getPhotos()
	end)
	if okCol and type(colPhotos) == "table" then
		appendPhotos(dest, seen, colPhotos)
		return "collection"
	end

	-- Collection set
	local before = #dest
	collectFromCollectionSet(source, dest, seen, 0)
	if #dest > before then
		return "collectionSet"
	end

	return "unknown"
end

local function activeSourceFingerprint()
	local cat = catalog()
	if not cat then
		return ""
	end
	local ok, sources = pcall(function()
		return cat:getActiveSources()
	end)
	if not ok or type(sources) ~= "table" then
		return ""
	end
	local parts = {}
	for _, source in ipairs(sources) do
		parts[#parts + 1] = sourceLabel(source)
	end
	return table.concat(parts, " + ")
end

--- Count flags in the Library source you’re viewing (folder / collection), not whole catalog.
local function countByActiveSources()
	local cat = catalog()
	if not cat then
		return nil, nil, { error = "no catalog" }
	end

	local ok, sources = taskPcall(function()
		return cat:getActiveSources()
	end)
	if not ok or type(sources) ~= "table" or #sources == 0 then
		return nil, nil, { error = "no active sources: " .. tostring(sources) }
	end

	local photos = {}
	local seen = {}
	local scopes = {}
	local names = {}
	local wholeCatalog = false

	for _, source in ipairs(sources) do
		names[#names + 1] = sourceLabel(source)
		local scope = photosFromSource(source, photos, seen)
		scopes[scope] = true
		if scope == "catalog" then
			wholeCatalog = true
		end
	end

	local pick, reject = countPickReject(photos)
	local scope = "activeSource"
	if scopes.folder and not scopes.collection and not scopes.collectionSet then
		scope = "folder"
	elseif scopes.collection and not scopes.folder then
		scope = "collection"
	elseif wholeCatalog then
		scope = "catalog"
	end

	return pick, reject, {
		scope = scope,
		sourceName = table.concat(names, " + "),
		photoCount = #photos,
		wholeCatalog = wholeCatalog,
	}
end

function Library.getFlagCounts(force)
	local now = os.time()
	local fp = activeSourceFingerprint()
	if not force and countCache.fetchedAt > 0 and countCache.fp == fp and (now - countCache.fetchedAt) < countCache.ttl then
		return {
			pick = countCache.pick,
			reject = countCache.reject,
			totalFlagged = countCache.pick,
			cached = true,
			error = countCache.lastError,
			method = countCache.method,
			scope = countCache.scope,
			sourceName = countCache.sourceName,
			photoCount = countCache.photoCount,
		}
	end

	local pick, reject, meta = countByActiveSources()
	local method = "activeSource"
	local err = nil
	meta = meta or {}

	if pick == nil then
		-- Last resort only when we cannot resolve the current Library source
		err = meta.error or "active source count failed"
		local ok, photos = taskPcall(function()
			return catalog():getAllPhotos()
		end)
		if ok and type(photos) == "table" then
			pick, reject = countPickReject(photos)
			method = "catalogFallback"
			meta.scope = "catalog"
			meta.sourceName = meta.sourceName or "All Photographs"
			meta.photoCount = #photos
			err = (err or "") .. " (fell back to catalog)"
		else
			pick = countCache.pick or 0
			reject = countCache.reject or 0
			method = "cache"
		end
	else
		method = meta.scope or "activeSource"
		err = nil
	end

	countCache.pick = pick
	countCache.reject = reject
	countCache.fetchedAt = now
	countCache.fp = fp
	countCache.lastError = err
	countCache.method = method
	countCache.scope = meta.scope
	countCache.sourceName = meta.sourceName
	countCache.photoCount = meta.photoCount

	return {
		pick = pick,
		reject = reject,
		totalFlagged = pick,
		cached = false,
		error = err,
		method = method,
		scope = meta.scope,
		sourceName = meta.sourceName,
		photoCount = meta.photoCount,
	}
end

function Library.invalidateCounts()
	countCache.fetchedAt = 0
	countCache.fp = ""
end

return Library
