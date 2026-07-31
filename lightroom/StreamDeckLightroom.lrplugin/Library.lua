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
	ttl = 4,
	pick = 0,
	reject = 0,
	unflagged = nil,
}

local function catalog()
	return LrApplication.activeCatalog()
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
		LrTasks.sleep(0.15)
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

--- labels: array of color names, e.g. { "blue", "green" }
function Library.setLabelFilter(labels, opts)
	opts = opts or {}
	ensureLibrary()
	local cat = catalog()
	if not cat then
		return false, "no catalog"
	end

	local filter = blankLabelFilter()
	-- Preserve some existing filter bits if available
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

	if not any then
		-- Clear attribute label filter
		filter.filtersActive = false
	else
		filter.filtersActive = true
	end

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

--- pickMode: "flagged" | "rejected" | "unflagged" | "" (clear pick part)
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
		-- If no labels active either, turn filters off
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

local function countByPick(value)
	local cat = catalog()
	if not cat then
		return 0
	end
	local ok, photos = pcall(function()
		return cat:findPhotos {
			searchDesc = {
				criteria = "pick",
				operation = "==",
				value = value,
			},
		}
	end)
	if ok and type(photos) == "table" then
		return #photos
	end
	return 0
end

function Library.getFlagCounts(force)
	local now = os.clock()
	if not force and countCache.fetchedAt > 0 and (now - countCache.fetchedAt) < countCache.ttl then
		return {
			pick = countCache.pick,
			reject = countCache.reject,
			totalFlagged = countCache.pick, -- picks only; reject separate
			cached = true,
		}
	end

	local pick = countByPick(1)
	local reject = countByPick(-1)
	countCache.pick = pick
	countCache.reject = reject
	countCache.fetchedAt = now

	return {
		pick = pick,
		reject = reject,
		totalFlagged = pick,
		cached = false,
	}
end

function Library.invalidateCounts()
	countCache.fetchedAt = 0
end

return Library
