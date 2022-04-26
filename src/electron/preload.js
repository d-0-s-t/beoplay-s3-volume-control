const { contextBridge, ipcRenderer } = require("electron")

/**
 * @param {"send"|"on"|"sendSync"|"once"} method
 * @param {string} channel
 * @param {*} args
 * @returns {Function} Returns a function to detach attached listener
 */
function callIPCRenderer(method, channel, ...args) {
	if (method == "send") {
		ipcRenderer.send(channel, ...args)
	} else if (method == "sendSync") {
		return ipcRenderer.sendSync(channel, ...args)
	} else {
		const listener = args[0]
		if (!listener || typeof listener != "function")
			throw "Invalid Listener"
		/**
		 * @param {import("electron/main").IpcRendererEvent} event
		 * @param  {...any} a
		 */
		const wrappedListener = function(event, ...a) {
			try{
				listener(...a)
			}catch(e){
				console.log(channel, e)
			}
		}
		if (method == "on")
			ipcRenderer.on(channel, wrappedListener)
		else
			ipcRenderer.once(channel, wrappedListener)

		return () => { ipcRenderer.removeListener(channel, wrappedListener) }
	}
}

/**
 * List of node objects to be exposed in the browser environment.
 * These will be exposed on the document window object
 */
contextBridge.exposeInMainWorld("IPC", {
	send: ( /** @type {string} */ channel, /** @type {any} */ ...args) =>
		callIPCRenderer("send", channel, ...args),
	on: ( /** @type {string} */ channel, /** @type {any} */ ...args) =>
		callIPCRenderer("on", channel, ...args),
	once: ( /** @type {string} */ channel, /** @type {any} */ ...args) =>
		callIPCRenderer("once", channel, ...args),
	sendSync: ( /** @type {string} */ channel, /** @type {any} */ ...args) =>
		callIPCRenderer("sendSync", channel, ...args)
})