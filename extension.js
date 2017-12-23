/* TODO
	faire 2 fichiers ?
	le dnd
*/

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const AppDisplay = imports.ui.appDisplay;
const PopupMenu = imports.ui.popupMenu;

const Mainloop = imports.mainloop;

const ModalDialog = imports.ui.modalDialog;
const ShellEntry = imports.ui.shellEntry;
const Overview = imports.ui.overview;

const Signals = imports.signals;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const Gettext = imports.gettext.domain('appfolders-manager');
const _ = Gettext.gettext;

//-------------------------------------------------

let FOLDER_SCHEMA;
let FOLDER_LIST;
let SETTINGS;

function init() {
	Convenience.initTranslations();
}

//-------------------------------------------------
/* do not edit this section */

function injectToFunction(parent, name, func) {
	let origin = parent[name];
	parent[name] = function() {
		let ret;
		ret = origin.apply(this, arguments);
			if (ret === undefined)
				ret = func.apply(this, arguments);
			return ret;
		}
	return origin;
}

function removeInjection(object, injection, name) {
	if (injection[name] === undefined)
		delete object[name];
	else
		object[name] = injection[name];
}

let injections=[];

//--------------------------------------------------------------

/* this will construct a modal dialog for creating, renaming or modifying categories of existing folders.
 * the dialog can have different labels/right-buttons/actions depending on arguments given at its creation.
 * Methods are:
 * _init(mainLabel, labelOfTheButton, actionOfTheButton, parameterForThisAction)
 * _function() // linking the button on the right to the correct action
 * _addfolder() // action when it's a "create appfolder" dialog
 * _rename() //  action when it's a "rename appfolder" dialog 
 * _addCategory() // action when it's a "add custom category" dialog
 * _create(newName, appId) // called by _addfolder
 * _folderId(newName) // called by _create and return an acceptable id for the appfolder
 * etc.
 */
const AppfolderDialog = new Lang.Class({
	Name: 'AppfolderDialog',
	Extends: ModalDialog.ModalDialog,

	_init: function(rawlabel, buttonLabel, buttonFunction, functionParameter) {
		
		let label = new St.Label({ text: rawlabel });
		
		this._buttonFunction = buttonFunction;
		this._functionParameter = functionParameter;
		
		this.parent({
			styleClass: 'run-dialog',
			destroyOnClose: true
		});
		
		this.contentLayout.add(label, {
			x_fill: false,
			x_align: St.Align.START,
			y_align: St.Align.START
		});
		
		this._entry = new St.Entry({
			can_focus: true,
			natural_width_set: true,
			natural_width: 250
		});
		
		ShellEntry.addContextMenu(this._entry);
		
		this._entryText = null; ///???
		this._entryText = this._entry.clutter_text;
		
		if (buttonFunction == 'rename') {
			this._entryText.set_text(this._functionParameter.get_string('name'));
		}
		
		this.contentLayout.add(this._entry, { y_align: St.Align.START });
		this.setInitialKeyFocus(this._entryText);
		
		this._entryText.connect('text-changed', Lang.bind(this, function() {
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
			
			{ action: Lang.bind(this, this._function),
			label: buttonLabel,
			key: Clutter.Return }
		]);
		
		this._entryText.connect('key-press-event', Lang.bind(this, function(o, e) {
			let symbol = e.get_key_symbol();
			
			if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
				this.popModal();
				log('149');
				this._function();
			}
		}));
	},
	
	_function: function () {
		switch (this._buttonFunction) {
			case 'rename':
				this._rename();
				break;
			case 'create':
				this._addfolder();
				break;
			case 'add-category':
				this._addCategory();
				break;
			default:
				log('[AppfolderDialog] incorrect parameter');
				break;
		}
	},
	
	open: function () {
		this.parent();
	},

	_alreadyExists: function (folderId) {
		for(var i = 0; i < FOLDER_LIST.length; i++) {
			if (FOLDER_LIST[i] == folderId) {
				this._showError( _("This appfolder already exists.") );
				return true;
			}
		}
		return false;
	},
	
	_showError : function (message) {
		this._errorMessage.set_text(message);

		if (!this._errorBox.visible) {
			this._errorBox.show();
		}
	},

	destroy: function () {
		log('destroying');
		this.parent();
	},
	
	//---------------------------------------
	
	_addfolder: function () {
		this._create(this._entryText.get_text(), this._functionParameter);
		if (!this._errorBox.visible) {
			this.destroy();
			return Clutter.EVENT_STOP;
		}
		return null;
	},

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
		return folderId;
	},

	_create: function (newName, appId) {
		let folderId = this._folderId(newName);
		if (this._alreadyExists(folderId)) {
			return;
		}
		
		FOLDER_LIST.push(folderId);
		
		FOLDER_SCHEMA.set_strv('folder-children', FOLDER_LIST);
		
		let tmp1 = new Gio.Settings({
			schema_id: 'org.gnome.desktop.app-folders.folder',
			path: '/org/gnome/desktop/app-folders/folders/' + folderId + '/'
		});
		tmp1.set_string('name', newName);
		
		addToFolder(appId, folderId);
	},
	
	//---------------------------------------
	
	_rename: function () {
		let newName = this._entryText.get_text();
		this.destroy();
		this._functionParameter.set_string('name', newName); // génère un bug ?
		return Clutter.EVENT_STOP;
	},

	//---------------------------------------

	_addCategory: function () {
		addCategory( this._entryText.get_text(), this._functionParameter );
		this.destroy();
		reload();
		return Clutter.EVENT_STOP;
	},
	
});

