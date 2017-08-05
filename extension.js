/* TODO
	se débarasser de folderIconSchema
	les signaux
	faire 2 fichiers ?
	4, 8, puis 10 (gnome-shell:8062): Clutter-CRITICAL divers
	Celui qui augmente étant clutter_actor_remove_child: assertion 'child->priv->parent != NULL' failed
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
/* i should get rid of those turdish global variables */

let _foldersSchema;
let _folderList;
let _settings;

let folderIconSchema = null;

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

/* this class is an empty dialog window, without buttons, methods are:
 * _init(label)
 * open()
 * _showError(message)
 * destroy()
 */
const BaseDialog = new Lang.Class({
	Name: 'BaseDialog',
	Extends: ModalDialog.ModalDialog,

	_init: function(label) {
		
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
	},
	
	open: function () {
		this.parent();
	},

	_showError : function (message) {
		this._errorMessage.set_text(message);

		if (!this._errorBox.visible) {
			this._errorBox.show();
		}
	},

	destroy: function () {
		//log('destroying a basedialog object');
		this.parent();
	},
});

//-------------------------------------------------

/* this class build an abstract dialog window, using a BaseDialog attribute named this.dialog ;
 * Methods are:
 * _init(label)
 * _alreadyExists(folderId)
 * open()
 * _showError(message)
 * destroy()
 */
const GenericDialog = new Lang.Class({
	Name: 'GenericDialog',
	Abstract: true,

	_init: function(label) {
		closeAllMenus();
		this.dialog = new BaseDialog( label );
	},

	_alreadyExists: function (folderId) {
		for(var i = 0; i < _folderList.length; i++) {
			if (_folderList[i] == folderId) {
				this.dialog._showError( _("This appfolder already exists.") );
				return true;
			}
		}
		return false;
	},

	open: function () {
		this.dialog.open();
	},

	_showError : function (message) {
		this.dialog._showError(message);
	},

	destroy: function () {
		this.dialog.destroy();
	},
});

//-------------------------------------------------

/* this class build a concrete dialog window, for appfolder creation.
 * Methods are:
 * _init(id)
 * _addfolder()
 * _create(newName, id)
 * open()
 * [from GenericDialog] _alreadyExists(folderId)
 * [from GenericDialog] _showError(message)
 * destroy()
 */
const createFolderDialog = new Lang.Class({
	Name: 'createFolderDialog',
	Extends: GenericDialog,

	_init: function(id) {
		let label = new St.Label({ text: _("Enter a name") });
		this.parent(label);
		
		this._firstItem = id;
		
		this.dialog.setButtons([
			{ action: Lang.bind(this, this.destroy),
			label: _("Cancel"),
			key: Clutter.Escape },
			
			{ action: Lang.bind(this, this._addfolder),
			label: _("Create"),
			key: Clutter.Return }
		]);
		
		this.dialog._entryText.connect('key-press-event', Lang.bind(this, function(o, e) {
			let symbol = e.get_key_symbol();
			
			if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
				this.dialog.popModal();
				this._addfolder();
			}
		}));
	},

	_addfolder: function () {
		this._create(this.dialog._entryText.get_text(), this._firstItem);
		if (!this.dialog._errorBox.visible) {
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

	_create: function (newName, id) {
		
		let folderId = this._folderId(newName);
		
		if (this._alreadyExists(folderId)) {
			return;
		}
		
		_folderList.push(folderId);
		_foldersSchema.set_strv('folder-children', _folderList);
		
		let tmp1 = new Gio.Settings({
			schema_id: 'org.gnome.desktop.app-folders.folder',
			path: '/org/gnome/desktop/app-folders/folders/' + folderId + '/'
		});
		tmp1.set_string('name', newName);
		
		addToFolder(id, folderId);
	},

	open: function () {
		this.dialog._entryText.set_text('');
		this.parent();
	},

	destroy: function () {
		this.parent();
	},
});

//-----------------------------------------------

/* this class build a concrete dialog window, for appfolder renaming.
 * Methods are:
 * _init(id)
 * _rename()
 * open()
 * [from GenericDialog] _alreadyExists(folderId)
 * [from GenericDialog] _showError(message)
 * destroy()
 */
const renameFolderDialog = new Lang.Class({
	Name: 'renameFolderDialog',
	Extends: GenericDialog,

	_init: function(id) {
		let label = new St.Label({ text: _("Enter a name") });
		this.parent(label);
		
		this.dialog.setButtons([
			{ action: Lang.bind(this, this.destroy),
			label: _("Cancel"),
			key: Clutter.Escape },
			
			{ action: Lang.bind(this, this._rename),
			label: _("Rename"),
			key: Clutter.Return }
		]);
		
		this.dialog._entryText.connect('key-press-event', Lang.bind(this, function(o, e) {
			let symbol = e.get_key_symbol();
			if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
				this.dialog.popModal();
				this._rename();
			}
		}));
	},

	_rename: function () {
		let newName = this.dialog._entryText.get_text();
		folderIconSchema.set_string('name', newName);
		folderIconSchema = null;
		
		if (!this.dialog._errorBox.visible) {
			this.destroy();
			reload();
			return Clutter.EVENT_STOP;
		}
		return null;
	},

	open: function () {	
		this.dialog._entryText.set_text(folderIconSchema.get_string('name'));
		this.parent();
	},

	destroy: function () {
		this.parent();
	},

});

