const { app, screen, BrowserWindow, Menu, globalShortcut, Tray, ipcMain, powerMonitor } = require("electron")
const pathModule = require("path")
const autoLaunch = require("auto-launch")
const { autoUpdater } = require("electron-updater")
require("electron-reloader")(module) // $#_DEV_#$
const { ReadFile, SaveFile } = require("./util.js")

const DEFAULT_SETTINGS = {
	ALWAYS_AWAKE: false,
	CONSUME_MEDIA_KEYS: false,
	LOAD_AT_STARTUP: true,
	POWER_OFF_AT_SHUTDOWN: false,
	SCAN_TIME: 30000,
	SHOW_WINDOW_WHEN_CHANGE: true
}
/**
 * @type {BSVC.SETTINGS}
 */
const SETTINGS = readAppSettings()

const appAutoLauncher = new autoLaunch({
	name: "Beoplay S3 Volume Control",
	path: app.getPath("exe")
})
SETTINGS.LOAD_AT_STARTUP ? appAutoLauncher.enable() : appAutoLauncher.disable()


/** @type {BrowserWindow} */
let mainWindow
/** @type {Tray} */
let trayObj

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
	app.quit()
} else {
	app.on("second-instance", () => {
		// Someone tried to run a second instance, we should focus our window.
		if (mainWindow) {
			if (mainWindow.isMinimized())
				mainWindow.restore()
			mainWindow.focus()
		}
	})
	// start the app
	app.on("ready", startApp)
}
let previousTime = 0
/**
 * @type {Array<string>}
 */
let connectedDevices = []
/** @type {BrowserWindow} */
let settingsWindow
/** @type {string} */
let connectingDevice = null
let rescanRequested = false
let consecutiveFails = 0
/** @type {NodeJS.Timeout} */
let visibilityTimeout

/**
 * Workaround for flicker effect on transparent windows
 * @see https://github.com/electron/electron/issues/12130
 */
app.commandLine.appendSwitch("wm-window-animations-disabled")
app.commandLine.appendSwitch("enable-experimental-web-platform-features")

if (process.platform == "win32") {
	app.commandLine.appendSwitch("high-dpi-support", "1")
} else if (process.platform == "darwin") {
	/**
	 * This is here because on mac document windows are falsely considered occluded and 
	 * aren't rendered at all. We may want to find alternative as this can be process 
	 * intensive
	 */
	app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")
}

function startApp() {
	app.setName("Beoplay S3 Volume Control")
	mainWindow = createMainWindow()
	settingsWindow = createSettingsWindow()
	Menu.setApplicationMenu(null)
	trayObj = new Tray(pathModule.join(__dirname, "../../assets/s3.png"))
	trayObj.setToolTip("Volume Control")
	handleEvents()
	autoUpdater.checkForUpdatesAndNotify()
}

/**
 * @returns {BrowserWindow}
 */
function createMainWindow() {
	const mainWindow = new BrowserWindow({
		webPreferences: {
			preload: pathModule.join(__dirname, "preload.js"),
			additionalArguments: [
				JSON.stringify({ "version_string": app.getVersion() }),
			]
		},
		width: 100,
		maxWidth: 100,
		height: 300,
		maxHeight: 300,
		show: false,
		frame: false,
		title: "Beoplay S3 Volume Control",
		acceptFirstMouse: true,
		skipTaskbar: true,
		alwaysOnTop: true,
		resizable: false
	})
	mainWindow.loadFile(pathModule.join(__dirname, "../web-app/view/app.html"))
	mainWindow.webContents.openDevTools({ mode: "undocked" }) // $#_DEV_#$

	return mainWindow
}

/**
 * @returns {BrowserWindow}
 */
function createSettingsWindow() {
	const settingsWindow = new BrowserWindow({
		webPreferences: {
			preload: pathModule.join(__dirname, "preload.js"),
			additionalArguments: [
				JSON.stringify({ "version_string": app.getVersion() }),
			]
		},
		width: 640,
		height: 640,
		show: false,
		title: "Beoplay S3 Volume Control Settings",
		acceptFirstMouse: true,
		resizable: true,
		frame: false,
		skipTaskbar: true,
		closable: false
	})
	settingsWindow.loadFile(pathModule.join(__dirname, "../web-app/view/settings.html"))
	settingsWindow.webContents.openDevTools() // $#_DEV_#$
	return settingsWindow
}

