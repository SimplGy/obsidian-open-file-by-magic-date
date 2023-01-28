import { App, MarkdownView, Plugin, PluginSettingTab, Setting, TFile, moment } from 'obsidian';

const DESCRIPTION_TEXT = `Use curly brackets to add date formats. eg: "{YYYY-MM-DD}". Supports anything Moment.js library.
Additionally accepts a special format to indicate "prior monday". eg: "{mon:YYYY-MM-DD}"
Include the '.md' extension in your filename if you use that.`;

// iso weekday spec
const DAYS = {
	mon: 1,
	tue: 2,
	wed: 3,
	thu: 4,
	fri: 5,
	sat: 6,
	sun: 7,
}

interface MagicFileHotkeySettings {
	files: string[];
	useExistingPane: boolean;
}

const DEFAULT_SETTINGS: MagicFileHotkeySettings = {
	files: [
		'journal/{YYYY-MM-DD}.md'
	],
	useExistingPane: true,
};

// ---------------------------------------------------- Plugin Definition
export default class MagicFileHotkeyPlugin extends Plugin {
	
	settings: MagicFileHotkeySettings;
	
	async onload() {
		await this.loadSettings();
		console.log('loading ' + this.manifest.name);
		this.addSettingTab(new SettingsTab(this.app, this));
		this.resetCommands();
	}

	onunload() {
		console.log('unloading ' + this.manifest.name);
	}

	async loadSettings() {
		// this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings = {...DEFAULT_SETTINGS, ...await this.loadData()};
	}

	// note: this is called ~every keystroke, so be aware
	async saveSettings() {
		await this.saveData(this.settings);
		// update the commands, which is what hotkeys are set against
		this.resetCommands();
	}

	resetCommands() {
		for (const fileNameSpec of this.settings.files) {

			const fileNameSpecNoExt = fileNameSpec.substring(0, fileNameSpec.lastIndexOf("."));

			// repeatedly calling with the same ID appears to be effectively an "update" operation
			this.addCommand({
				id: 'open-by-magic-date', // should not change over time
				name: `Open '${fileNameSpecNoExt}'`,
				callback: () => {
					const fileName = lockInDate(fileNameSpec);
					this.openFile(fileName);
				}
			});
		}
	}

	// Desired behavior: focus the tab if it's already open. Open a new tab if it's not.
	// This would be simple, except for one thing:
	// the file you want to open might ALREADY be open in another tab.
	// That's the reason for "iterateAllLeaves"
	openFile(fileName: string) {
		
		// See if there's a tab open with this file in it:
		let found = false;
		this.app.workspace.iterateAllLeaves(leaf => {
			const file: TFile = (leaf.view as any).file;
			if (file?.path === fileName) {
				this.app.workspace.revealLeaf(leaf);
				if (leaf.view instanceof MarkdownView) {
					leaf.view.editor.focus();
				}
				found = true;

				console.log('FOUND A LEAF!', leaf);
				return; // don't keep looking
			}
		});

		// Case: there isn't already a tab open with this file
		if (!found) {
			/*
			docs:
			https://marcus.se.net/obsidian-plugin-docs/reference/typescript/classes/Workspace#openlinktext
			openLinkText(
				linktext: string,
				sourcePath: string,
				newLeaf?: PaneType | boolean, // PaneType = 'tab' | 'split' | 'window'; // 2023-01-28: out of date docs. "Argument of type 'string' is not assignable to parameter of type 'boolean'"
				openViewState?: OpenViewState // no idea. https://marcus.se.net/obsidian-plugin-docs/reference/typescript/interfaces/OpenViewState
				)
			*/
			this.app.workspace.openLinkText(fileName, "", true);
		}
	}
}



// ---------------------------------------------------- Settings Tab
class SettingsTab extends PluginSettingTab {
	
	plugin: MagicFileHotkeyPlugin;

	constructor(app: App, plugin: MagicFileHotkeyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		// remove empty entries
		// this.plugin.settings.files = this.plugin.settings.files.filter(file => file != null && file != "");
		// this.plugin.saveSettings();

		let { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: this.plugin.manifest.name });
		
