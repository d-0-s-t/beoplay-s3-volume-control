import { PROFILES } from "./profiles.js"

/** @type {HTMLInputElement} */
let volumeControlInput
/** @type {BSVC.PROFILE} */
let currentProfile
/**@type {BluetoothRemoteGATTService[]} */
const speakerServices = []
const writingStates = {
	volume: /** @type {BSVC.WritingState[]} */ ([]),
	power: /** @type {BSVC.WritingState[]} */ ([]),
	wake: /** @type {BSVC.WritingState[]} */ ([])
}
let connectionInProgress = false
let powerState = 1

let audioContext = new window.AudioContext()

function start() {
	currentProfile = PROFILES[0]
	setDom()
	setBindings()
	setPowerState()
}

function setDom() {
	setVolumeRangeControl()
}

function onResize() {
	setVolumeRangeControl()
}

function setVolumeRangeControl() {
	volumeControlInput = /** @type {HTMLInputElement} */ (document.getElementById("volumeInput"))
	volumeControlInput.style.width = volumeControlInput.parentElement.clientHeight + "px"
	volumeControlInput.style.height = volumeControlInput.parentElement.clientWidth + "px"
}

function setBindings() {
	document.getElementById("startDiscoveryButton").addEventListener("click", startDiscovery)
	document.getElementById("togglePowerState").addEventListener("click", powerStateToggle)
	document.getElementById("togglePowerState").addEventListener("contextmenu", powerStateToggle)
	document.getElementById("volumeInput").addEventListener("input", setVolumeOnSpeakers)
	document.getElementById("settingsButton").addEventListener("click", () => {
		window.IPC.send("openSettingsWindow")
	})

	function volumeUp() {
		volumeControlInput.value = (parseInt(volumeControlInput.value) + 1) + ""
		volumeControlInput.dispatchEvent(new Event("input"))
	}

	function volumeDown() {
		volumeControlInput.value = (parseInt(volumeControlInput.value) - 1) + ""
		volumeControlInput.dispatchEvent(new Event("input"))
	}
	document.addEventListener("wheel", (event) => {
		if (event.deltaY <= 0)
			volumeUp()
		else
			volumeDown()
	})
	document.getElementById("closeButton").addEventListener("click", () => {
		window.IPC.send("quitApp")
	})
	window.IPC.on("volumeUp", volumeUp)
	window.IPC.on("volumeDown", volumeDown)
	window.IPC.on("powerOffSpeakers", function() {
		speakerServices.forEach((s, i) => commonWrite(i, "power", 2))
	})
	window.IPC.on("connectingSpeaker", function(name, id) {
		console.log("Connecting Speaker ", name, id)
	})
	window.IPC.on("rescan", function() {
		console.log("waiting for rescan..")
		startDiscovery()
	})
	setCustomLogging()
}

function setPowerState() {
	powerState = parseInt(localStorage.getItem("powerState"))
	if (powerState) {
		if (powerState == 1)
			document.getElementById("togglePowerState").classList.add("pressed")
		else
			document.getElementById("togglePowerState").classList.remove("pressed")
	}
}

async function startDiscovery() {
	if (connectionInProgress) {
		setTimeout(startDiscovery, 1000)
		return
	}
	speakerServices.forEach(service => service.device.gatt.disconnect())
	speakerServices.length = 0
	writingStates.power.length = 0
	writingStates.volume.length = 0
	writingStates.wake.length = 0
	document.getElementById("countDisplay").innerHTML = "x" + speakerServices.length
	window.IPC.sendSync("startDiscovery")
}
window.startDiscovery = startDiscovery

async function connectSpeaker() {
	if (connectionInProgress) {
		setTimeout(connectSpeaker, 1000)
		return
	}
	try {
		connectionInProgress = true
		const speaker = await navigator.bluetooth.requestDevice({
			filters: [{
				services: [currentProfile.FUNCTION_SERVICE_ID]
			}]
		})
		const speakerServer = await speaker.gatt.connect()
		const service = await speakerServer.getPrimaryService(currentProfile.FUNCTION_SERVICE_ID)

		const volumeCharacteristic =
			await readCharacteristic(service, currentProfile.VOLUME_CHAR_ID, "int")
		console.log("volume:", volumeCharacteristic.value + "")
		if (currentProfile.POWER_CHAR_ID) {
			const powerCharacteristic =
				await readCharacteristic(service, currentProfile.POWER_CHAR_ID, "int")
			console.log("power state:", powerCharacteristic.value + "")
			powerCharacteristic.characteristic.addEventListener("characteristicvaluechanged", handlePowerStateChange)
			powerCharacteristic.characteristic.startNotifications()
		}
		if (currentProfile.SLEEP_CHAR_ID && window.IPC.sendSync("getSettings").ALWAYS_AWAKE) {
			if (powerState != 3)
				wakeSpeakerWithAudio()
			const sleepCharacteristic =
				await readCharacteristic(service, currentProfile.SLEEP_CHAR_ID, "int")
			console.log("wake state:", sleepCharacteristic.value + "")
			sleepCharacteristic.characteristic.addEventListener("characteristicvaluechanged", handleSleepStateChange)
			sleepCharacteristic.characteristic.startNotifications()
		}
		const volumeInput = /** @type {HTMLInputElement} */ (document.getElementById("volumeInput"))
		volumeInput.value = volumeCharacteristic.value

		service.device.addEventListener("gattserverdisconnected", () => removeDevice(service))
		writingStates.volume.push({ writing: false, timeout: null })
		writingStates.power.push({ writing: false, timeout: null })
		writingStates.wake.push({ writing: false, timeout: null })

		console.log("speaker " + speaker.name + " connected.")
		window.IPC.sendSync("speakerConnected", speaker.id)
		speakerServices.push(service)
		document.getElementById("countDisplay").innerHTML = "x" + speakerServices.length
		commonWrite(speakerServices.length - 1, "power", powerState)
		connectionInProgress = false
	} catch (e) {
		connectionInProgress = false
		window.IPC.sendSync("speakerConnectionFailed")
		console.log(e)
	}
}
window.connectSpeaker = connectSpeaker