//-----------------------------------------------------------------

/* this class represents menus opened when right click on an appfolder.
 * Methods are:
 * _init(source)
 * _redisplay()
 * _appendMenuItem(labelText)
 * _appendSeparator()
 * popup()
 * popdown()
 */
const FolderIconMenu = new Lang.Class({
	Name: 'FolderIconMenu',
	Extends: PopupMenu.PopupMenu,

	_init: function(source) {
		//inspiré du menu originel des applications
		let side = St.Side.LEFT;
		if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL)
			side = St.Side.RIGHT;
		
		this.parent(source.actor, 0.5, side);
		this.blockSourceEvents = true;
		this._source = source;
		this.actor.add_style_class_name('app-well-menu');
		
		source.actor.connect('notify::mapped', Lang.bind(this, function () {
			if (!source.actor.mapped)
				this.close();
		}));
		source.actor.connect('destroy', Lang.bind(this, this.destroy));
		
		Main.uiGroup.add_actor(this.actor);
	},

	_redisplay: function() {
		this.removeAll();
		
		let addCategorySubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Add a category"));
		
		let mainCategories = ['AudioVideo','Audio','Video','Development','Education','Game',
			'Graphics','Network','Office','Science','Settings','System','Utility'];
		
		let id = this._source.id;
		
		let tmp = new Gio.Settings({
			schema_id: 'org.gnome.desktop.app-folders.folder',
			path: '/org/gnome/desktop/app-folders/folders/' + id + '/'
		});
		
		for (var i = 0; i < mainCategories.length; i++) {
			let labelItem = mainCategories[i] ;
			let item = new PopupMenu.PopupMenuItem( labelItem );
			
			item.connect('activate', Lang.bind(this, function() {
				popdownAll();
				addCategory (labelItem, tmp);
				reload();
			}));
 			addCategorySubmenu.menu.addMenuItem(item);
		}
		
		let item = new PopupMenu.PopupMenuItem( "+ " + _("Additional categories") );
		item.connect('activate', Lang.bind(this, function() {
			popdownAll();
			let dialog = new AppfolderDialog( _("Enter the name of a category"), _("Add"), 'add-category', tmp);
			dialog.open();
		}));
		addCategorySubmenu.menu.addMenuItem(item);
		
		this.addMenuItem(addCategorySubmenu);
		
		//--------------
		
		let content = tmp.get_strv('categories');
		
		if ((content != null) && (content != []) && (content[0] != undefined)) {
			
			let removeCategorySubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Remove a category"));
			
			for (var i = 0; i < content.length; i++) {
				let labelItem = content[i] ;
				let item = new PopupMenu.PopupMenuItem( labelItem );
				item.connect('activate', Lang.bind(this, function() {
					popdownAll();
					let presentContent = [];
					for(i=0;i<content.length;i++){
						if(content[i] != labelItem) {
							presentContent.push(content[i]);
						}
					}
					tmp.set_strv('categories', presentContent);
					reload();
				}));
				removeCategorySubmenu.menu.addMenuItem(item);
			}
			this.addMenuItem(removeCategorySubmenu);
		}
		
		this._appendSeparator();
		
//		if (SETTINGS.get_boolean('experimental') ) {
			let renameItem = this._appendMenuItem(_("Rename"));
			renameItem.connect('activate', Lang.bind(this, function() {
				let dialog = new AppfolderDialog( _("Enter a name"), _("Rename"), 'rename', this._source._folder);
				dialog.open();
			}));
//		}
		
		let deleteItem = this._appendMenuItem(_("Delete"));
		deleteItem.connect('activate', Lang.bind(this, function() {
			
			let tmp = [];
			for(var j=0;j<FOLDER_LIST.length;j++){
				if(FOLDER_LIST[j] == this._source.id) {}
				else {
					tmp.push(FOLDER_LIST[j]);
				}
			}
			
			FOLDER_SCHEMA.set_strv('folder-children', tmp);
			
			if ( SETTINGS.get_boolean('total-deletion') ) {
				this._source._folder.reset('apps');
				this._source._folder.reset('categories');
//				if (SETTINGS.get_boolean('experimental') ) {
					this._source._folder.reset('name'); // génère un bug
//				}
			}
			
			disable();// le but est de mettre à jour ce qui est injecté dans le menu des appicons
			enable();
		}));
	},

	_appendSeparator: function () {
		let separator = new PopupMenu.PopupSeparatorMenuItem();
		this.addMenuItem(separator);
	},

	_appendMenuItem: function(labelText) {
		let item = new PopupMenu.PopupMenuItem(labelText);
		this.addMenuItem(item);
		return item;
	},

	popup: function() {
		this._redisplay();
		this.open();
	},

	popdown: function() {
		this.close();
		this.destroy();
	}
});
Signals.addSignalMethods(FolderIconMenu.prototype);

