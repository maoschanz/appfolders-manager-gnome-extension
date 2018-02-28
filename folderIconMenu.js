const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const AppDisplay = imports.ui.appDisplay;
const PopupMenu = imports.ui.popupMenu;
const Overview = imports.ui.overview;

const Signals = imports.signals;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const AppfolderDialog = Me.imports.appfolderDialog;

const Gettext = imports.gettext.domain('appfolders-manager');
const _ = Gettext.gettext;

//-------------------------------------------------

let FOLDER_SCHEMA;

function init() {
	Convenience.initTranslations();
}

/* this class represents menus opened when right click on an appfolder.
 * Methods are:
 * _init(source)
 * _redisplay()
 * _appendMenuItem(labelText)
 * _appendSeparator()
 * popup()
 * popdown()
 */
var FolderIconMenu = new Lang.Class({
	Name: 'FolderIconMenu',
	Extends: PopupMenu.PopupMenu,

	_init: function(source) {
	
		FOLDER_SCHEMA = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
		this.folderList = FOLDER_SCHEMA.get_strv('folder-children');
	
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
		this.folderList = FOLDER_SCHEMA.get_strv('folder-children');
		
		let tmp = new Gio.Settings({
			schema_id: 'org.gnome.desktop.app-folders.folder',
			path: '/org/gnome/desktop/app-folders/folders/' + this._source.id + '/'
		});
		
		let item = new PopupMenu.PopupMenuItem( _("Add a category") );
		item.connect('activate', Lang.bind(this, function() {
			popdownAll();
			let dialog = new AppfolderDialog.AppfolderDialog(tmp, null);
			dialog.open();
		}));
		
		this.addMenuItem(item);
		
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
			let dialog = new AppfolderDialog.AppfolderDialog(this._source._folder, null);
			dialog.open();
		}));
		
		let deleteItem = this._appendMenuItem(_("Delete"));
		deleteItem.connect('activate', Lang.bind(this, function() {
			
			let tmp = [];
			for(var j=0;j<this.folderList.length;j++){
				if(this.folderList[j] == this._source.id) {}
				else {
					tmp.push(this.folderList[j]);
				}
			}
			
			FOLDER_SCHEMA.set_strv('folder-children', tmp);
			
			if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('total-deletion') ) {
				this._source._folder.reset('apps');
				this._source._folder.reset('categories');
				this._source._folder.reset('name'); // générait un bug // en génère toujours, en plus volumineux mais au moins rien ne crash
			}
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

function reload() {
	Main.overview.viewSelector.appDisplay._views[1].view._redisplay();
	if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('experimental') ) {
		log('[FolderIconMenu] reload the view');
	}
}

//-------------------------------------------------

function popdownAll() {	
	// FIXME c'est de la merde car ça envoie le signal mais n'ungrab rien
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

