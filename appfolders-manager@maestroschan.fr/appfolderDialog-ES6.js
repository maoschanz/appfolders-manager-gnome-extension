// appfolderDialog.js
// GPLv3

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;
const PopupMenu = imports.ui.popupMenu;
const ShellEntry = imports.ui.shellEntry;
const Signals = imports.signals;
const Gtk = imports.gi.Gtk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Extension = Me.imports.extension;

const Gettext = imports.gettext.domain('appfolders-manager');
const _ = Gettext.gettext;

let FOLDER_SCHEMA;
let FOLDER_LIST;

//--------------------------------------------------------------

// This is a modal dialog for creating a new folder, or renaming or modifying
// categories of existing folders.
var class AppfolderDialog extends ModalDialog.ModalDialog {

// build a new dialog. If folder is null, the dialog will be for creating a new
// folder, else app is null, and the dialog will be for editing an existing folder
	_init (folder, app, id) {
		this._folder = folder;
		this._app = app;
		this._id = id;
		this.parent({ destroyOnClose: true });

		FOLDER_SCHEMA = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
		FOLDER_LIST = FOLDER_SCHEMA.get_strv('folder-children');

		let nameSection = this._buildNameSection();
		let categoriesSection = this._buildCategoriesSection();

		this.contentLayout.style = 'spacing: 20px';
		this.contentLayout.add(nameSection, {
			x_fill: false,
			x_align: St.Align.START,
			y_align: St.Align.START
		});
		if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('categories') ) {
			this.contentLayout.add(categoriesSection, {
				x_fill: false,
				x_align: St.Align.START,
				y_align: St.Align.START
			});
		}

		if (this._folder == null) {
			this.setButtons([
				{ action: Lang.bind(this, this.destroy),
				label: _("Cancel"),
				key: Clutter.Escape },
	
				{ action: Lang.bind(this, this._apply),
				label: _("Apply"),
				key: Clutter.Return }
			]);
		} else {
			this.setButtons([
				{ action: Lang.bind(this, this.destroy),
				label: _("Cancel"),
				key: Clutter.Escape },
	
				{ action: Lang.bind(this, this._deleteFolder),
				label: _("Delete"),
				key: Clutter.Delete },
	
				{ action: Lang.bind(this, this._apply),
				label: _("Apply"),
				key: Clutter.Return }
			]);
		}

		this._nameEntryText.connect('key-press-event', Lang.bind(this, function(o, e) {
			let symbol = e.get_key_symbol();

			if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
				this.popModal();
				this._apply();
			}
		}));
	}

// build the section of the UI handling the folder's name and returns it.
	_buildNameSection () {
		let nameSection = new St.BoxLayout({
			style: 'spacing: 5px;',
			vertical: true,
			x_expand: true,
			natural_width_set: true,
			natural_width: 350,
		});

		let nameLabel = new St.Label({
			text: _("Folder's name:"),
			style: 'font-weight: bold;',
		});
		nameSection.add(nameLabel, { y_align: St.Align.START });

		this._nameEntry = new St.Entry({
			x_expand: true,
		});
		this._nameEntryText = null; ///???
		this._nameEntryText = this._nameEntry.clutter_text;

		nameSection.add(this._nameEntry, { y_align: St.Align.START });
		ShellEntry.addContextMenu(this._nameEntry);
		this.setInitialKeyFocus(this._nameEntryText);

		if (this._folder != null) {
			this._nameEntryText.set_text(this._folder.get_string('name'));
		}

		return nameSection;
	}

