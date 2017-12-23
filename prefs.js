
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
        this.spacing = 25;
        this.fill = true;
        this.set_orientation(Gtk.Orientation.VERTICAL);
        
		let labelMain = '<b>' + _("Modifications will be effective after reloading the extension.") + '</b>';
		this.add(new Gtk.Label({ label: labelMain, use_markup: true, halign: Gtk.Align.START }));
		
		this._settings = Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager');
		
		//----------------------------
		
		let checkButton = new Gtk.CheckButton({label:_("Delete all related settings when an appfolder is deleted")});
		
		checkButton.connect('toggled', Lang.bind(this, function(b) {
			if(b.get_active()) {
				this._settings.set_boolean('total-deletion', true);
			} else {
				this._settings.set_boolean('total-deletion', false);
			}
		}));
		
		checkButton.set_active(this._settings.get_boolean('total-deletion'));

    	this.add(checkButton);
		
		//------------
		
		let checkButton2 = new Gtk.CheckButton({label:_("Experimental features (not recommended)")});
		
		checkButton2.connect('toggled', Lang.bind(this, function(b) {
			if(b.get_active()) {
				this._settings.set_boolean('experimental', true);
			} else {
				this._settings.set_boolean('experimental', false);
			}
		}));
		
		checkButton2.set_active(this._settings.get_boolean('experimental'));

//    	this.add(checkButton2);
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
