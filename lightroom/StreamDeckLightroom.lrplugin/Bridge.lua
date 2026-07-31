--[[
  Dual-port LrSocket bridge:
    RECEIVE_PORT  - Stream Deck -> Lightroom commands (JSON lines)
    SEND_PORT     - Lightroom -> Stream Deck state/events (JSON lines)

  Notes from MIDI2LR / Adobe community:
  - Do not reconnect from onError while a client is connected
  - LrSocket timeout with no client is normal idle behavior
  - onMessage must dispatch work via LrTasks.startAsyncTask
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

-- opts.light = skip heavy preset browser (heartbeats / slider scrubbing)
local function pushState(opts)
	opts = opts or {}
	local ok, state = pcall(function()
		return Actions.getState({ light = opts.light })
	end)
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

	for line in string.gmatch(raw, "[^\r\n]+") do
		local msg = Json.decode(line)
		if type(msg) == "table" and msg.cmd then
			LrTasks.startAsyncTask(function()
				-- pcall only keeps the first return value, so capture both inside
				local handledOk, resultOrErr
				local callOk, err = pcall(function()
					handledOk, resultOrErr = Actions.handle(msg)
				end)
				if not callOk then
					handledOk = false
					resultOrErr = tostring(err)
				else
					handledOk = handledOk and true or false
				end

				local reply = {
					type = "ack",
					id = msg.id,
					ok = handledOk,
				}
				if handledOk then
					if type(resultOrErr) == "table" then
						reply.data = resultOrErr
					end
				else
					reply.error = tostring(resultOrErr or "failed")
				end
				send(reply)

				-- Skip full refresh for chatty/read-only commands
				if msg.cmd ~= "ping" and msg.cmd ~= "listPresets" and msg.cmd ~= "getState" then
					pushState({ light = false })
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
			pushState({ light = false })
		end,
		onClosed = function()
			_G.SDLR.sendConnected = false
		end,
		onError = function(socket, err)
			if err == "timeout" and _G.SDLR.running and not _G.SDLR.sendConnected then
				pcall(function()
					socket:reconnect()
				end)
			elseif err ~= "timeout" then
				_G.SDLR.sendConnected = false
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
			if not _G.SDLR.running then
				return
			end
			LrTasks.startAsyncTask(function()
				LrTasks.sleep(0.2)
				if not _G.SDLR.running then
					return
				end
				pcall(function()
					socket:reconnect()
				end)
				if _G.SDLR.server then
					pcall(function()
						_G.SDLR.server:close()
					end)
				end
				_G.SDLR.sendConnected = false
				startSendSocket(context)
			end)
		end,
		onMessage = function(_, message)
			handleMessage(message)
		end,
		onError = function(socket, err)
			if err == "timeout" and _G.SDLR.running and not _G.SDLR.receiveConnected then
				pcall(function()
					socket:reconnect()
				end)
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
			pcall(function()
				LrDialogs.attachErrorDialogToFunctionContext(context)
			end)

			startReceiveSocket(context)
			startSendSocket(context)

			local observer = {}
			local lastPush = 0
			pcall(function()
				LrDevelopController.revealAdjustedControls(true)
				LrDevelopController.addAdjustmentChangeObserver(context, observer, function()
					if not _G.SDLR.sendConnected then
						return
					end
					local now = os.clock()
					if now - lastPush < 0.1 then
						return
					end
					lastPush = now
					pushState({ light = true })
				end)
			end)

			local tick = 0
			while _G.SDLR.running do
				if _G.SDLR.sendConnected then
					tick = tick + 1
					-- Heartbeat every 1s (light); include preset browser every 5s
					pushState({ light = (tick % 5) ~= 0 })
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
			_G.SDLR.receiveConnected = false
			_G.SDLR.sendConnected = false
		end)
	end)
end

function Bridge.stop()
	_G.SDLR.running = false
end

Bridge.send = send
Bridge.pushState = pushState

return Bridge