// build the section of the UI handling the folder's categories and returns it.
	_buildCategoriesSection () {
		let categoriesSection = new St.BoxLayout({
			style: 'spacing: 5px;',
			vertical: true,
			x_expand: true,
			natural_width_set: true,
			natural_width: 350,
		});

		let categoriesLabel = new St.Label({
			text: _("Categories:"),
			style: 'font-weight: bold;',
		});
		categoriesSection.add(categoriesLabel, {
			x_fill: false,
			x_align: St.Align.START,
			y_align: St.Align.START,
		});

		let categoriesBox = new St.BoxLayout({
			style: 'spacing: 5px;',
			vertical: false,
			x_expand: true,
		});

		// at the left, how to add categories
		let addCategoryBox = new St.BoxLayout({
			style: 'spacing: 5px;',
			vertical: true,
			x_expand: true,
		});

		this._categoryEntry = new St.Entry({
			can_focus: true,
			x_expand: true,
			hint_text: _("Other category?"),
		});
		this._categoryEntry.set_secondary_icon(new St.Icon({ // 3.22 compatibility
			icon_name: 'list-add-symbolic',
			icon_size: 16,
			style_class: 'system-status-icon',
			y_align: Clutter.ActorAlign.CENTER,
		}));
		ShellEntry.addContextMenu(this._categoryEntry, null);
		this._categoryEntry.connect('secondary-icon-clicked', Lang.bind(this, this._addCategory));

		let catSelectBox = new St.BoxLayout({
			vertical: false,
			x_expand: true,
		});
		let catSelectLabel = new St.Label({
			text: _("Select a category…"),
			x_align: Clutter.ActorAlign.START,
			y_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
		});
		let catSelectIcon = new St.Icon({
			icon_name: 'pan-down-symbolic',
			icon_size: 16,
			style_class: 'system-status-icon',
			x_expand: false,
			x_align: Clutter.ActorAlign.END,
			y_align: Clutter.ActorAlign.CENTER,
		});
		catSelectBox.add(catSelectLabel, { y_align: St.Align.MIDDLE });
		catSelectBox.add(catSelectIcon, { y_align: St.Align.END });

		this._categoryEntryText = null; ///???
		this._categoryEntryText = this._categoryEntry.clutter_text;
		this._catSelectButton = new St.Button ({
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
			child: catSelectBox,
			style_class: 'button',
			style: 'padding: 5px 5px;',
			x_expand: true,
			y_expand: false,
			x_fill: true,
			y_fill: true,
		});
		// very stupid way to add a menu
		this._catMenu = new SelectCategoryButton(this._catSelectButton, this);

		addCategoryBox.add(this._catSelectButton, { y_align: St.Align.CENTER });
		addCategoryBox.add(this._categoryEntry, { y_align: St.Align.START });
		categoriesBox.add(addCategoryBox, {
			x_fill: true,
			x_align: St.Align.START,
			y_align: St.Align.START,
		});

		// at the right, a list of categories
		this.listContainer = new St.BoxLayout({
			vertical: true,
			x_expand: true,
		});
		this.noCatLabel = new St.Label({ text: _("No category") });
		this.listContainer.add_actor(this.noCatLabel);
		categoriesBox.add(this.listContainer, {
			x_fill: true,
			x_align: St.Align.END,
			y_align: St.Align.START,
		});

		categoriesSection.add(categoriesBox, {
			x_fill: true,
			x_align: St.Align.START,
			y_align: St.Align.START,
		});

		// Load categories is necessary even if no this._folder,
		// because it initializes the value of this._categories
		this._loadCategories();

		return categoriesSection;
	}

// returns if a folder id already exists
	_alreadyExists (folderId) {
		for(var i = 0; i < FOLDER_LIST.length; i++) {
			if (FOLDER_LIST[i] == folderId) {
//				this._showError( _("This appfolder already exists.") );
				return true;
			}
		}
		return false;
	}

	destroy () {
		if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('debug') ) {
			log('[AppfolderDialog v2] destroying dialog');
		}
		// TODO ?
		this.parent();
	}

// Generates a valid folder id, which as no space, no dot, no slash, and which
// doesn't already exist.
	_folderId (newName) {
		let tmp0 = newName.split(" ");
		let folderId = "";
		for(var i = 0; i < tmp0.length; i++) {
			folderId += tmp0[i];
		}
		tmp0 = folderId.split(".");
		folderId = "";
		for(var i = 0; i < tmp0.length; i++) {
			folderId += tmp0[i];
		}
		tmp0 = folderId.split("/");
		folderId = "";
		for(var i = 0; i < tmp0.length; i++) {
			folderId += tmp0[i];
		}
		if(this._alreadyExists(folderId)) {
			folderId = this._folderId(folderId+'_');
		}
		return folderId;
	}