//---------------------------------------------------------------------------

/* this function injects items (1 or 2 submenus) in AppIconMenu's _redisplay method. */
function injectionInAppsMenus() {
	injections['_redisplay'] = injectToFunction(AppDisplay.AppIconMenu.prototype, '_redisplay', function(){
		
		if (Main.overview.viewSelector.getActivePage() == 2 || Main.overview.viewSelector.getActivePage() == 3) {
			this._appendSeparator();
			
			let addto = new PopupMenu.PopupSubMenuMenuItem(_("Add to"));
			
			let newAppFolder = new PopupMenu.PopupMenuItem('+ ' + _("New AppFolder"));
			newAppFolder.connect('activate', Lang.bind(this, function() {
				let id = this._source.app.get_id();
				popdownAll();
				let dialog = new AppfolderDialog( _("Enter a name"), _("Create"), 'create', id);
				dialog.open();
			}));
			addto.menu.addMenuItem(newAppFolder);
			
			for (var i = 0 ; i < FOLDER_LIST.length ; i++) {
				let _folder = FOLDER_LIST[i];
				let _tmp = new Gio.Settings({
					schema_id: 'org.gnome.desktop.app-folders.folder',
					path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
				});
				
				let shouldShow = !isInFolder( this._source.app.get_id(), _tmp );
				let item = new PopupMenu.PopupMenuItem( AppDisplay._getFolderName( _tmp ) );
				
				if(shouldShow) {
					item.connect('activate', Lang.bind(this, function() {
						let id = this._source.app.get_id();
						popdownAll();
						addToFolder(id, _folder);
					}));
					addto.menu.addMenuItem(item);
				}
			}
			this.addMenuItem(addto);
			
			let removeFrom = new PopupMenu.PopupSubMenuMenuItem(_("Remove from"));
			let shouldShow2 = false;
			for (var i = 0 ; i < FOLDER_LIST.length ; i++) {
				let _folder = FOLDER_LIST[i];
				
				let id = this._source.app.get_id();
				
				let _tmp = new Gio.Settings({
					schema_id: 'org.gnome.desktop.app-folders.folder',
					path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
				});
				
				let item = new PopupMenu.PopupMenuItem( AppDisplay._getFolderName( _tmp ) );
				
				let shouldShow = isInFolder(id, _tmp);
				
				if(shouldShow) {
					item.connect('activate', Lang.bind(this, function() {
						popdownAll();
						let tmp = new Gio.Settings({
							schema_id: 'org.gnome.desktop.app-folders.folder',
							path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
						});
						
						let pastContent = tmp.get_strv('apps');
						let presentContent = [];
						for(i=0;i<pastContent.length;i++){
							if(pastContent[i] != id) {
								presentContent.push(pastContent[i]);
							}
						}
						tmp.set_strv('apps', presentContent);
						
						reload();
					}));
					removeFrom.menu.addMenuItem(item);
					shouldShow2 = true;
				}
			}
			if (shouldShow2) {
				this.addMenuItem(removeFrom);
			}
		}
	});
}

