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

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const Gettext = imports.gettext.domain('appfolders-manager');
const _ = Gettext.gettext;

//-------------------------------------------------

let _foldersSchema;
let _folderList;

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

const NewFolderDialog = new Lang.Class({
    Name: 'NewFolderDialog',
    Extends: ModalDialog.ModalDialog,

    _init : function(id) {
        this.parent();


        let label = new St.Label({ text: _("Enter a name") });

        this.contentLayout.add(label, { x_fill: false,
                                        x_align: St.Align.START,
                                        y_align: St.Align.START });

        let entry = new St.Entry({can_focus: true });
        ShellEntry.addContextMenu(entry);

        entry.label_actor = label;

		this._entryText = entry.clutter_text;
		this.contentLayout.add(entry, { y_align: St.Align.START });
		this.setInitialKeyFocus(this._entryText);

        this.setButtons([{ action: Lang.bind(this, this.close),
                           label: _("Cancel"),
                           key: Clutter.Escape }]);

        this._entryText.connect('key-press-event', Lang.bind(this, function(o, e) {
            let symbol = e.get_key_symbol();
            if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
                this.popModal();
                this._create(o.get_text(),
                          e.get_state() & Clutter.ModifierType.CONTROL_MASK, id);
                if (!this._commandError ||
                    !this.pushModal())
                    this.close();

                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }));
    },

	_create : function(newName, osefka, id) {
			let folderId = "";
			
			let tmp0 = newName.split(" ");
			for(var i = 0; i < tmp0.length; i++) {
				folderId += tmp0[i];
			}
			
			for(var i = 0; i < _folderList.length; i++) {
				if (_folderList[i] == folderId) {
					log('this appfolder already exists');
					return;
				}
			}

			_folderList.push(folderId);
			_foldersSchema.set_strv('folder-children', _folderList);
			
			let path = '/org/gnome/desktop/app-folders/folders/' + folderId + '/';
			let tmp1 = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders.folder', path: path });
			tmp1.set_string('name', newName);
			
			addToFolder(id, folderId);
	},
	
	open: function() {
        this._entryText.set_text('');
        this.parent();
    },
});

//-------------------------------------------------

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
//	Main.overview.viewSelector.appDisplay._views[1].view._redisplay();
}

//-------------------------------------------------

function setNbColumns(setting) {
	let test = Main.overview.viewSelector.appDisplay._views;
	for (let i = 0; i < test.length; i++) {
		test[i].view._grid._colLimit = setting;
	}

	let _folderIcons = Main.overview.viewSelector.appDisplay._views[1].view.folderIcons;
	_folderIcons.forEach(function(i){
		i.view._grid._colLimit = setting;
	});
}

//-------------------------------------------------

function enable() {

	let _settings = Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager');
//****************************************************************
	setNbColumns( _settings.get_int('columns-max') );
//****************************************************************
	_foldersSchema = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
	_folderList = _foldersSchema.get_strv('folder-children');
//****************************************************************
	
	injections['_redisplay'] = injectToFunction(AppDisplay.AppIconMenu.prototype, '_redisplay',  function(){
		this._appendSeparator();
//------------------------------------------
		let addto = new PopupMenu.PopupSubMenuMenuItem(_("Add to"));
		
		//------------------------------------------
		let newAppFolder = new PopupMenu.PopupMenuItem('+ ' + _("New AppFolder"));
		newAppFolder.connect('activate', Lang.bind(this, function() {
			let id = this._source.app.get_id();
			let dialog = new NewFolderDialog(id);
			dialog.open();
		}));
		addto.menu.addMenuItem(newAppFolder);
		//------------------------------------------
		
		for (var i = 0 ; i < _folderList.length ; i++) {
			let _folder = _folderList[i];
			
			let _tmp = new Gio.Settings({	schema_id: 'org.gnome.desktop.app-folders.folder',
											path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
										});
									
			let shouldShow = !isInFolder( this._source.app.get_id(), _tmp );
			
			let item = new PopupMenu.PopupMenuItem( AppDisplay._getFolderName( _tmp ) );
			
			if(shouldShow) {
				item.connect('activate', Lang.bind(this, function() {
					let id = this._source.app.get_id();
				
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
			
			let _tmp = new Gio.Settings({	schema_id: 'org.gnome.desktop.app-folders.folder',
											path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
										});
										
			let item = new PopupMenu.PopupMenuItem( AppDisplay._getFolderName( _tmp ) );
			
			let shouldShow = isInFolder(id, _tmp);
			
			if(shouldShow) {
				item.connect('activate', Lang.bind(this, function() {
				
					let tmp = new Gio.Settings({	schema_id: 'org.gnome.desktop.app-folders.folder',
													path:  '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
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
//------------------------------------------
		let delAppfolder = new PopupMenu.PopupSubMenuMenuItem(_("Delete AppFolder"));
		for (var i = 0 ; i < _folderList.length ; i++) {
			let _folder = _folderList[i];
			
			let _tmp = new Gio.Settings({	schema_id: 'org.gnome.desktop.app-folders.folder',
											path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
										});
										
			let item = new PopupMenu.PopupMenuItem( AppDisplay._getFolderName( _tmp ) );
			
			item.connect('activate', Lang.bind(this, function() {
				let tmp = [];
				for(i=0;i<_folderList.length;i++){
					if(_folderList[i] == _folder) {}
					else {
						tmp.push(_folderList[i]);
					}
				}
				_foldersSchema.set_strv('folder-children', tmp);
				
				if ( _settings.get_boolean('total-deletion') ) {
					let path = '/org/gnome/desktop/app-folders/folders/' + _folder + '/';
					let tmp3 = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders.folder', path: path });
					tmp3.reset('apps');
					tmp3.reset('name');
				}				
				
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
	setNbColumns( 6 );
}
