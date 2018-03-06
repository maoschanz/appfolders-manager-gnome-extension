
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

const Gettext = imports.gettext.domain('appfolders-manager');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

//-----------------------------------------------

function init() {
	Convenience.initTranslations();
}

//-----------------------------------------------

const appfoldersManagerSettingsWidget = new GObject.Class({
	Name: 'appfoldersManager.Prefs.Widget',
	GTypeName: 'appfoldersManagerPrefsWidget',
	Extends: Gtk.Box,

	_init: function(params) {
		this.parent(params);
		this.margin = 30;
		this.spacing = 18;
		this.set_orientation(Gtk.Orientation.VERTICAL);
		
		let labelMain = '<b>' + _("Modifications will be effective after reloading the extension.") + '</b>';
		this.add(new Gtk.Label({ label: labelMain, use_markup: true, halign: Gtk.Align.START }));
		
		this._settings = Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager');
		
		//----------------------------
		
		let generalSection = this.add_section(_("Main settings"));
		let categoriesSection = this.add_section(_("Categories"));
		
		//----------------------------
		
		let deleteAllText = _("Delete all related settings when an appfolder is deleted");
		let deleteAllSwitch = new Gtk.Switch();
		deleteAllSwitch.set_state(true);
		deleteAllSwitch.set_state(this._settings.get_boolean('total-deletion'));
		
		deleteAllSwitch.connect('notify::active', Lang.bind(this, function(widget) {
			if (widget.active) {
				this._settings.set_boolean('total-deletion', true);
			} else {
				this._settings.set_boolean('total-deletion', false);
			}
		}));
		
		let deleteAllBox = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 15,
			margin: 6,
		});
		deleteAllBox.pack_start(new Gtk.Label({ label: deleteAllText, halign: Gtk.Align.START }), false, false, 0);
		deleteAllBox.pack_end(deleteAllSwitch, false, false, 0);
		
		//----------------------------
		
		let categoriesText = _("Use categories:");
		let categoriesSwitch = new Gtk.Switch();
		categoriesSwitch.set_state(true);
		categoriesSwitch.set_state(this._settings.get_boolean('categories'));
		
		categoriesSwitch.connect('notify::active', Lang.bind(this, function(widget) {
			if (widget.active) {
				this._settings.set_boolean('categories', true);
			} else {
				this._settings.set_boolean('categories', false);
			}
		}));
		
		let categoriesBox = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 15,
			margin: 6,
		});
		categoriesBox.pack_start(new Gtk.Label({ label: categoriesText, halign: Gtk.Align.START }), false, false, 0);
		categoriesBox.pack_end(categoriesSwitch, false, false, 0);
		
		//----------------------------
		
		let dndText = _("Drag-and-drop (work in progress)");
		let dndSwitch = new Gtk.Switch({visible: this._settings.get_boolean('experimental')});
		dndSwitch.set_state(true);
		dndSwitch.set_state(this._settings.get_boolean('dnd'));
		
		dndSwitch.connect('notify::active', Lang.bind(this, function(widget) {
			if (widget.active) {
				this._settings.set_boolean('dnd', true);
			} else {
				this._settings.set_boolean('dnd', false);
			}
		}));
		
		let dndBox = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 15,
			margin: 6,
			visible: this._settings.get_boolean('experimental')
		});
		dndBox.pack_start(new Gtk.Label({
			label: dndText,
			halign: Gtk.Align.START,
			visible: this._settings.get_boolean('experimental')
		}), false, false, 0);
		dndBox.pack_end(dndSwitch, false, false, 0);
		
		//----------------------------
		
		let experimentalText = _("Debug & experimental features (not recommended)");
		let experimentalSwitch = new Gtk.Switch();
		experimentalSwitch.set_state(true);
		experimentalSwitch.set_state(this._settings.get_boolean('experimental'));
		
		experimentalSwitch.connect('notify::active', Lang.bind(this, function(widget) {
			if (widget.active) {
				this._settings.set_boolean('experimental', true);
				dndBox.visible = true;
			} else {
				this._settings.set_boolean('experimental', false);
				dndBox.visible = false;
			}
		}));
		
		let experimentalBox = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 15,
			margin: 6,
		});
		experimentalBox.pack_start(new Gtk.Label({ label: experimentalText, halign: Gtk.Align.START }), false, false, 0);
		experimentalBox.pack_end(experimentalSwitch, false, false, 0);
		
		//-------------------------
		
		// Since Gtk seems unable to fucking understand what "visible = false" means, the user will just not have those fucking options.
		
		this.add_row(deleteAllBox, generalSection);
		this.add_row(experimentalBox, generalSection);
		this.add_row(dndBox, generalSection);
		
		//-------------------------
		
		let categoriesText2 = _("More informations about \"additional categories\"");
		let categoriesLinkButton = new Gtk.LinkButton({
			label: _("Standard specification"),
			uri: "https://standards.freedesktop.org/menu-spec/latest/apas02.html"
		});
		
		let categoriesBox2 = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 15,
			margin: 6,
		});
		categoriesBox2.pack_start(new Gtk.Label({ label: categoriesText2, halign: Gtk.Align.START }), false, false, 0);
		categoriesBox2.pack_end(categoriesLinkButton, false, false, 0);

		this.add_row(categoriesBox, categoriesSection);
		this.add_row(categoriesBox2, categoriesSection);
		
		//-------------------------
		
		let aboutBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
		
		let a_version = ' (v' + Me.metadata.version.toString() + ') ';
		let url_button = new Gtk.LinkButton({
			label: _("Report bugs or ideas"),
			uri: Me.metadata.url.toString()
		});
		
		aboutBox.pack_start(url_button, false, false, 0);
		aboutBox.pack_end(new Gtk.Label({ label: a_version, halign: Gtk.Align.START }), false, false, 0);
		
		this.pack_end(aboutBox, false, false, 0);
		
		//-------------------------
		
		let desacBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
		desacBox.add(new Gtk.Label({
			label: _("This extension can be deactivated once your applications are organized as wished."),
			halign: Gtk.Align.CENTER
		}));
		
		this.pack_end(desacBox, false, false, 0);
	},
	
	add_section: function(titre) {
		let section = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
			spacing: 6,
		});
		if (titre != "") {
			section.add(new Gtk.Label({
				label: '<b>' + titre + '</b>',
				halign: Gtk.Align.START,
				use_markup: true,
			}));
		}
	
		let a = new Gtk.ListBox({
			can_focus: false,
			has_focus: false,
			is_focus: false,
			has_default: false,
			selection_mode: Gtk.SelectionMode.NONE,
		});
		section.add(a);
		this.add(section);
		return a;
	},

	add_row: function(filledbox, section) {
		let a = new Gtk.ListBoxRow({
			can_focus: false,
			has_focus: false,
			is_focus: false,
			has_default: false,
			selectable: false,	
		});
		a.add(filledbox);
		section.add(a);
		return a;
	},
});

//-----------------------------------------------

//I guess this is like the "enable" in extension.js : something called each
//time he user try to access the settings' window
function buildPrefsWidget() {
	let widget = new appfoldersManagerSettingsWidget();
	widget.show_all();

	return widget;
}
