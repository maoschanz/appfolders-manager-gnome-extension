
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const AppDisplay = imports.ui.appDisplay;
const PopupMenu = imports.ui.popupMenu;
const Overview = imports.ui.overview;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const AppfolderDialog = Me.imports.appfolderDialog;
const FolderIconMenu = Me.imports.folderIconMenu;
const DragAndDrop = Me.imports.dragAndDrop;

const Gettext = imports.gettext.domain('appfolders-manager');
const _ = Gettext.gettext;

const Mainloop = imports.mainloop; //FIXME

//-------------------------------------------------

let FOLDER_SCHEMA;
let FOLDER_LIST;

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

/* this function injects items (1 or 2 submenus) in AppIconMenu's _redisplay method. */
function injectionInAppsMenus() {
	injections['_redisplay'] = injectToFunction(AppDisplay.AppIconMenu.prototype, '_redisplay', function(){
		
		if (Main.overview.viewSelector.getActivePage() == 2 || Main.overview.viewSelector.getActivePage() == 3) {
			this._appendSeparator();
			
			let addto = new PopupMenu.PopupSubMenuMenuItem(_("Add to"));
			
			let newAppFolder = new PopupMenu.PopupMenuItem('+ ' + _("New AppFolder"));
			newAppFolder.connect('activate', Lang.bind(this, function() {
				let id = this._source.app.get_id();
				FolderIconMenu.popdownAll(); //FIXME
				//Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown(); //??
				
				let dialog = new AppfolderDialog.AppfolderDialog(null , id);
				dialog.open();
			}));
			addto.menu.addMenuItem(newAppFolder);
			
			FOLDER_LIST = FOLDER_SCHEMA.get_strv('folder-children');
			
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
						FolderIconMenu.popdownAll(); //FIXME
						//Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown(); //??
						
						let tmp2 = new Gio.Settings({
							schema_id: 'org.gnome.desktop.app-folders.folder',
							path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
						});
						let content = tmp2.get_strv('apps');
						content.push(id);
						tmp2.set_strv('apps', content);
						Main.overview.viewSelector.appDisplay._views[1].view._redisplay();
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
				
				let currentFolderSchema = new Gio.Settings({
					schema_id: 'org.gnome.desktop.app-folders.folder',
					path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
				});
				
				let item = new PopupMenu.PopupMenuItem( AppDisplay._getFolderName( currentFolderSchema ) );
				
				let shouldShow = isInFolder(id, currentFolderSchema);
				
				if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('experimental') ) {
					shouldShow = true;
				}
				
				if(shouldShow) {
					item.connect('activate', Lang.bind(this, function(aa, bb, that) {
						
						that._source._menuManager._grabHelper.ungrab({ actor: that.actor });
						
						// We can't popdown the folder immediatly because the AppDisplay.AppFolderPopup.popdown()
						// method tries to ungrab the global focus from the folder's popup actor, which isn't
						// having the focus since the menu is still open. Menus' animation last ~0.25s so we
						// will wait 0.30s before doing anything.
//						let a = Mainloop.timeout_add(300, Lang.bind(this, function() {
							if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) {
								log('true');
								Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown();
							} else {
								log('false');
							}
//							let currentFolderSchema = new Gio.Settings({
//								schema_id: 'org.gnome.desktop.app-folders.folder',
//								path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
//							});
							
							if ( isInFolder(id, currentFolderSchema) ) {
							
								let pastContent = currentFolderSchema.get_strv('apps');
								let presentContent = [];
								for(i=0;i<pastContent.length;i++){
									if(pastContent[i] != id) {
										presentContent.push(pastContent[i]);
									}
								}
								currentFolderSchema.set_strv('apps', presentContent);
								
							} else {
								//FIXME virer des exclues à l'ajout !!!
								let pastContent = currentFolderSchema.get_strv('excluded-apps');
								let presentContent = [];
								for(i=0;i<pastContent.length;i++){
									if(pastContent[i] != id) {
										presentContent.push(pastContent[i]);
									}
								}
								currentFolderSchema.set_strv('excluded-apps', presentContent);
								
							}
							Main.overview.viewSelector.appDisplay._views[1].view._redisplay();
//							Mainloop.source_remove(a);
//						}));
					}, this));
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
	
	if (!AppDisplay.FolderIcon.injections) { //FIXME tests encore pertinents ??
	
		AppDisplay.FolderIcon.prototype.injections = true;
		
		AppDisplay.FolderIcon.prototype.popupMenu = function () {
			this.actor.fake_release(); // qu'est-ce?
			if (!this._menu) {
				this._menu = new FolderIconMenu.FolderIconMenu(this);
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
			} else if (button == 2) {
				this.popupMenu();
				return Clutter.EVENT_STOP;
			} else if (button == 3) {
				if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('experimental') ) {
					let tmp = new Gio.Settings({
						schema_id: 'org.gnome.desktop.app-folders.folder',
						path: '/org/gnome/desktop/app-folders/folders/' + this.id + '/'
					});
					let dialog = new AppfolderDialog.AppfolderDialog(tmp, null);
					dialog.open();
				} else {
					this.popupMenu();
					return Clutter.EVENT_STOP;
				}
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

function isInFolder (id, folder) { //FIXME raison d'être de ce machin ici ??
	let isIn = false;
	let content_ = folder.get_strv('apps');
	for(var j=0;j<content_.length;j++){
		if(content_[j] == id) {
			isIn = true;
		}
	}
	return isIn;
}

//----------------------------------------------------

function enable() {

	FOLDER_SCHEMA = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
	FOLDER_LIST = FOLDER_SCHEMA.get_strv('folder-children');

	injectionInAppsMenus();
	
	if(
		Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('experimental')
		&&
		Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('dnd')
	) {
		DragAndDrop.dndInjections();
	}
	
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
