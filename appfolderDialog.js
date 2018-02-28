
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;
const PopupMenu = imports.ui.popupMenu;

const Gtk = imports.gi.Gtk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const ShellEntry = Me.imports.shellEntryWhichFckingWorks;

const Gettext = imports.gettext.domain('appfolders-manager');
const _ = Gettext.gettext;

//-------------------------------------------------

let FOLDER_SCHEMA;
let FOLDER_LIST;
let SETTINGS;

function init() {
	Convenience.initTranslations();
}

//--------------------------------------------------------------

/* this will construct a modal dialog for creating, renaming or modifying categories of existing folders.
 * Methods are:
 * _init(folder, app)
 * TODO
 * etc.
 */
var AppfolderDialog = new Lang.Class({
	Name: 'AppfolderDialog',
	Extends: ModalDialog.ModalDialog,

	_init: function(folder, app) {
			
		FOLDER_SCHEMA = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
		FOLDER_LIST = FOLDER_SCHEMA.get_strv('folder-children');
		
		let nameLabel = new St.Label({
			text: _("Folder's name:"),
			style: 'font-weight: bold;',
//			style_class: 'run-dialog-label',
		});
		let categoriesLabel = new St.Label({
			text: _("Categories:"),
			style: 'font-weight: bold;',
//			style_class: 'run-dialog-label',
		});
		
		this._folder = folder;
		this._app = app;
		
		this.parent({
			destroyOnClose: true
		});
		
		this.contentLayout.style = 'spacing: 5px';
		this.contentLayout.add(nameLabel, {
			x_fill: false,
			x_align: St.Align.START,
			y_align: St.Align.START
		});
		
		this._nameEntry = new St.Entry({
			can_focus: true,
			natural_width_set: true,
			natural_width: 300
		});
		this._nameEntryText = null; ///???
		this._nameEntryText = this._nameEntry.clutter_text;
		this.contentLayout.add(this._nameEntry, { y_align: St.Align.START });
		ShellEntry.addContextMenu(this._nameEntry);
		this.setInitialKeyFocus(this._nameEntryText);
		
		//----------------------
		
		// empty box, just for artificial spacing
		this.contentLayout.add(new St.BoxLayout({natural_height: 15}));
		
		//----------------------
		
		this.contentLayout.add(categoriesLabel, {
			x_fill: false,
			x_align: St.Align.START,
			y_align: St.Align.START,
		});
		this.listContainer = new St.BoxLayout({
			vertical: true,
		});
		
		this.noCatLabel = new St.Label({ text: _("No category") });
		this.listContainer.add_actor(this.noCatLabel);
		
		this.contentLayout.add(this.listContainer, {
			x_fill: true,
			x_align: St.Align.START,
			y_align: St.Align.START,
		});
		this._categoryBox = new St.BoxLayout({
			reactive: true,
			vertical: false,
		});
		this._categoryEntry = new St.Entry({
			can_focus: true,
			natural_width_set: true,
			natural_width: 200,
			x_expand: true,
			secondary_icon: new St.Icon({
				icon_name: 'pan-down-symbolic',
				icon_size: 16,
				style_class: 'system-status-icon',
				y_align: Clutter.ActorAlign.CENTER,
			}),
		});
		this._categoryEntryText = null; ///???
		this._categoryEntryText = this._categoryEntry.clutter_text;
		this._catAddButton = new St.Button ({
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
			label: _("Add"),
			style_class: 'button',
			can_focus: true,
			track_hover: true,
			y_expand: false,
			y_fill: true
		});
		this._categoryBox.add(this._categoryEntry);
		this._categoryBox.add(this._catAddButton);
		this.contentLayout.add(this._categoryBox, { y_align: St.Align.START });
		ShellEntry.addContextMenu(this._categoryEntry);
		
		this.addCategorySubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Add a category"));
		let mainCategories = ['AudioVideo','Audio','Video','Development','Education','Game',
			'Graphics','Network','Office','Science','Settings','System','Utility'];
			
		for (var i = 0; i < mainCategories.length; i++) {
			let labelItem = mainCategories[i] ;
			let item = new PopupMenu.PopupMenuItem( labelItem );
			item.connect('activate', Lang.bind(this, function(a, b, c, d) {
				d.set_text(c);
			}, mainCategories[i], this._categoryEntryText));
 			this.addCategorySubmenu.menu.addMenuItem(item);
		}
		this._categoryEntry.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		this._categoryEntry.menu.addMenuItem(this.addCategorySubmenu);
		this._categoryEntry.connect('secondary-icon-clicked', Lang.bind(this, this._openMenu));
		
		this._catAddButton.connect('clicked', Lang.bind(this, this._addCategory));
		
		if (this._folder != null) {
			this._nameEntryText.set_text(this._folder.get_string('name'));
		}
		// Load categories is necessary even if no this._folder,
		// because it initializes the value of this._categories
		this._loadCategories();
		
		this._nameEntryText.connect('text-changed', Lang.bind(this, function() {
			if (this._errorBox.visible) {
				this._errorBox.hide();
			}
		}));
			
		this._errorBox = new St.BoxLayout({ style_class: 'run-dialog-error-box' });
		this.contentLayout.add(this._errorBox, { expand: true });

		let errorIcon = new St.Icon({
			icon_name: 'dialog-error-symbolic',
			icon_size: 24, style_class: 'run-dialog-error-icon'
		});
		this._errorBox.add(errorIcon, { y_align: St.Align.MIDDLE });
		
		this._errorMessage = new St.Label({ style_class: 'run-dialog-error-label' });
		this._errorMessage.clutter_text.line_wrap = true;
		this._errorBox.add(
			this._errorMessage, {
				expand: true,
				x_align: St.Align.START, x_fill: false,
				y_align: St.Align.MIDDLE, y_fill: false
			}
		);
		
		this._errorBox.hide();
		
		this.setButtons([
			{ action: Lang.bind(this, this.destroy),
			label: _("Cancel"),
			key: Clutter.Escape },
			
			{ action: Lang.bind(this, this._apply),
			label: _("Apply"),
			key: Clutter.Return }
		]);
		
		this._nameEntryText.connect('key-press-event', Lang.bind(this, function(o, e) {
			let symbol = e.get_key_symbol();
			
			if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
				this.popModal();
				this._apply();
			}
		}));
	},

	_alreadyExists: function (folderId) {
		for(var i = 0; i < FOLDER_LIST.length; i++) {
			if (FOLDER_LIST[i] == folderId) {
//				this._showError( _("This appfolder already exists.") );
				return true;
			}
		}
		return false;
	},
	
	//	There is no point showing the error anymore but i keep that here
//	_showError : function (message) {
//		this._errorMessage.set_text(message);

//		if (!this._errorBox.visible) {
//			this._errorBox.show();
//		}
//	},

	destroy: function () {
		if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('experimental') ) {
			log('[AppfolderDialog v2] destroying dialog');
		}
		this.parent();
	},
	
	//---------------------------------------
	
	_folderId : function (newName) {
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
	},

	_create: function () {
		let folderId = this._folderId(this._nameEntryText.get_text());

		FOLDER_LIST.push(folderId);
		
		FOLDER_SCHEMA.set_strv('folder-children', FOLDER_LIST);
		
		this._folder = new Gio.Settings({
			schema_id: 'org.gnome.desktop.app-folders.folder',
			path: '/org/gnome/desktop/app-folders/folders/' + folderId + '/'
		});
//		this._folder.set_string('name', this._nameEntryText.get_text()); //superflu
	//	est-il nécessaire d'initialiser la clé apps à [] ??
		
		this._addToFolder();
	},
	
	//---------------------------------------
	
	_applyName: function () {
		let newName = this._nameEntryText.get_text();
		this._folder.set_string('name', newName); // génère un bug ?
		return Clutter.EVENT_STOP;
	},

	//---------------------------------------

	_loadCategories: function() {
		if (this._folder == null) {
			this._categories = [];
		} else {
			this._categories = this._folder.get_strv('categories');
			if ((this._categories == null) || (this._categories.length == 0)) {
				this._categories = [];
			} else {
				this.noCatLabel.visible = false; //FIXME plus loin il faut le re-rendre visible
			}
		}
		this._categoriesButtons = [];
		for (var i = 0; i < this._categories.length; i++) {
			this._addCategoryBox(i);
		}
	},
	
	_addCategoryBox: function(i) {
		let aCategory = new St.BoxLayout({
			vertical: false,
//			style_class: '', //FIXME
//			style: 'border-color: white; border-width: 1px; border-radius: 3px; margin: 3px; spacing: 3px;',
			style: 'background-color: rgba(100, 100, 100, 0.3); border-radius: 3px; margin: 3px; padding: 2px; padding-left: 6px;',
		 });
		aCategory.add_actor(new St.Label({
			text: this._categories[i],
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.CENTER,
		}));
		aCategory.add_actor(new St.BoxLayout({
			x_expand: true
		}));
		let aButton = new St.Button({
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
		aCategory.add_actor(aButton);
		
		aButton.connect('clicked', Lang.bind(this, function(a, b, c, d, e) {
			c._categories.splice(d, 1);
			e.destroy();
		}, this, i, aCategory));
		this.listContainer.add_actor(aCategory);
	},
	
	_addCategory: function() {
		let newC = this._categoryEntryText.get_text();
		this._categories.push(newC);
		this._addCategoryBox(this._categories.length-1);
	},
	
	_applyCategories: function () {
		this._folder.set_strv('categories', this._categories);
		return Clutter.EVENT_STOP;
	},
	
	_apply: function() {
		if (this._app != null) {
			this._create();
//			this._addToFolder();
		}
		this._applyCategories();
		this._applyName();
		this.destroy();
		//-----------------------
		Main.overview.viewSelector.appDisplay._views[1].view._redisplay(); //FIXME ça vomit des criticals ça
		if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('experimental') ) {
			log('[AppfolderDialog v2] reload the view');
		}
	},
	
	_addToFolder: function() {
		let content = this._folder.get_strv('apps');
		content.push(this._app);
		this._folder.set_strv('apps', content);
	},
	
	_openMenu: function () {
		this._categoryEntry.menu.open();
		this.addCategorySubmenu.menu.open();
	},
});

