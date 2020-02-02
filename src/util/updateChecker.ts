import { exec, execFile } from "child_process";
import { resolve, dirname } from "path";
import { error, info } from "./debug";
import { app, dialog, shell } from "electron";
import { platform } from "os";
import axios from "axios";
import { Notification } from "electron";
import { trayManager } from "..";
import { createWriteStream, existsSync, unlinkSync } from "fs";

export let updateAvailable = false;
let initialNotification = true;

export async function checkForUpdate(autoUpdate = false) {
	//* Skip Update checker if unsupported OS / not packaged
	if (!app.isPackaged || !["darwin", "win32"].includes(platform())) {
		//* Show debug
		//* return
		info("Skipping UpdateChecker");
		return;
	}

	try {
		let latestAppVersion = (
			await axios.get("https://api.premid.app/v2/versions")
		).data.app;
		if (app.getVersion() >= latestAppVersion) return;
		if (autoUpdate) {
			updateTray();
			update();
			return;
		}
	} catch (err) {
		error(err);
	}

	if (initialNotification) {
		const updateNotification = new Notification({
			title: "Update available!",
			body: "A new version of PreMiD is available! Click here to update."
		});

		updateNotification.once("click", update);
		updateNotification.show();
		updateTray();

		initialNotification = false;
	}
}

export async function update() {
	if (!["win32", "darwin"].includes(platform())) return;
	const updaterPath = resolve(
		app.getPath("temp"),
		`PreMiD-Updater${
			platform() === "win32" ? ".exe" : ".app/Contents/MacOS/installbuilder.sh"
		}`
	);

	if (existsSync(updaterPath)) unlinkSync(updaterPath);
	if (existsSync(resolve(app.getPath("temp"), "PreMiD-release.zip")))
		unlinkSync(resolve(app.getPath("temp"), "PreMiD-release.zip"));

	const response = await axios({
		url: `http://dl.premid.app/upgrader${
			platform() === "win32" ? ".exe" : ".app"
		}`,
		method: "GET",
		responseType: "stream"
	});

	const writer = createWriteStream(updaterPath);
	response.data.pipe(writer);

	new Promise((resolve, reject) => {
		writer.on("finish", resolve);
		writer.on("error", reject);
	})
		.then(() => exec(updaterPath, errorHandler))
		.catch(errorHandler);
}

function errorHandler(err: Error) {
	dialog
		.showMessageBox({
			title: `Error while updating ${app.name}`,
			message: `If this error persists reinstall the app.`,
			detail: err.message,
			buttons: ["Okay", "Reinstall Application"],
			type: "error"
		})
		.then(value => {
			if (value.response === 1)
				shell.openExternal("https://premid.app/downloads");
		});
	updateTray();
}

function updateTray() {
	updateAvailable = true;
	trayManager.update();
}