//-----------------------------------------------

/* this class build a concrete dialog window, for adding custom category.
 * Methods are:
 * _init(schema)
 * _addCategory()
 * open()
 * [from GenericDialog] _alreadyExists(folderId)
 * [from GenericDialog] _showError(message)
 * destroy()
 */
const enterCategoryDialog = new Lang.Class({
	Name: 'enterCategoryDialog',
	Extends: GenericDialog,

	_init: function(schema) {
		
		let label = new St.Label({ text: _("Enter the name of a category") });
		/* https://standards.freedesktop.org/menu-spec/latest/apas02.html */
		
		this.parent(label);
		
		this.schema = schema;
		
		this.dialog.setButtons([
			{ action: Lang.bind(this, this.destroy),
			label: _("Cancel"),
			key: Clutter.Escape },
			
			{ action: Lang.bind(this, this._addCategory),
			label: _("Add"),
			key: Clutter.Return }
		]);
		
		this.dialog._entryText.connect('key-press-event', Lang.bind(this, function(o, e) {
			let symbol = e.get_key_symbol();
			
			if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
				this.dialog.popModal();
				this._addCategory();
			}
		}));
		
	},

	_addCategory: function () {
		addCategory( this.dialog._entryText.get_text(), this.schema );
		reload();
		this.destroy();
		reload();
		return Clutter.EVENT_STOP;
	},

	open: function () {
		this.parent();
	},

	destroy: function () {
		this.parent();
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
	//	source.actor.connect('destroy', Lang.bind(this, this.destroy));
		
		Main.uiGroup.add_actor(this.actor);
		
		this.connect('open-state-changed', Lang.bind(this, function (menu, isPoppedUp) {
			if (!isPoppedUp) {
				this.close();
				this.actor.sync_hover();
				this.emit('menu-state-changed', false);
			} else {
				i.emit('menu-state-changed', true);
			}
		}));
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
			let dialog = new enterCategoryDialog( tmp );
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
		
		let renameItem = this._appendMenuItem(_("Rename"));
		renameItem.connect('activate', Lang.bind(this, function() {
			folderIconSchema = this._source._folder;
			let dialog = new renameFolderDialog();
			dialog.open();
		}));
		
		let deleteItem = this._appendMenuItem(_("Delete"));
		deleteItem.connect('activate', Lang.bind(this, function() {
			
			let tmp = [];
			for(var j=0;j<_folderList.length;j++){
				if(_folderList[j] == this._source.id) {}
				else {
					tmp.push(_folderList[j]);
				}
			}
			
			_foldersSchema.set_strv('folder-children', tmp);
			
			if ( _settings.get_boolean('total-deletion') ) {
				this._source._folder.reset('apps');
				this._source._folder.reset('name');
			}
			
			/* i should get rid of this shit */
			let timeoutId = Mainloop.timeout_add(500, Lang.bind(this, function() {
				disable();
				Mainloop.source_remove(timeoutId);
				enable();
			}));
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
		//this.open();
		
		if (this.isOpen)
			return;
		
		if (this.isEmpty())
			return;
		
		this.isOpen = true;
		this._boxPointer.setPosition(this.sourceActor, this._arrowAlignment);
		//this._boxPointer.setPosition(this._source.actor, this._arrowAlignment); //marche aussi
		this._boxPointer.show(false);
		
		this.actor.raise_top();
		
		this._source.emit('open-state-changed', true);
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
	//------------------------------------------
			let addto = new PopupMenu.PopupSubMenuMenuItem(_("Add to"));
			
			//------------------------------------------
			let newAppFolder = new PopupMenu.PopupMenuItem('+ ' + _("New AppFolder"));
			newAppFolder.connect('activate', Lang.bind(this, function() {
				let id = this._source.app.get_id();
				
				popdownAll();
				
				let dialog = new createFolderDialog(id);
				dialog.open();
			}));
			addto.menu.addMenuItem(newAppFolder);
			//------------------------------------------
			
			for (var i = 0 ; i < _folderList.length ; i++) {
				let _folder = _folderList[i];
				
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
	//------------------------------------------
			let removeFrom = new PopupMenu.PopupSubMenuMenuItem(_("Remove from"));
			let shouldShow2 = false;
			for (var i = 0 ; i < _folderList.length ; i++) {
				let _folder = _folderList[i];
				
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
	
	let _folderIcons = Main.overview.viewSelector.appDisplay._views[1].view.folderIcons;
	_folderIcons.forEach(function(i){
		
		i._estPrisEnCompte = true;
		i._menu = null;
		i._menuManager = new PopupMenu.PopupMenuManager(i);
		
		i.popupMenu = function () {
			i.actor.fake_release();
			if (!i._menu) {
				i._menu = new FolderIconMenu(i);
				//let id = Main.overview.connect('hiding', Lang.bind(this, function () { i._menu.close(); }));
				i._menuManager.addMenu(i._menu);
			}
			i.emit('menu-state-changed', true);
			i.actor.set_hover(true);
			i._menu.popup();
			i._menuManager.ignoreRelease();
			return false;
		}
		
	//----------------------------------------------------
		
		i._onButtonPress = function (actor, event) {
			let button = event.get_button();
			if (button == 1) {
				if(i._menu)
					i._menu.close();
				//	i._menu.destroy();
			} else if (button == 3) {
				if(i._menu && i._menu.isOpen) {
					i._menu.close();
				} else {
					closeAllMenus();
					i.popupMenu();
				}
				return Clutter.EVENT_STOP;
			}
			return Clutter.EVENT_PROPAGATE;
		}
		i.actor.connect('button-press-event', Lang.bind(i, i._onButtonPress));
	});
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

function closeAllMenus() {
	let _folderIcons = Main.overview.viewSelector.appDisplay._views[1].view.folderIcons;
	_folderIcons.forEach(function(i){
		if(i._menu && i._menu.isOpen) {
			i._menu.close();
		}
	});
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

/* this function reload the whole applications view, and then the extension */
function reload() {
//////	Main.overview.viewSelector.appDisplay._views[1].view._redisplay(); // segfault
		//log('[Appfolder Management] - reload 0/4');
//////	Main.overview.viewSelector.appDisplay._views[1].view._grid.destroyAll(); // segfault
	Main.overview.viewSelector.appDisplay._views[1].view._grid.removeAll();
		//log('[Appfolder Management] - reload 1/4');
	Main.overview.viewSelector.appDisplay._views[1].view._items = {};
		//log('[Appfolder Management] - reload 2/4');
	Main.overview.viewSelector.appDisplay._views[1].view._allItems = [];
		//log('[Appfolder Management] - reload 3/4');
	Main.overview.viewSelector.appDisplay._views[1].view._loadApps();
		//log('[Appfolder Management] - reload 4/4');
	
	extReload2();
	createFolderMenus(); //redondant avec ligne précédente ?
}

//-------------------------------------------------

function extReload() {
	//do not use ; that's for debugging only
	disable();
	enable();
}

//-------------------------------------------------

/* Absurdly complex way to reload the extension:
 * there is issues with how the whole thing is loaded,
 * so we will reload the extension EACH DAMN TIME THE
 * APPLICATIONS VIEW WILL BE OPENED. The function we use
 * is not extReload because of infinte recursion it
 * would trigger.
 */
function extReload2() {
	_settings = Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager');
	
	let _bool2 = false;
	let _bool = false;
	let _folderIcons = Main.overview.viewSelector.appDisplay._views[1].view.folderIcons;
	_folderIcons.forEach(function(i){
		if (i.view._grid._colLimit != _settings.get_int('columns-max')) {
			_bool = true;
		}
		
		if (i._estPrisEnCompte) {
	//	if (i._menu) {
			_bool2 = true;
	//	} else {
		}
	});
	
	if ( _bool ) {
		setNbColumns( _settings.get_int('columns-max') );
	}
	
	if(!_bool2){
		createFolderMenus();
	}
}

//-------------------------------------------------

function setNbColumns(setting) {
	//log('[Appfolder Management] - set columns');
	let _views = Main.overview.viewSelector.appDisplay._views;
	for (let i = 0; i < _views.length; i++) {
		_views[i].view._grid._colLimit = setting;
	}
	
	let _folderIcons = Main.overview.viewSelector.appDisplay._views[1].view.folderIcons;
	_folderIcons.forEach(function(i){
		i.view._grid._colLimit = setting;
	});
}

//-------------------------------------------------

function popdownAll() {
	//log('[Appfolder Management] - closing open popups');
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
	_settings = Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager');
	setNbColumns( _settings.get_int('columns-max') );
	_foldersSchema = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
	_folderList = _foldersSchema.get_strv('folder-children');

	injectionInAppsMenus();
	
	injections['show'] = injectToFunction(Overview.Overview.prototype, 'show', function(){
		//extReload();
		extReload2();
	});
}

//-------------------------------------------------

function disable() {
	removeInjection(AppDisplay.AppIconMenu.prototype, injections, '_redisplay');
	removeInjection(Overview.Overview.prototype, injections, 'show');
	setNbColumns( 6 );
	
	Main.overview.viewSelector.appDisplay._views[1].view.folderIcons.forEach(function(i){
		if (i._menu) {
			i._menu.destroy();
		}
	});
}

//-------------------------------------------------
