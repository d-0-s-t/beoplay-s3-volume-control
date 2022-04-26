window.onload = start

function start() {
	setDOM()
	setBindings()
}
/** @type {BSVC.SETTINGS} */
let settings
/** @type {HTMLPreElement} */
let consoleBin

function setDOM() {
	settings = window.IPC.sendSync("getSettings")
	consoleBin = document.querySelector("#consoleBin")
	const inputs = /** @type {NodeListOf<HTMLInputElement>} */
		(document.querySelectorAll("#settingsBin input"))
	inputs.forEach(input => {
		if (input.type == "checkbox") {
			input.checked = settings[input.name]
		} else {
			input.value = settings[input.name]
		}
	})
}

function setBindings() {
	const inputs = /** @type {NodeListOf<HTMLInputElement>} */
		(document.querySelectorAll("#settingsBin input"))
	inputs.forEach(input => {
		input.addEventListener("input", () => {
			if (input.type == "checkbox") {
				settings[input.name] = input.checked
			} else {
				settings[input.name] = input.value
				input.nextElementSibling.innerHTML = (parseFloat(input.value) / 1000) + " seconds"
			}
			window.IPC.send("updateSettings", settings)
		})
	})

	document.getElementById("rescan").addEventListener("click", function() {
		window.IPC.send("rescan")
	})

	window.IPC.on("writeConsoleMessage", function(message) {
		consoleBin.innerHTML = message + "\n" + consoleBin.innerHTML
	})
}