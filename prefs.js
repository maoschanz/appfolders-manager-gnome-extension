
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
		
		let deleteAllBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
		deleteAllBox.pack_start(new Gtk.Label({ label: deleteAllText, halign: Gtk.Align.START }), false, false, 0);
		deleteAllBox.pack_end(deleteAllSwitch, false, false, 0);
		
		this.add(deleteAllBox);
		
		//----------------------------
		
//		let experimentalText = _("Experimental features (not recommended)");
//		let experimentalSwitch = new Gtk.Switch();
//		experimentalSwitch.set_state(true);
//		experimentalSwitch.set_state(this._settings.get_boolean('experimental'));
//		
//		experimentalSwitch.connect('notify::active', Lang.bind(this, function(widget) {
//			if (widget.active) {
//				this._settings.set_boolean('experimental', true);
//				dndBox.visible = true;
//			} else {
//				this._settings.set_boolean('experimental', false);
//				dndBox.visible = false;
//			}
//		}));
//		
//		let experimentalBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
//		experimentalBox.pack_start(new Gtk.Label({ label: experimentalText, halign: Gtk.Align.START }), false, false, 0);
//		experimentalBox.pack_end(experimentalSwitch, false, false, 0);
//		
//		this.add(experimentalBox);
//		
//		//----------------------------
//		
//		let dndText = _("Drag-and-drop");
//		let dndSwitch = new Gtk.Switch();
//		dndSwitch.set_state(true);
//		dndSwitch.set_state(this._settings.get_boolean('dnd'));
//		
//		dndSwitch.connect('notify::active', Lang.bind(this, function(widget) {
//			if (widget.active) {
//				this._settings.set_boolean('dnd', true);
//			} else {
//				this._settings.set_boolean('dnd', false);
//			}
//		}));
//		
//		let dndBox = new Gtk.Box({
//			orientation: Gtk.Orientation.HORIZONTAL,
//			spacing: 10,
//			visible: false,//this._settings.get_boolean('experimental'), //??????????
//		});
//		dndBox.pack_start(new Gtk.Label({ label: dndText, halign: Gtk.Align.START }), false, false, 0);
//		dndBox.pack_end(dndSwitch, false, false, 0);
//		
//		if (this._settings.get_boolean('experimental')){
//			this.add(dndBox);
//		}
//		
//		////dndBox.visible = false; // which doesn't work, because ????? 
		
		//-------------------------
		
		let categoriesText = _("More informations about \"additional categories\"");
		let categoriesLinkButton = new Gtk.LinkButton({
        	label: _("Standard specification"),
        	uri: "https://standards.freedesktop.org/menu-spec/latest/apas02.html"
        });
		
		let categoriesBox = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 10,
		});
		categoriesBox.pack_start(new Gtk.Label({ label: categoriesText, halign: Gtk.Align.START }), false, false, 0);
		categoriesBox.pack_end(categoriesLinkButton, false, false, 0);
		
		this.add(categoriesBox);
		
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
		
	}
});

//-----------------------------------------------

//I guess this is like the "enable" in extension.js : something called each
//time he user try to access the settings' window
function buildPrefsWidget() {
    let widget = new appfoldersManagerSettingsWidget();
    widget.show_all();

    return widget;
}
