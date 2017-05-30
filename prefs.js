
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

const osefSettingsWidget = new GObject.Class({
    Name: 'osef.Prefs.Widget',
    GTypeName: 'osefPrefsWidget',
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
		
		let label = _("Maximum number of columns :");
		
		let nbColumns = new Gtk.SpinButton();
        nbColumns.set_sensitive(true);
        nbColumns.set_range(4, 10);
		nbColumns.set_value(6);
        nbColumns.set_value(this._settings.get_int('columns-max'));
        nbColumns.set_increments(1, 2);
        
		nbColumns.connect('value-changed', Lang.bind(this, function(w){
			var value = w.get_value_as_int();
			this._settings.set_int('columns-max', value);
		}));
		
		let hBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 15 });
		hBox.pack_start(new Gtk.Label({ label: label, use_markup: true, halign: Gtk.Align.START }), false, false, 0);
		hBox.pack_end(nbColumns, false, false, 0);
		this.add(hBox);
		
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
	}
});

//-----------------------------------------------

//I guess this is like the "enable" in extension.js : something called each
//time he user try to access the settings' window
function buildPrefsWidget() {
    let widget = new osefSettingsWidget();
    widget.show_all();

    return widget;
}
