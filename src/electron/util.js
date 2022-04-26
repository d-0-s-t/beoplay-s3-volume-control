const fsModule = require("fs")

/**
 * @param {string} filePath
 * @param {string} content
 */
function SaveFile(filePath, content) {
	try {
		fsModule.writeFileSync(filePath, content, "utf8")
	} catch (e) {
		console.log({
			title: "File save failed:",
			content: "" + e + ". " + filePath + "couldn't be saved"
		})
	}
}

module.exports.SaveFile = SaveFile


/**
 * @param {string} filePath 
 * @returns {string}
 */
module.exports.ReadFile = function(filePath) {
	try {
		return (fsModule.readFileSync(filePath, { encoding: "utf8" }))
	} catch (e) {
		console.log("error while parsing file " + filePath)
	}
}