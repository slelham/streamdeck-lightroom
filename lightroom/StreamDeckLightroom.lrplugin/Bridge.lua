--[[
  Dual-port LrSocket bridge:
    RECEIVE_PORT  - Stream Deck -> Lightroom commands (JSON lines)
    SEND_PORT     - Lightroom -> Stream Deck state/events (JSON lines)
]]

local LrDialogs = import "LrDialogs"
local LrDevelopController = import "LrDevelopController"
local LrFunctionContext = import "LrFunctionContext"
local LrSocket = import "LrSocket"
local LrTasks = import "LrTasks"

local Actions = require "Actions"
local Config = require "Config"
local Json = require "Json"

local Bridge = {}

local function send(obj)
	if not (_G.SDLR and _G.SDLR.server and _G.SDLR.sendConnected) then
		return
	end
	local ok, payload = pcall(Json.encode, obj)
	if ok and payload then
		pcall(function()
			_G.SDLR.server:send(payload .. "\n")
		end)
	end
end

local function pushState()
	local ok, state = pcall(Actions.getState)
	if not ok or type(state) ~= "table" then
		return
	end
	state.type = "state"
	_G.SDLR.lastState = state
	send(state)
end

local function handleMessage(raw)
	if type(raw) ~= "string" then
		return
	end

	-- Support multiple newline-delimited messages in one chunk
	for line in string.gmatch(raw, "[^\r\n]+") do
		local msg = Json.decode(line)
		if type(msg) == "table" and msg.cmd then
			LrTasks.startAsyncTask(function()
				local ok, resultOrErr = Actions.handle(msg)
				local reply = {
					type = "ack",
					id = msg.id,
					ok = ok and true or false,
				}
				if ok then
					if type(resultOrErr) == "table" then
						reply.data = resultOrErr
					end
				else
					reply.error = tostring(resultOrErr or "failed")
				end
				send(reply)

				-- Always push fresh state after mutating commands
				if msg.cmd ~= "ping" then
					pushState()
				end
			end)
		end
	end
end

local function startSendSocket(context)
	_G.SDLR.server = LrSocket.bind {
		functionContext = context,
		plugin = _PLUGIN,
		port = Config.SEND_PORT,
		mode = "send",
		onConnected = function()
			_G.SDLR.sendConnected = true
			pushState()
		end,
		onClosed = function()
			_G.SDLR.sendConnected = false
		end,
		onError = function(socket, err)
			_G.SDLR.sendConnected = false
			if _G.SDLR.running and err == "timeout" then
				socket:reconnect()
			end
		end,
	}
end

local function startReceiveSocket(context)
	_G.SDLR.client = LrSocket.bind {
		functionContext = context,
		plugin = _PLUGIN,
		port = Config.RECEIVE_PORT,
		mode = "receive",
		onConnected = function()
			_G.SDLR.receiveConnected = true
		end,
		onClosed = function(socket)
			_G.SDLR.receiveConnected = false
			if _G.SDLR.running then
				socket:reconnect()
				if _G.SDLR.server then
					pcall(function()
						_G.SDLR.server:close()
					end)
				end
				startSendSocket(context)
			end
		end,
		onMessage = function(_, message)
			handleMessage(message)
		end,
		onError = function(socket, err)
			if err == "timeout" and _G.SDLR.running then
				socket:reconnect()
			end
		end,
	}
end

function Bridge.start()
	if _G.SDLR.running then
		return
	end
	_G.SDLR.running = true

	LrTasks.startAsyncTask(function()
		LrFunctionContext.callWithContext("sdlr_bridge", function(context)
			LrDialogs.attachErrorDialogToFunctionContext(context)

			startReceiveSocket(context)
			startSendSocket(context)

			-- Observer for live develop slider updates
			local observer = {}
			local lastPush = 0
			pcall(function()
				LrDevelopController.revealAdjustedControls(true)
				LrDevelopController.addAdjustmentChangeObserver(context, observer, function(obs)
					if not _G.SDLR.sendConnected then
						return
					end
					local now = os.clock()
					if now - lastPush < 0.08 then
						return
					end
					lastPush = now
					pushState()
				end)
			end)

			while _G.SDLR.running do
				-- Periodic heartbeat/state so Stream Deck recovers after photo changes
				if _G.SDLR.sendConnected then
					pushState()
				end
				LrTasks.sleep(1.0)
			end

			if _G.SDLR.client then
				pcall(function()
					_G.SDLR.client:close()
				end)
			end
			if _G.SDLR.server then
				pcall(function()
					_G.SDLR.server:close()
				end)
			end
		end)
	end)
end

function Bridge.stop()
	_G.SDLR.running = false
end

Bridge.send = send
Bridge.pushState = pushState

return Bridge