/**
 * @param {BluetoothRemoteGATTService} service 
 */
async function removeDevice(service) {
	const deviceName = service.device.name
	console.log("speaker " + deviceName + " Disconnected.")
	const serviceIndex = speakerServices.findIndex(speaker => speaker == service)
	window.IPC.sendSync("speakerDisconnected", serviceIndex)
	speakerServices.splice(serviceIndex, 1)
	document.getElementById("countDisplay").innerHTML = "x" + speakerServices.length
}

/**
 * @param {BluetoothRemoteGATTService} service
 * @param {string} characteristicName
 * @param {"utf-8"|"int"} format
 * @returns {Promise<{characteristic: BluetoothRemoteGATTCharacteristic, value: any}>}
 */
async function readCharacteristic(service, characteristicName, format) {
	const characteristic = await service.getCharacteristic(characteristicName)
	const possibleValue = await characteristic.readValue()
	let value = null
	switch (format) {
		case "utf-8": {
			const decoder = new TextDecoder("utf-8")
			value = decoder.decode(possibleValue)
			break
		}
		case "int":
			value = possibleValue.getUint8(0)
			break
	}
	return {
		characteristic: characteristic,
		value: value
	}
}

/**
 * 
 * @param {BluetoothRemoteGATTService} service 
 * @param {string} characteristicName 
 * @param {any} value 
 * @param {"int"} [format] 
 */
async function writeCharacteristic(service, characteristicName, value, format) {
	const characteristic = await service.getCharacteristic(characteristicName)
	let valueToWrite
	switch (format) {
		case "int":
		default:
			if (typeof value == "number")
				valueToWrite = Uint8Array.of(value)
			break
	}
	await characteristic.writeValue(valueToWrite)
}

/**
 * @param {BSVC.NotificationEvent} event 
 */
function handlePowerStateChange(event) {
	console.log("power state changed")
	if (powerState == 3 && event.target.value.getUint8(0) == 1)
		commonWrite(speakerServices.findIndex(service => service == event.target.service),
			"power", 3)
}

/**
 * @param {BSVC.NotificationEvent} event 
 */
function handleSleepStateChange(event) {
	if (event.target.value.getUint8(0) == 0 && powerState == 1) {
		//console.log("Was about to sleeping")
		//const serviceIndex = speakerServices.findIndex(service => service == event.target.service)
		/**
		 * For some reason writing 3 byte length fails with invalid attribite length.
		 * Probably the service is incorrectly configured on the device side to accept only
		 * single length int. Writing single int works but has no effect.
		 */
		//commonWrite(serviceIndex, "wake", [1, 0, 0])
		/**
		 * As an alternative we attempt to keep the speakers awake by playing a short 
		 * audio note hopefully above someones listening range
		 */
		wakeSpeakerWithAudio()
	}
}

function wakeSpeakerWithAudio() {
	try {
		const oscillator = audioContext.createOscillator()
		oscillator.type = "sine"
		oscillator.frequency.value = 19000
		oscillator.connect(audioContext.destination)
		setTimeout(() => {
			oscillator.start()
			setTimeout(() => {
				oscillator.stop()
			}, 500)
		}, 300)
	} catch (e) {
		console.log(e)
	}
}

/**
 * @param {MouseEvent} event 
 */
function powerStateToggle(event) {
	if (event.button == 0) {
		powerState = this.classList.contains("pressed") ? 3 : 1
		this.classList.toggle("pressed")
		speakerServices.forEach((s, i) => commonWrite(i, "power", powerState))
		localStorage.setItem("powerState", powerState + "")
	} else {
		speakerServices.forEach((s, i) => commonWrite(i, "power", 2))
	}
}

async function setVolumeOnSpeakers() {
	speakerServices.forEach((s, i) => commonWrite(i, "volume", parseInt(volumeControlInput.value)))
}

/**
 * 
 * @param {number} id 
 * @param {"power"|"wake"|"volume"} type 
 * @param {*} value 
 * @returns 
 */
async function commonWrite(id, type, value) {
	if (writingStates[type][id].writing) {
		clearTimeout(writingStates[type][id].timeout)
		writingStates[type][id].timeout = setTimeout(() => commonWrite(id, type, value), 200)
		return
	}
	writingStates[type][id].writing = true
	try {
		let characteristicName = currentProfile.POWER_CHAR_ID
		switch (type) {
			case "wake":
				characteristicName = currentProfile.SLEEP_CHAR_ID
				break
			case "volume":
				characteristicName = currentProfile.VOLUME_CHAR_ID
				break
		}
		await writeCharacteristic(speakerServices[id], characteristicName, value)
	} catch (e) {
		console.log(e)
		writingStates[type][id].writing = false
	}
	writingStates[type][id].writing = false
}

function setCustomLogging() {
	if (typeof console != "undefined") {
		if (typeof console.log != "undefined")
			console.olog = console.log
	}

	/**
	 * @param {string[]} messages
	 */
	console.log = function(...messages) {
		console.olog && console.olog(...messages)
		window.IPC.send("writeConsoleMessage", messages.join(" "))
	}
	console.error = console.debug = console.info = console.warn = console.log

	console.log("Provided without any warranty. Though its unlikely, if any damage arises by the use of this app, no one shall not be held responsible. Not even you.")
}

window.onload = start
window.onresize = onResize