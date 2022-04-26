const glob = require("glob")
const path = require("path")
const fs = require("fs")
const asar = require("asar")
const BUILDER = require("electron-builder")
require("dotenv").config()

/**
 * Regular expression for files js files to obfuscate
 */
const filesToProcess = [
	new RegExp("src/web-app"),
	new RegExp("src/electron")
]

/**
 * @type {BUILDER.Configuration}
 */
const config = {
	"appId": process.env.APP_ID,
	"productName": "Beoplay S3 Volume Control",
	"copyright": `© ${new Date().getFullYear()} d0st. All rights reversed.`,
	"detectUpdateChannel": false,
	"afterPack": afterPackageCopied,
	"files": [
		"**/*",
		"!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
		"!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
		"!**/node_modules/*.d.ts",
		"!**/node_modules/.bin",
		"!.editorconfig",
		"!**/._*",
		"!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
		"!**/{appveyor.yml,.travis.yml,circle.yml}",
		"!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}",
		"!**/*.ts",
		"!*.code-workspace",
		"!package.json",
		"!package-lock.json",
		"!_config.yml",
		"!jsconfig.json",
		"!*.md",
		"!docs",
		"!.eslintignore",
		"!.env",
	],
	"win": {
		"target": ["nsis"],
	},
	"publish": {
		provider: "github",
	},
	"nsis": {
		"differentialPackage": true,
		"deleteAppDataOnUninstall": true,
		"runAfterFinish": true,
		"artifactName": "${productName} Setup.${ext}",
	},
	/**
	 * TODO verify this creates a mac build
	 */
	/* "mac": {
		"category": "public.app-category.settings", //?
		"target": ["dmg", "zip"],
		"hardenedRuntime": true,
		"entitlements": "./build/entitlements.mac.plist",
		"entitlementsInherit": "./build/entitlements.mac.plist",
		"gatekeeperAssess": false
	},*/
	/**
	 * TODO Verify linux builds
	 */
	/*"linux": {
		"target": "AppImage",
		"category": "Utility"
	} */
}

/**
 * @param {any} buildCtx
 */
async function afterPackageCopied(buildCtx) {
	//do the source transforms here. First unpack the asar
	const asarLoc = buildCtx.packager.platform.name == "mac" ?
		path.join(buildCtx.appOutDir, `${buildCtx.packager.appInfo.productFilename}.app`, "Contents", "Resources", "app.asar") :
		path.join(buildCtx.appOutDir, "resources", "app.asar")
	const unpackDir = path.join(buildCtx.appOutDir, "tempDir")
	await asar.extractAll(asarLoc, unpackDir)
	fs.rmSync(asarLoc)

	//the actual transform
	const filePaths = glob.sync(path.join(unpackDir, "**", "*.js"))
	for (const filePath of filePaths) {
		if (passFilter(filePath)) {
			let fileContent = fs.readFileSync(filePath, { encoding: "utf8" })
			fileContent = fileContent.replace(/.*\/\/ \$#_DEV_#\$/g, "")
			fs.writeFileSync(filePath, fileContent, { encoding: "utf8" })
		}
	}

	//create new asar package and delete unpacked Directory
	await asar.createPackage(unpackDir, asarLoc)
	fs.rmSync(unpackDir, { recursive: true, force: true })

	/**
	 * So why do this much? can't you just disable asar in the build config?
	 * Disabling Asar and creating in this hook, will cause the app-builder's sanitycheck 
	 * to fail when app directory is deleted
	 */
}

/**
 * @param {string} str 
 * @returns {boolean}
 */
function passFilter(str) {
	for (const regexPattern of filesToProcess) {
		if (regexPattern.test(str))
			return true
	}
	return false
}


module.exports = config