//---------------------------------------------------------------------------------------------------

/* this function builds menus on appfolders when right click on them, using FolderIconMenu objects. */
function createFolderMenus() {
	
	if (!AppDisplay.FolderIcon.injections) {
	
		AppDisplay.FolderIcon.prototype.injections = true;
		
		AppDisplay.FolderIcon.prototype.popupMenu = function () {
			this.actor.fake_release(); // qu'est-ce?
			if (!this._menu) {
				this._menu = new FolderIconMenu(this);
				this._menuManager.addMenu(this._menu);
			}
			this.emit('menu-state-changed', true);
			this.actor.set_hover(true);
			this._menu.popup();
			this._menuManager.ignoreRelease(); // qu'est-ce?
			return false;
		}
	
		AppDisplay.FolderIcon.prototype._onButtonPress = function (actor, event) {
			let button = event.get_button();
			if (button == 1) {
				if(this._menu)
					this._menu.close();
				//	this._menu.destroy();
			} else if (button == 3) {
				this.popupMenu();
				return Clutter.EVENT_STOP;
			}
			return Clutter.EVENT_PROPAGATE;
		}
	
		if (injections['_init']) {
			removeInjection(AppDisplay.FolderIcon.prototype, injections, '_init');
		}
		
		injections['_init'] = injectToFunction(AppDisplay.FolderIcon.prototype, '_init', function(){
			this._menu = null;
			this._menuManager = new PopupMenu.PopupMenuManager(this);
			this.actor.connect('button-press-event', Lang.bind(this, this._onButtonPress));
		});
	}
}

//--------------------------------------------------------------

function addCategory( categoryName, schema ) {
	let content = schema.get_strv('categories');
	if (content == null) {
		content = [];
	}
	
	content.push( categoryName );
	schema.set_strv('categories', content);
	return null;
}

//-----------------------------------------------------------------------------

function isInFolder (id, folder) {
	let isIn = false;
	let content_ = folder.get_strv('apps');
	for(var j=0;j<content_.length;j++){
		if(content_[j] == id) {
			isIn = true;
		}
	}
	return isIn;
}

//-------------------------------------------------

function addToFolder(id, folder) {
	let path = '/org/gnome/desktop/app-folders/folders/' + folder + '/';
	let tmp2 = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders.folder', path: path });
	
	let content = tmp2.get_strv('apps');
	content.push(id);
	tmp2.set_strv('apps', content);
	reload();
}

//-------------------------------------------------

function reload() {

	Main.overview.viewSelector.appDisplay._views[1].view._redisplay();
	log('reload the view');
}

//-------------------------------------------------

function popdownAll() {	
	Main.overview.viewSelector.appDisplay._views[1].view.emit('open-state-changed', false);
	
	let _folderIcons = Main.overview.viewSelector.appDisplay._views[1].view.folderIcons;
	_folderIcons.forEach(function(i){
		if(i._popup){
			if (i._popup._isOpen){
				i._popup._boxPointer.hide();
				i._popup._isOpen = false;
				i._popup.emit('open-state-changed', false);
			}
		}
	});
}

//----------------------------------------------------

function enable() {
	SETTINGS = Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager');

	FOLDER_SCHEMA = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
	FOLDER_LIST = FOLDER_SCHEMA.get_strv('folder-children');

	injectionInAppsMenus();
	
	createFolderMenus();
}

//-------------------------------------------------

function disable() {
	
	AppDisplay.FolderIcon.prototype._onButtonPress = null;//undefined;
	AppDisplay.FolderIcon.prototype.popupMenu = null;//undefined;
	
	removeInjection(AppDisplay.AppIconMenu.prototype, injections, '_redisplay');
	removeInjection(AppDisplay.FolderIcon.prototype, injections, '_init');
}

//-------------------------------------------------