function handleEvents() {
	mainWindow.webContents.on("did-finish-load", () => {
		mainWindow.webContents.executeJavaScript("startDiscovery()", true)
	})
	//comment this while development.
	mainWindow.on("blur", () => mainWindow.hide())
	settingsWindow.on("blur", () => settingsWindow.hide())
	mainWindow.webContents.on("select-bluetooth-device", (event, deviceList, callback) => {
		event.preventDefault()
		const nowTime = new Date().getTime()
		console.log("elapsed time", (nowTime - previousTime))
		if (((new Date().getTime() - previousTime) > SETTINGS.SCAN_TIME) || rescanRequested) {
			console.log("times Up")
			callback("")
			return
		}
		console.log("Device list:", deviceList)
		if (deviceList.length) {
			const deviceToConnect = deviceList.find(device => {
				return !(connectedDevices.indexOf(device.deviceId) + 1) && connectingDevice != device.deviceId
			})
			if (deviceToConnect) {
				connectingDevice = deviceToConnect.deviceId
				mainWindow.webContents.send("connectingSpeaker", deviceToConnect.deviceName, deviceToConnect.deviceId)
				callback(deviceToConnect.deviceId)
			}
		}
	})

	trayObj.addListener("click", () => {
		positionTrayWindow()
		mainWindow.show()
	})
	ipcMain.on("startDiscovery", (event) => {
		previousTime = new Date().getTime()
		connectedDevices.length = 0
		connectingDevice = null
		event.returnValue = 1
		rescanRequested = false
		mainWindow.webContents.executeJavaScript("connectSpeaker()", true)
	})
	ipcMain.on("speakerConnected", (event) => {
		connectedDevices.push(connectingDevice)
		mainWindow.webContents.executeJavaScript("connectSpeaker()", true)
		consecutiveFails = 0
		event.returnValue = 1
	})
	ipcMain.on("speakerConnectionFailed", (event) => {
		connectingDevice = null
		consecutiveFails++
		if (((new Date().getTime()) - previousTime < SETTINGS.SCAN_TIME) &&
			consecutiveFails < 25) {
			setTimeout(() => {
				mainWindow.webContents.executeJavaScript("connectSpeaker()", true)
			}, 1000)
		}
		event.returnValue = 1
	})

	ipcMain.on("openDevConsole", (event, value) => {
		value ? mainWindow.webContents.openDevTools({
			mode: "undocked"
		}) : mainWindow.webContents.closeDevTools()
	})

	ipcMain.on("openSettingsWindow", () => settingsWindow.show())
	ipcMain.on("getSettings", (event) => { event.returnValue = SETTINGS })
	ipcMain.on("quitApp", () => {
		settingsWindow.destroy()
		trayObj.destroy()
		app.quit()
	})
	ipcMain.on("rescan", requestRescan)
	ipcMain.on("updateSettings", updateSettings)
	ipcMain.on("writeConsoleMessage", (ev, msg) => {
		settingsWindow.webContents.send("writeConsoleMessage", msg)
	})
	if (process.platform == "win32") {
		// doesn't work
		mainWindow.on("session-end", checkAndPowerOffSpeakers)
	} else {
		powerMonitor.on("shutdown", checkAndPowerOffSpeakers)
		powerMonitor.on("resume", requestRescan)
	}
	ipcMain.on("speakerDisconnected", (event, index) => {
		connectedDevices.splice(index, 1)
		event.returnValue = index
	})

	if (SETTINGS.CONSUME_MEDIA_KEYS) {
		globalShortcut.register("VolumeUp", function() {
			makeBrieflyVisible()
			mainWindow.webContents.send("volumeUp")
		})
		globalShortcut.register("VolumeDown", function() {
			makeBrieflyVisible()
			mainWindow.webContents.send("volumeDown")
		})
	}
}

function makeBrieflyVisible() {
	if (!SETTINGS.SHOW_WINDOW_WHEN_CHANGE) {
		console.log("not showing")
		return
	}

	if (visibilityTimeout || !mainWindow.isVisible()) {
		if (visibilityTimeout)
			clearTimeout(visibilityTimeout)
		else {
			positionTrayWindow()
			mainWindow.showInactive()
		}
		visibilityTimeout = setTimeout(() => {
			mainWindow.hide()
			visibilityTimeout = null
		}, 700)
	}
}

function positionTrayWindow() {
	const bounds = trayObj.getBounds()
	const currentScreen = screen.getPrimaryDisplay()
	const xPos = Math.max(0, Math.min(currentScreen.bounds.width - 100, bounds.x))
	const yPos = Math.max(0, Math.min(currentScreen.bounds.height - 300, bounds.y - 300))
	mainWindow.setPosition(xPos, yPos)
}

function requestRescan() {
	if (!rescanRequested)
		mainWindow.webContents.send("rescan")
	rescanRequested = true
}

/**
 * 
 * @param {Event} ev 
 * @param {BSVC.SETTINGS} settings 
 */
function updateSettings(ev, settings) {
	for (let key in settings)
		SETTINGS[key] = settings[key]
	if (SETTINGS.ALWAYS_AWAKE)
		appAutoLauncher.enable()
	else
		appAutoLauncher.disable()
	SaveFile(pathModule.join(app.getPath("userData"), "a"), JSON.stringify(SETTINGS, null, 2))
}

/**
 * @returns {BSVC.SETTINGS}
 */
function readAppSettings() {
	const storedSettingsString = ReadFile(pathModule.join(app.getPath("userData"), "a"))
	const defaultSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
	try {
		const storedSettings = JSON.parse(storedSettingsString)
		const parsedSettings = Object.assign({}, defaultSettings)
		for (let key in DEFAULT_SETTINGS) {
			if (Object.prototype.hasOwnProperty.call(storedSettings, key)) {
				parsedSettings[key] = storedSettings[key]
			}
		}
		return parsedSettings
	} catch (e) {
		return defaultSettings
	}
}

function checkAndPowerOffSpeakers() {
	if (SETTINGS.POWER_OFF_AT_SHUTDOWN) {
		console.log("shutting down the speakers")
		mainWindow.webContents.send("powerOffSpeakers")
	}
}