/*

	This piece of code is a fork of GNOME Shell's 3.26.2 "shellEntry.js" file.
	I couldn't use ShellEntryMenu in my code for some obsure reason, so here
	is an absurd copy-paste of the file (where i get rid of password management).
	
	GPLv2

*/
const Clutter = imports.gi.Clutter;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const St = imports.gi.St;

const BoxPointer = imports.ui.boxpointer;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;

var EntryMenu2 = new Lang.Class({
	Name: 'ShellEntryMenu2',
	Extends: PopupMenu.PopupMenu,

	_init: function(entry) {
		this.parent(entry, 0.5, St.Side.RIGHT);

		this._entry = entry;
		this._clipboard = St.Clipboard.get_default();

		// Populate menu
		let item;
		item = new PopupMenu.PopupMenuItem(_("Copy"));
		item.connect('activate', Lang.bind(this, this._onCopyActivated));
		this.addMenuItem(item);
		this._copyItem = item;

		item = new PopupMenu.PopupMenuItem(_("Paste"));
		item.connect('activate', Lang.bind(this, this._onPasteActivated));
		this.addMenuItem(item);
		this._pasteItem = item;

		Main.uiGroup.add_actor(this.actor);
		this.actor.hide();
	},

	open: function(animate) {
		this._updatePasteItem();
		this._updateCopyItem();

		this.parent(animate);
		this._entry.add_style_pseudo_class('focus');

		let direction = Gtk.DirectionType.TAB_FORWARD;
		if (!this.actor.navigate_focus(null, direction, false))
			this.actor.grab_key_focus();
	},

	_updateCopyItem: function() {
		let selection = this._entry.clutter_text.get_selection();
		this._copyItem.setSensitive(selection && selection != '');
	},

	_updatePasteItem: function() {
		this._clipboard.get_text(St.ClipboardType.CLIPBOARD, Lang.bind(this,
			function(clipboard, text) {
				this._pasteItem.setSensitive(text && text != '');
			}));
	},

	_onCopyActivated: function() {
		let selection = this._entry.clutter_text.get_selection();
		this._clipboard.set_text(St.ClipboardType.CLIPBOARD, selection);
	},

	_onPasteActivated: function() {
		this._clipboard.get_text(St.ClipboardType.CLIPBOARD, Lang.bind(this,
			function(clipboard, text) {
				if (!text)
					return;
				this._entry.clutter_text.delete_selection();
				let pos = this._entry.clutter_text.get_cursor_position();
				this._entry.clutter_text.insert_text(text, pos);
			}));
	},
});

function _setMenuAlignment(entry, stageX) {
	let [success, entryX, entryY] = entry.transform_stage_point(stageX, 0);
	if (success)
		entry.menu.setSourceAlignment(entryX / entry.width);
};

function _onButtonPressEvent(actor, event, entry) {
	if (entry.menu.isOpen) {
		entry.menu.close(BoxPointer.PopupAnimation.FULL);
		return Clutter.EVENT_STOP;
	} else if (event.get_button() == 3) {
		let [stageX, stageY] = event.get_coords();
		_setMenuAlignment(entry, stageX);
		entry.menu.open(BoxPointer.PopupAnimation.FULL);
		return Clutter.EVENT_STOP;
	}
	return Clutter.EVENT_PROPAGATE;
};

function _onPopup(actor, entry) {
	let [success, textX, textY, lineHeight] = entry.clutter_text.position_to_coords(-1);
	if (success)
		entry.menu.setSourceAlignment(textX / entry.width);
	entry.menu.open(BoxPointer.PopupAnimation.FULL);
};

function addContextMenu(entry) {
	if (entry.menu)
		return;

	entry.menu = new EntryMenu2(entry);
	entry._menuManager = new PopupMenu.PopupMenuManager({ actor: entry });
	entry._menuManager.addMenu(entry.menu);

	// Add an event handler to both the entry and its clutter_text; the former
	// so padding is included in the clickable area, the latter because the
	// event processing of ClutterText prevents event-bubbling.
	entry.clutter_text.connect('button-press-event', Lang.bind(null, _onButtonPressEvent, entry));
	entry.connect('button-press-event', Lang.bind(null, _onButtonPressEvent, entry));

	entry.connect('popup-menu', Lang.bind(null, _onPopup, entry));

	entry.connect('destroy', function() {
		entry.menu.destroy();
		entry.menu = null;
		entry._menuManager = null;
	});
}



