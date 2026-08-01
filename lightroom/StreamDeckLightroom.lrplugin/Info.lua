return {
	LrSdkVersion = 11.0,
	LrSdkMinimumVersion = 6.0,
	LrToolkitIdentifier = "com.cursor.streamdeck-lightroom",
	LrPluginName = "Stream Deck Lightroom",
	LrPluginInfoUrl = "https://github.com/cursor/streamdeck-lightroom",
	LrInitPlugin = "InitPlugin.lua",
	LrForceInitPlugin = true,
	LrShutdownPlugin = "ShutdownPlugin.lua",
	LrShutdownApp = "ShutdownPlugin.lua",
	LrDisablePlugin = "DisablePlugin.lua",
	LrEnablePlugin = "InitPlugin.lua",
	VERSION = { major = 1, minor = 4, revision = 5, build = 1 },
	LrExportMenuItems = {
		{ title = "Stream Deck Bridge: Status", file = "Status.lua" },
	},
}