// creates a folder from the data filled by the user (with no properties)
	_create () {
		let folderId = this._folderId(this._nameEntryText.get_text());

		FOLDER_LIST.push(folderId);
		FOLDER_SCHEMA.set_strv('folder-children', FOLDER_LIST);

		this._folder = new Gio.Settings({
			schema_id: 'org.gnome.desktop.app-folders.folder',
			path: '/org/gnome/desktop/app-folders/folders/' + folderId + '/'
		});
	//	this._folder.set_string('name', this._nameEntryText.get_text()); //superflu
	//	est-il nécessaire d'initialiser la clé apps à [] ??
		this._addToFolder();
	}

// sets the name to the folder
	_applyName () {
		let newName = this._nameEntryText.get_text();
		this._folder.set_string('name', newName); // génère un bug ?
		return Clutter.EVENT_STOP;
	}

// loads categories, as set in gsettings, to the UI
	_loadCategories () {
		if (this._folder == null) {
			this._categories = [];
		} else {
			this._categories = this._folder.get_strv('categories');
			if ((this._categories == null) || (this._categories.length == 0)) {
				this._categories = [];
			} else {
				this.noCatLabel.visible = false;
			}
		}
		this._categoriesButtons = [];
		for (var i = 0; i < this._categories.length; i++) {
			this._addCategoryBox(i);
		}
	}

	_addCategoryBox (i) {
		let aCategory = new AppCategoryBox(this, i);
		this.listContainer.add_actor(aCategory);
	}

// adds a category to the UI (will be added to gsettings when pressing "apply" only)
	_addCategory (entry, new_cat_name) {
		if (new_cat_name == null) {
			new_cat_name = this._categoryEntryText.get_text();
		}
		if (this._categories.indexOf(new_cat_name) != -1) {
			return;
		}
		if (new_cat_name == '') {
			return;
		}
		this._categories.push(new_cat_name);
		this._categoryEntryText.set_text('');
		this.noCatLabel.visible = false;
		this._addCategoryBox(this._categories.length-1);
	}

// adds all categories to gsettings
	_applyCategories () {
		this._folder.set_strv('categories', this._categories);
		return Clutter.EVENT_STOP;
	}

// Apply everything by calling methods above, and reload the view
	_apply () {
		if (this._app != null) {
			this._create();
		//	this._addToFolder();
		}
		this._applyCategories();
		this._applyName();
		this.destroy();
		//-----------------------
		Main.overview.viewSelector.appDisplay._views[1].view._redisplay();
		if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('debug') ) {
			log('[AppfolderDialog v2] reload the view');
		}
	}

// initializes the folder with its first app. This is not optional since empty
// folders are not displayed. TODO use the equivalent method from extension.js
	_addToFolder () {
		let content = this._folder.get_strv('apps');
		content.push(this._app);
		this._folder.set_strv('apps', content);
	}

// Delete the folder, using the extension.js method
	_deleteFolder () {
		if (this._folder != null) {
			Extension.deleteFolder(this._id);
		}
		this.destroy();
	}
}

//------------------------------------------------

/* Very complex way to have a menubutton for displaying a menu with standard
 * categories. Button part.
 */