		const index = 0; // only one file targeted by this plugin, for now
		const curVal = this.plugin.settings.files[index];

		const setting = new Setting(this.containerEl)
			.setName("Open this file")		
			.addText(cb => {
				cb
					.setPlaceholder("dir/YYYY-MM-DD.md")
					.setValue(curVal)
					.onChange(value => {
						this.plugin.settings.files[index] = value;

						// Tell user how/if we parsed it
						const parsedName = lockInDate(value);
						outputPrinter.innerText = `"${parsedName}"`;

						// Nothing Parsed, so we aren't using the date syntax
						if (parsedName === value) {
							outputPrinter.style.color = 'inherit';

						// Parser changed something, so date syntax is active
						} else {
							// colored purple if date syntax is active
							outputPrinter.style.color = 'var(--text-accent)';
						}
						
						// Checkmark if it also matches an existing file
						// this is a little funny, I think because Obsidian can match filenames with and without directories
						if(exists(parsedName)) {
							outputPrinter.innerText = `"${parsedName}" ✅`;
						}

						this.plugin.saveSettings();
					});
			});
		// wider text field
		setting.controlEl.querySelector('input').style.width = '100%';
		setting.settingEl.style.paddingBottom = '4px';

		// add an element to print out the computed path
		const outputPrinter = document.createElement('div');
		outputPrinter.className = 'setting-item-description'; // small, muted
		outputPrinter.innerText = lockInDate(curVal);
		outputPrinter.style.width = '50%';
		outputPrinter.style.marginLeft = '46%'; // a pain to line up
		this.containerEl.appendChild(outputPrinter);

		
		// add an explanation, but with more room
		const descEl = document.createElement('p');
		descEl.className = 'setting-item-description'; // muted
		descEl.innerText = DESCRIPTION_TEXT;
		this.containerEl.appendChild(descEl);
	}
}

// convert the input format YYYY to the current date
function lockInDate(inputString: string): string {
	const now = moment();

	let str = inputString;

	// If there's a weekday prefix, send that to the preceding, matching day
	// send anything in curlies "{mon:...}" to moment.format for the preceeding monday
	// eg: `Weekly Notes/{mon:YYYY-MM-DD} week.md`
	str = str.replace(/{mon:(.*)}/g, (_match, captured) => getPreviousWeekday(DAYS.mon).format(captured));
	str = str.replace(/{tue:(.*)}/g, (_match, captured) => getPreviousWeekday(DAYS.tue).format(captured));
	str = str.replace(/{wed:(.*)}/g, (_match, captured) => getPreviousWeekday(DAYS.wed).format(captured));
	str = str.replace(/{thu:(.*)}/g, (_match, captured) => getPreviousWeekday(DAYS.thu).format(captured));
	str = str.replace(/{fri:(.*)}/g, (_match, captured) => getPreviousWeekday(DAYS.fri).format(captured));
	str = str.replace(/{sat:(.*)}/g, (_match, captured) => getPreviousWeekday(DAYS.sat).format(captured));
	str = str.replace(/{sun:(.*)}/g, (_match, captured) => getPreviousWeekday(DAYS.sun).format(captured));

	// send anything in curlies "{...}" to moment.format
	// eg: `Daily Notes/{YYYY-MM-DD}.md`
	// replace the entire match with a moment formatted version of the capture group
	str = str.replace(/{(.*)}/g, (_match, captured) => now.format(captured));

	return str;
}

// Get the date of the previous day of the week you'd like. (eg: the most recent Monday)
// isoWeekday: 1 for Monday, 7 for Sunday.
function getPreviousWeekday(day: number) {
	const t = moment();
	let guess = t.isoWeekday()
	let i = 0;

	while (day !== guess && i <= 7) {
		t.subtract(1, 'days');
		guess = t.isoWeekday();
		i++; // infinite loop blocker
	}
	return t;
}

// Check if a file exists. Depends on `app` global.
function exists(filename: string) {
	const ref = app.metadataCache.getFirstLinkpathDest(filename, "");
	return ref != null;
}