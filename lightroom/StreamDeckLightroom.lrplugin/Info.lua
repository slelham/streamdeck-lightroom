return {
	LrSdkVersion = 11.0,
	LrSdkMinimumVersion = 6.0,
	LrToolkitIdentifier = "com.cursor.streamdeck-lightroom",
	LrPluginName = "Stream Deck Lightroom 1.3.1",
	LrPluginInfoUrl = "https://github.com/slelham/streamdeck-lightroom",
	LrInitPlugin = "InitPlugin.lua",
	LrForceInitPlugin = true,
	LrShutdownPlugin = "ShutdownPlugin.lua",
	LrShutdownApp = "ShutdownPlugin.lua",
	LrDisablePlugin = "DisablePlugin.lua",
	LrEnablePlugin = "InitPlugin.lua",
	VERSION = { major = 1, minor = 3, revision = 1, build = 0 },
	LrExportMenuItems = {
		{ title = "Stream Deck Bridge: Status", file = "Status.lua" },
	},
}