var SelectCategoryButton = new Lang.Class({
	Name: 'SelectCategoryButton',

	_init:	function(bouton, dialog){
		this.actor = bouton;
		this._dialog = dialog;
		this.actor.connect('button-press-event', Lang.bind(this, this._onButtonPress));
		this._menu = null;
		this._menuManager = new PopupMenu.PopupMenuManager(this);
	},

	_onMenuPoppedDown:	function() {
		this.actor.sync_hover();
		this.emit('menu-state-changed', false);
	},

	popupMenu:	function() {
		this.actor.fake_release();
		if (!this._menu) {
			this._menu = new SelectCategoryMenu(this, this._dialog);
			this._menu.connect('open-state-changed', Lang.bind(this, function (menu, isPoppedUp) {
				if (!isPoppedUp)
					this._onMenuPoppedDown();
			}));
			this._menuManager.addMenu(this._menu);
		}
		this.emit('menu-state-changed', true);
		this.actor.set_hover(true);
		this._menu.popup();
		this._menuManager.ignoreRelease();
		return false;
	},

	_onButtonPress:	function(actor, event) {
		this.popupMenu();
		return Clutter.EVENT_STOP;
	},
});
Signals.addSignalMethods(SelectCategoryButton.prototype);

//------------------------------------------------

/* Very complex way to have a menubutton for displaying a menu with standard
 * categories. Menu part.
 */
const SelectCategoryMenu = new Lang.Class({
	Name: 'SelectCategoryMenu',
	Extends: PopupMenu.PopupMenu,

	_init:	function(source, dialog) {
		this.parent(source.actor, 0.5, St.Side.RIGHT);
		this._source = source;
		this._dialog = dialog;
		this.actor.add_style_class_name('app-well-menu');
		this._source.actor.connect('destroy', Lang.bind(this, this.destroy));

		// We want to keep the item hovered while the menu is up
		this.blockSourceEvents = true;

		Main.uiGroup.add_actor(this.actor);
	},

	_redisplay:	function() {
		this.removeAll();
		let mainCategories = ['AudioVideo','Audio','Video','Development','Education','Game',
			'Graphics','Network','Office','Science','Settings','System','Utility'];

		for (var i = 0; i < mainCategories.length; i++) {
			let labelItem = mainCategories[i] ;
			let item = new PopupMenu.PopupMenuItem( labelItem );
			item.connect('activate', Lang.bind(this, function(a, b, c) {
				this._dialog._addCategory(null, c);
			}, mainCategories[i]));
 			this.addMenuItem(item);
		}
	},

	popup:	function(activatingButton) {
		this._redisplay();
		this.open();
	},
});
Signals.addSignalMethods(SelectCategoryMenu.prototype);

//----------------------------------------

/* This custom widget is a deletable row, displaying a category name.
 */
const AppCategoryBox = new Lang.Class({
	Name: 'AppCategoryBox',
	Extends: St.BoxLayout,

	_init:	function (dialog, i) {
		this.parent({
			vertical: false,
			style: 'background-color: rgba(100, 100, 100, 0.3); border-radius: 3px; margin: 3px; padding: 2px; padding-left: 6px;',
		});
		this._dialog = dialog;
		this.catName = this._dialog._categories[i];
		this.add_actor(new St.Label({
			text: this.catName,
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.CENTER,
		}));
		this.add_actor(new St.BoxLayout({
			x_expand: true
		}));
		this.deleteButton = new St.Button({
			x_expand: false,
			y_expand: true,
//			style_class: '',
			style: 'background-color: rgba(100, 100, 100, 0.3); border-radius: 3px;',
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.CENTER,
			child: new St.Icon({
				icon_name: 'edit-delete-symbolic',
				icon_size: 16,
				style_class: 'system-status-icon',
				x_expand: false,
				y_expand: true,
				style: 'margin: 3px;',
				y_align: Clutter.ActorAlign.CENTER,
				x_align: Clutter.ActorAlign.CENTER,
			}),
		});
		this.add_actor(this.deleteButton);
		this.deleteButton.connect('clicked', Lang.bind(this, this.removeFromList));
	},

	removeFromList:	function () {
		this._dialog._categories.splice(this._dialog._categories.indexOf(this.catName), 1);
		if (this._dialog._categories.length == 0) {
			this._dialog.noCatLabel.visible = true;
		}
		this.destroy();
	},

	destroy:	function () {
		this.deleteButton.destroy();
		this.parent();
	},
});

