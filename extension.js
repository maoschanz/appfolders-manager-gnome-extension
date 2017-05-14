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

//------------------------------------------

function enable() {
	let _foldersSchema = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
	let _folderList = _foldersSchema.get_strv('folder-children');
	
	injections['_redisplay'] = injectToFunction(AppDisplay.AppIconMenu.prototype, '_redisplay',  function(){
		this._appendSeparator();
		let addto = new PopupMenu.PopupSubMenuMenuItem(_("Add to"));
		for (var i = 0 ; i < _folderList.length ; i++) {
			let _folder = _folderList[i];
			let item = new PopupMenu.PopupMenuItem(_folder);
			item.connect('activate', Lang.bind(this, function() {
				let id = this._source.app.get_id();
				
				let path = '/org/gnome/desktop/app-folders/folders/' + _folder + '/';
				let tmp2 = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders.folder', path: path });
				
				let content = tmp2.get_strv('apps');
				
				content.push(id);
				tmp2.set_strv('apps', content);
			}));
        	addto.menu.addMenuItem(item);
		}
		this.addMenuItem(addto);
		
		let removeFrom = new PopupMenu.PopupSubMenuMenuItem(_("Delete from"));
		for (var i = 0 ; i < _folderList.length ; i++) {
			let _folder = _folderList[i];
			let item = new PopupMenu.PopupMenuItem(_folder);
			item.connect('activate', Lang.bind(this, function() {

				let id = this._source.app.get_id();
				
				let path = '/org/gnome/desktop/app-folders/folders/' + _folder + '/';
				let tmp = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders.folder', path: path });
				
				let pastContent = tmp.get_strv('apps');
				let presentContent = [];
				for(i=0;i<pastContent.length;i++){
					if(truc[i] != id) {
						presentContent.push(pastContent[i]);
					}
				}
				tmp.set_strv('apps', presentContent);
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

			_folderList.push(newNickname);
			_foldersSchema.set_strv('folder-children', _folderList);
			
			let path = '/org/gnome/desktop/app-folders/folders/' + newNickname + '/';
			let tmp1 = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders.folder', path: path });
			tmp1.set_string('name', newName);
			
			let timeoutId = Mainloop.timeout_add(200, Lang.bind(this, function() {
				disable();
				Mainloop.source_remove(timeoutId);
				enable();
			}));
		}));
		newAppFolder.menu.addMenuItem(item2);
		
		this.addMenuItem(newAppFolder);
		
		newAppFolder.menu.connect('open-state-changed', Lang.bind(this, function(self, open){
			
			let timeoutId = Mainloop.timeout_add(20, Lang.bind(this, function() {
				if (open) {
					newEntry.set_text('');
					global.stage.set_key_focus(newEntry);
				}
				Mainloop.source_remove(timeoutId);
			}));
		}));
		
		let delAppfolder = new PopupMenu.PopupSubMenuMenuItem(_("Delete AppFolder"));
		for (var i = 0 ; i < _folderList.length ; i++) {
			let _folder = _folderList[i];
			let item = new PopupMenu.PopupMenuItem(_folder);
			item.connect('activate', Lang.bind(this, function() {
				let tmp = [];
				for(i=0;i<_folderList.length;i++){
					if(_folderList[i] == _folder) {}
					else {
						tmp.push(_folderList[i]);
					}
				}
				_foldersSchema.set_strv('folder-children', tmp);
				let timeoutId = Mainloop.timeout_add(200, Lang.bind(this, function() {
					disable();
					Mainloop.source_remove(timeoutId);
					enable();
				}));
			}));
        	delAppfolder.menu.addMenuItem(item);
		}
		
		this.addMenuItem(delAppfolder);
		
	//end of injections beyond the following line
	});
//end of enable()
}

//-------------------------------------------------

function disable() {
	removeInjection(AppDisplay.AppIconMenu.prototype, injections,  '_redisplay');
}
