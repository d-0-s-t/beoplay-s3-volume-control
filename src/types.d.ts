namespace BSVC {
	interface SETTINGS {
		ALWAYS_AWAKE: boolean,
		CONSUME_MEDIA_KEYS: boolean,
		LOAD_AT_STARTUP: boolean,
		POWER_OFF_AT_SHUTDOWN: boolean,
		SCAN_TIME: number,
		SHOW_WINDOW_WHEN_CHANGE: boolean
	}
	interface PROFILE {
		//app friendly name displayed in settings
		NAME: string,
		//modelID supplied by manufacturer,
		MODEL_NAME?: string,
		/**
		 * The bluetooth service UUID that exposes reading/writing on device characteristics
		 */
		FUNCTION_SERVICE_ID: string,
		/**
		 * Generic device information
		 */
		INFO_SERVICE_ID: string,
		/**
		 * Volume Characteristic ID for the device.
		 * Volume will be read and written to this
		 */
		VOLUME_CHAR_ID: string,
		/**
		 * Optional wake state characteristic ID. The presence of this property
		 * in the profile indicates that the device can be toggled between sleep states
		 * So apparently, beoplay s3 has two ways of manaing power. One is characteristic updates
		 * with the physical power button on the Unit. states are (in hex)
		 * 01-awake
		 * 02-total power shutdown
		 * 03-sleep
		 */
		POWER_CHAR_ID?: string,
		/**
		 * Then there is this soft state management that toggles sleep even if the device is in wake
		 * state as described above. States in hex decimal are:
		 * 00-02-00 sleep
		 * 00-01-00 awake
		 */
		SLEEP_CHAR_ID?: string,
		NAME_CHAR_ID?: string
	}
	interface DiscoveredDevice {
		deviceName: string,
		deviceId: string
	}
	interface WritingState {
		writing: boolean,
		timeout: Timeout
	}
	interface NotificationEvent extends Event {
		target: BluetoothRemoteGATTCharacteristic
	}
}

interface Window {
	IPC: {
		on(channel: "volumeUp", listener: () => void): () => void
		on(channel: "volumeDown", listener: () => void): () => void
		send(channel: "openDevConsole", state: boolean): void
		sendSync(channel: "discoveryMode", state: boolean): void
		send(channel: "updateSettings", settings: BSVC.SETTINGS): void
		send(channel: "rescan"): void
		send(channel: "openSettingsWindow"): void
		send(channel: "writeConsoleMessage", message: string): void
		on(channel: "writeConsoleMessage", listener: (message: string) => void): void
		on(channel: "connectingSpeaker", listener: (name: string, id: string) => void): void
		send(channel: "quitApp"): void
		on(channel: "rescan", listener: () => void): void
		on(channel: "powerOffSpeakers", listener: () => void): void
		sendSync(channel: "getSettings"): BSVC.SETTINGS;
		sendSync(channel: "speakerConnected", id: string): void;
		sendSync(channel: "startDiscovery"): void;
		sendSync(channel: "speakerConnectionFailed"): void;
		sendSync(channel: "speakerDisconnected", speakerIndex: number): void;
	}
	startDiscovery: () => void,
	connectSpeaker: (name: string, id: string) => void
}

interface Console {
	olog: (...message?: string[]) => void
}