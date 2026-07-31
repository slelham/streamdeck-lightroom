--[[
  Minimal JSON encode/decode for Lightroom's Lua 5.1 sandbox.
  Supports objects, arrays, strings, numbers, booleans, and null.
]]

local Json = {}

local function escape_str(s)
	s = string.gsub(s, "\\", "\\\\")
	s = string.gsub(s, '"', '\\"')
	s = string.gsub(s, "\n", "\\n")
	s = string.gsub(s, "\r", "\\r")
	s = string.gsub(s, "\t", "\\t")
	return s
end

function Json.encode(val)
	local t = type(val)
	if val == nil then
		return "null"
	elseif t == "boolean" then
		return val and "true" or "false"
	elseif t == "number" then
		if val ~= val or val == math.huge or val == -math.huge then
			return "null"
		end
		return string.format("%.10g", val)
	elseif t == "string" then
		return '"' .. escape_str(val) .. '"'
	elseif t == "table" then
		local isArray = true
		local n = 0
		for k, _ in pairs(val) do
			if type(k) ~= "number" then
				isArray = false
				break
			end
			if k > n then
				n = k
			end
		end
		if isArray then
			local parts = {}
			for i = 1, n do
				parts[i] = Json.encode(val[i])
			end
			return "[" .. table.concat(parts, ",") .. "]"
		else
			local parts = {}
			for k, v in pairs(val) do
				if type(k) == "string" then
					parts[#parts + 1] = '"' .. escape_str(k) .. '":' .. Json.encode(v)
				end
			end
			return "{" .. table.concat(parts, ",") .. "}"
		end
	end
	return "null"
end

local function skip_ws(s, i)
	local _, j = string.find(s, "^[ \t\n\r]*", i)
	return (j or i - 1) + 1
end

local function parse_string(s, i)
	i = i + 1
	local out = {}
	while i <= #s do
		local c = string.sub(s, i, i)
		if c == '"' then
			return table.concat(out), i + 1
		elseif c == "\\" then
			local n = string.sub(s, i + 1, i + 1)
			if n == "n" then
				out[#out + 1] = "\n"
			elseif n == "r" then
				out[#out + 1] = "\r"
			elseif n == "t" then
				out[#out + 1] = "\t"
			elseif n == '"' or n == "\\" or n == "/" then
				out[#out + 1] = n
			else
				out[#out + 1] = n
			end
			i = i + 2
		else
			out[#out + 1] = c
			i = i + 1
		end
	end
	error("unterminated string")
end

local parse_value

local function parse_object(s, i)
	i = skip_ws(s, i + 1)
	local obj = {}
	if string.sub(s, i, i) == "}" then
		return obj, i + 1
	end
	while true do
		i = skip_ws(s, i)
		if string.sub(s, i, i) ~= '"' then
			error("expected string key")
		end
		local key
		key, i = parse_string(s, i)
		i = skip_ws(s, i)
		if string.sub(s, i, i) ~= ":" then
			error("expected colon")
		end
		i = skip_ws(s, i + 1)
		local val
		val, i = parse_value(s, i)
		obj[key] = val
		i = skip_ws(s, i)
		local c = string.sub(s, i, i)
		if c == "}" then
			return obj, i + 1
		elseif c == "," then
			i = i + 1
		else
			error("expected comma or }")
		end
	end
end

local function parse_array(s, i)
	i = skip_ws(s, i + 1)
	local arr = {}
	if string.sub(s, i, i) == "]" then
		return arr, i + 1
	end
	local idx = 1
	while true do
		local val
		val, i = parse_value(s, i)
		arr[idx] = val
		idx = idx + 1
		i = skip_ws(s, i)
		local c = string.sub(s, i, i)
		if c == "]" then
			return arr, i + 1
		elseif c == "," then
			i = i + 1
		else
			error("expected comma or ]")
		end
	end
end

parse_value = function(s, i)
	i = skip_ws(s, i)
	local c = string.sub(s, i, i)
	if c == '"' then
		return parse_string(s, i)
	elseif c == "{" then
		return parse_object(s, i)
	elseif c == "[" then
		return parse_array(s, i)
	elseif string.sub(s, i, i + 3) == "true" then
		return true, i + 4
	elseif string.sub(s, i, i + 4) == "false" then
		return false, i + 5
	elseif string.sub(s, i, i + 3) == "null" then
		return nil, i + 4
	else
		local num = string.match(s, "^-?%d+%.?%d*[eE]?[+-]?%d*", i)
		if not num then
			error("invalid json at " .. tostring(i))
		end
		return tonumber(num), i + #num
	end
end

function Json.decode(s)
	if type(s) ~= "string" then
		return nil
	end
	local ok, val = pcall(function()
		local v, i = parse_value(s, 1)
		return v
	end)
	if ok then
		return val
	end
	return nil
end

return Json
