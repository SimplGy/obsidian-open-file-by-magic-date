import { App, MarkdownView, Plugin, PluginSettingTab, Setting, TFile, moment } from 'obsidian';

const DESCRIPTION_TEXT = `Use curly brackets to add date formats. eg: "{YYYY-MM-DD}". Supports anything Moment.js library.
Additionally accepts a special format to indicate "prior monday". eg: "{mon:YYYY-MM-DD}"
Include the '.md' extension in your filename if you use that.`;

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
		this.setCommands(this);
	}

	onunload() {
		console.log('unloading ' + this.manifest.name);
	}

	async loadSettings() {
		// this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings = {...DEFAULT_SETTINGS, ...await this.loadData()};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	setCommands(plugin: MagicFileHotkeyPlugin) {
		for (const fileNameSpec of this.settings.files) {

			const fileName = lockInDate(fileNameSpec);
			const fileNameSpecNoExt = fileNameSpec.substring(0, fileNameSpec.lastIndexOf("."));

			plugin.addCommand({
				id: fileNameSpec, // should not change over time
				name: `Open '${fileNameSpecNoExt}'`,
				// hotkeys: [{ modifiers: ["Mod", "Alt"], key: "o" }],
				callback: () => {
					if (this.settings.useExistingPane) {
						let found = false;
						this.app.workspace.iterateAllLeaves(leaf => {
							const file: TFile = (leaf.view as any).file;
							if (file?.path === fileName) {
								this.app.workspace.revealLeaf(leaf);
								if (leaf.view instanceof MarkdownView) {
									leaf.view.editor.focus();
								}
								found = true;
							}
						});
						if (!found) {
							plugin.app.workspace.openLinkText(fileName, "");
						}
					} else {
						plugin.app.workspace.openLinkText(fileName, "");
					}
				}
			});
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
						if (parsedName === value) {
							outputPrinter.style.color = 'inherit';
						} else {
							// colored purple if date syntax is active
							// TODO: color green if it also matches an existing file
							outputPrinter.style.color = 'var(--text-accent)';
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

// TODO: use a lib
// convert the input format YYYY to the current date
function lockInDate(inputString: string): string {
	const now = moment();
	const priorMonday = moment().startOf('isoWeek');  
	let str = inputString;

	// send anything in curlies "{mon:...}" to moment.format for the preceeding monday
	// eg: `Weekly Notes/{mon:YYYY-MM-DD} week.md`
	str = str.replace(/{mon:(.*)}/g, (match, captured) => priorMonday.format(captured));

	// send anything in curlies "{...}" to moment.format
	// eg: `Daily Notes/{YYYY-MM-DD}.md`
	// replace the entire match with a moment formatted version of the capture group
	str = str.replace(/{(.*)}/g, (_match, captured) => now.format(captured));

	return str;
}