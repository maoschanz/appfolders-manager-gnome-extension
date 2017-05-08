const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const AppDisplay = imports.ui.appDisplay;
const PopupMenu = imports.ui.popupMenu;
const Mainloop = imports.mainloop;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const Gettext = imports.gettext.domain('appfolders-manager');
const _ = Gettext.gettext;

//-------------------------------------------------

function init() {
    Convenience.initTranslations();
}

//-------------------------------------------------
/*

*/
//------------------------------------------------

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
let nameEntry = null;

//------------------------------------------

function enable() {
	let _foldersSchema = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
	let _folderList = _foldersSchema.get_strv('folder-children');
	
	injections['_redisplay'] = injectToFunction(AppDisplay.AppIconMenu.prototype, '_redisplay',  function(){
		this._appendSeparator();
		let addto = new PopupMenu.PopupSubMenuMenuItem(_("Add to"));
		for (var i = 0 ; i < _folderList.length ; i++) {
			let _folder = _folderList[i];
			let item = new PopupMenu.PopupMenuItem(_folderList[i]);
			item.connect('activate', Lang.bind(this, function() {
				let id = this._source.app.get_id();
				Main.Util.trySpawnCommandLine( Me.path  + '/appfolders-editor add-to ' + _folder + ' ' + id );
			}));
        	addto.menu.addMenuItem(item);
		}
		
		this.addMenuItem(addto);
		
//à faire au lieu de removeFromAppFolders
		let removeFrom = new PopupMenu.PopupSubMenuMenuItem(_("Delete from"));
		for (var i = 0 ; i < _folderList.length ; i++) {
			let _folder = _folderList[i];
			let item = new PopupMenu.PopupMenuItem(_folderList[i]);
			item.connect('activate', Lang.bind(this, function() {
				let id = this._source.app.get_id();
				Main.Util.trySpawnCommandLine( Me.path  + '/appfolders-editor remove ' + _folder + ' ' + id );
			}));
        	removeFrom.menu.addMenuItem(item);
		}
		
		this.addMenuItem(removeFrom);
		
		let newAppFolder = new PopupMenu.PopupSubMenuMenuItem(_("New AppFolder"));
		
		let item1 = new PopupMenu.PopupMenuItem('');
		let newEntry = new St.Entry({
	        name: 'newEntry',
	        can_focus: true,
	        hint_text: _("Enter a name"),
	        track_hover: true
	    });
    	
    	item1.actor.add(newEntry, { expand: true });
    	newAppFolder.menu.addMenuItem(item1);
    	
		let item2 = new PopupMenu.PopupMenuItem(_("Create"));
		item2.connect('activate', Lang.bind(this, function() {
			let newName = newEntry.get_text();
			
			let newNickname = "";
			
			let tmp0 = newName.split(" ");
			for(var i = 0; i < tmp0.length; i++) {
				newNickname += tmp0[i];
			}
			
			Main.Util.trySpawnCommandLine( Me.path  + '/appfolders-editor new-folder ' + newNickname );
			Main.Util.trySpawnCommandLine( Me.path  + '/appfolders-editor rename-folder ' + newNickname + ' \"' + newName + '\"');
			
			Mainloop.timeout_add(200, Lang.bind(this, function() {
				disable();
				enable();
			}));
		}));
		newAppFolder.menu.addMenuItem(item2);
		
		
		this.addMenuItem(newAppFolder);
		
		newAppFolder.menu.connect('open-state-changed', Lang.bind(this, function(self, open){
			
			Mainloop.timeout_add(20, Lang.bind(this, function() {
				if (open) {
					newEntry.set_text('');
					global.stage.set_key_focus(newEntry);
				}
			}));
		}));
		
		let delAppfolder = new PopupMenu.PopupSubMenuMenuItem(_("Delete AppFolder"));
		for (var i = 0 ; i < _folderList.length ; i++) {
			let _folder = _folderList[i];
			let item = new PopupMenu.PopupMenuItem(_folderList[i]);
			item.connect('activate', Lang.bind(this, function() {
				let id = this._source.app.get_id();
				Main.Util.trySpawnCommandLine( Me.path  + '/appfolders-editor del-folder ' + _folder);
				Mainloop.timeout_add(200, Lang.bind(this, function() {
					disable();
					enable();
				}));
			}));
        	delAppfolder.menu.addMenuItem(item);
		}
		
		this.addMenuItem(delAppfolder);
		
//		let removeFromAppFolders = this._appendMenuItem(_("Remove from AppFolders"));
//		removeFromAppFolders.connect('activate', Lang.bind(this, function() {
//			let id = this._source.app.get_id();
//			for (var i = 0 ; i < _folderList.length ; i++) {
//				let id = this._source.app.get_id();
//				let _folder = _folderList[i];
//				Main.Util.trySpawnCommandLine( Me.path  + '/appfolders-editor remove ' + _folder + ' ' + id );
//			}
//		//end of the signal beyond the following line
//		}));
	//end of injections beyond the following line
	});
}

function disable() {
	removeInjection(AppDisplay.AppIconMenu.prototype, injections,  '_redisplay');
}

