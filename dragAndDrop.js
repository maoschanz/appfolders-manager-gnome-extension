
const DND = imports.ui.dnd;
const AppDisplay = imports.ui.appDisplay;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Extension = Me.imports.extension;

const CHANGE_PAGE_TIMEOUT = 250;
const POPDOWN_TIMEOUT = 500;

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

/*

TODO fix the exclusion
fix the blue removal, or make that actor green

*/

// droppable: create, delete
const FolderActionBox = new Lang.Class({
	Name:	'FolderActionBox',
	
	_init:	function(id, color) {
		this.id = id;
		this.color = color;
		let x, y, h, w, i;
		switch (this.id) {
			case 'delete':
				x = 100;
				y = 130;
				h = 520;
				w = 100;
				i = 'user-trash-symbolic';
//				i = 'user-trash-symbolic';
			break;
			case 'create':
				x = 1200;
				y = 130;
				h = 520;
				w = 100;
//				i = 'folder-new-symbolic';
				i = 'list-add-symbolic';
			break;
			default:
				x = 10;
				y = 10;
				h = 10;
				w = 10;
				i = 'face-sad-symbolic';
				this.color = 'white';
			break;
		}
		
		this.actor = new St.BoxLayout ({
			width: w,
			height: h,
			style: 'background-color: ' + this.color + ';',
			visible: false,
		});
		this.actor.add(new St.Icon({
			icon_name: i,
			icon_size: 16,
			style_class: 'system-status-icon',
			x_expand: true,
			y_expand: true,
			style: 'margin: 5px;',
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		}));
		
		let monitor = Main.layoutManager.primaryMonitor;
		this.actor.set_position(
			monitor.x + x,
			monitor.y + y
		);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
		this.actor._delegate = this;
		
		this.lock = false
	},
	
	handleDragOver: function(source, actor, x, y, time) {
		if (this.id == 'delete') {
			if (source instanceof AppDisplay.FolderIcon) {
				return DND.DragMotionResult.MOVE_DROP;
			} else if (source instanceof AppDisplay.AppIcon) {
				return DND.DragMotionResult.MOVE_DROP;
			}
			log('wtf is that');
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
		
		if (this.id == 'create') {
			if (source instanceof AppDisplay.AppIcon) {
				return DND.DragMotionResult.MOVE_DROP;
			}
			log('wtf is that');
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
	},
	
	acceptDrop: function(source, actor, x, y, time) {
		log('----------- accept the drop -------------');
		
		if (this.id == 'delete') {
			if (source instanceof AppDisplay.FolderIcon) {
				log('on supprime un dossier');
				this.deleteFolder(source);
				hideAll();
				Main.overview.endItemDrag(this);
				return true;
				
			} else if (source instanceof AppDisplay.AppIcon) {
				log('on retire une appli');
				this.removeApp(source);
				hideAll();
				Main.overview.endItemDrag(this);
				return true;
			}
			log('wtf is that ??');
			Main.overview.endItemDrag(this);
			return false;
		}
		
		if (this.id == 'create') {
			if (source instanceof AppDisplay.FolderIcon) {
				log('ça ne fait pas sens de creer un dossier en droppant un dossier, sombre connard');
				Main.overview.endItemDrag(this);
				return false;
			} else if (source instanceof AppDisplay.AppIcon) {
				log('creation de dossier');
				
				
				Main.overview.endItemDrag(this);
				return false;
			}
			log('139 no nani mono, omae wa ??');
			Main.overview.endItemDrag(this);
			return false;
		}
		
		log(source);
		log("*************");
		log(actor);
		
		Main.overview.endItemDrag(this);
		return true;
	},
	
	removeApp: function(source) {
		let id = source.app.get_id();
		log('id : ' + id);
			
		let _folder = Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source.id;
		log('_folder : ' + _folder);
		
		let currentFolderSchema = new Gio.Settings({
			schema_id: 'org.gnome.desktop.app-folders.folder',
			path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
		});
		
		if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) {
			log('true');
			Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown();
		} else {
			log('false');
		}
							
		if ( Extension.isInFolder(id, currentFolderSchema) ) {
		
			let pastContent = currentFolderSchema.get_strv('apps');
			let presentContent = [];
			for (var i=0;i<pastContent.length;i++){
				if (pastContent[i] != id) {
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
	},
	
	deleteFolder(source) {
		Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function () {
			
			let tmp = [];
			for(var j=0;j<Extension.FOLDER_LIST.length;j++){
				if(Extension.FOLDER_LIST[j] == source.id) {}
				else {
					tmp.push(Extension.FOLDER_LIST[j]);
				}
			}
			
			Extension.FOLDER_SCHEMA.set_strv('folder-children', tmp);
			Extension.FOLDER_LIST = tmp; //??
			
			if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('total-deletion') ) {
				source._folder.reset('apps');
				source._folder.reset('categories');
				source._folder.reset('name'); // générait un bug // en génère toujours, en plus volumineux mais au moins rien ne crash
			}
			
			return false;
		}));
		
		hideAll();
	}
	
});


const NavigationBox = new Lang.Class({
	Name:	'NavigationBox',
	
	_init:	function(id, color) {
		this.id = id;
		this.color = color;
		let x, y, h, w, i;
		switch (this.id) {
			case 'up':
				x = 200;
				y = 30;
				h = 100;
				w = 1000;
				i = 'pan-up-symbolic';
			break;
			case 'down':
				x = 200;
				y = 650;
				h = 100;
				w = 1000;
				i = 'pan-down-symbolic';
			break;
			default:
				x = 10;
				y = 10;
				h = 10;
				w = 10;
				i = 'face-sad-symbolic';
				this.color = 'white';
			break;
		}
		
		this.actor = new St.BoxLayout ({
			width: w,
			height: h,
			style: 'background-color: ' + this.color + ';',
			visible: false,
		});
		this.actor.add(new St.Icon({
			icon_name: i,
			icon_size: 16,
			style_class: 'system-status-icon',
			x_expand: true,
			y_expand: true,
			style: 'margin: 5px;',
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		}));
		
		let monitor = Main.layoutManager.primaryMonitor;
		this.actor.set_position(
			monitor.x + x,
			monitor.y + y
		);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
		this.actor._delegate = this;
		
		this.lock = false
	},
	
	
	handleDragOver: function(source, actor, x, y, time) {
		
		if (this.id == 'up') {
			if (source instanceof AppDisplay.FolderIcon) {
				this.pageUp();
				return DND.DragMotionResult.MOVE_DROP;
			} else if (source instanceof AppDisplay.AppIcon) {
				this.pageUp();
				return DND.DragMotionResult.MOVE_DROP;
			}
			log('wtf did i just drag ?');
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
		
		if (this.id == 'down') {
			if (source instanceof AppDisplay.FolderIcon) {
				this.pageDown();
				return DND.DragMotionResult.MOVE_DROP;
			} else if (source instanceof AppDisplay.AppIcon) {
				this.pageDown();
				return DND.DragMotionResult.MOVE_DROP;
			}
			log('wtf did i just drag ?');
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
		
	},
	
	unlock: function() {
		this.lock = false;
		log('unlock');
		Mainloop.source_remove(this._timeoutId);
	},
	
	pageUp: function() {
		if(!this.lock) {
			var currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
			log(currentPage);
			Main.overview.viewSelector.appDisplay._views[1].view.goToPage( currentPage - 1 );
		
			this._timeoutId = Mainloop.timeout_add(CHANGE_PAGE_TIMEOUT, Lang.bind(this, this.unlock));
			this.lock = true;
		}
	},
	
	pageDown: function() {
		if(!this.lock) {
			var currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
			log(currentPage);
			Main.overview.viewSelector.appDisplay._views[1].view.goToPage( currentPage + 1 );
		
			this._timeoutId = Mainloop.timeout_add(CHANGE_PAGE_TIMEOUT, Lang.bind(this, this.unlock));
			this.lock = true;
		}
	},

	acceptDrop: function(source, actor, x, y, time) {
		log('no drop here pls, it makes no sense');
		
		Main.overview.endItemDrag(this);
		return false;
	}
	
});

const HybridBox = new Lang.Class({
	Name:	'HybridBox',
	
	_init:	function(id, color) {
		this.id = id;
		this.color = color;
		let x, y, h, w, i;
		switch (this.id) { //FIXME il faut 2 lignes dans certains cas de toutes façons
			case 'remove-top':
				x = 200;
				y = 130;
				h = 120;
				w = 1000;
				
			break;
			case 'remove-bottom':
				x = 200;
				y = 530;
				h = 120;
				w = 1000;
			break;
			default:
				x = 10;
				y = 10;
				h = 10;
				w = 10;
				this.color = 'white';
			break;
		}
		i = 'pan-start-symbolic';
		
		this.actor = new St.BoxLayout ({
			width: w,
			height: h,
			style: 'background-color: ' + this.color + ';',
			visible: false,			
		});
		this.actor.add(new St.Icon({
			icon_name: i,
			icon_size: 16,
			style_class: 'system-status-icon',
			x_expand: true,
			y_expand: true,
			style: 'margin: 5px;',
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		}));
		
		let monitor = Main.layoutManager.primaryMonitor;
		this.actor.set_position(
			monitor.x + x,
			monitor.y + y
		);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
		this.actor._delegate = this;
		
		this.lock = false
	},
	
	handleDragOver: function(source, actor, x, y, time) {
		if (source instanceof AppDisplay.FolderIcon) {
			this.popdown();
			return DND.DragMotionResult.MOVE_DROP;
		} else if (source instanceof AppDisplay.AppIcon) {
			this.popdown();
			return DND.DragMotionResult.MOVE_DROP;
		}
		log('nani mono, omae wa ??');
		Main.overview.endItemDrag(this);
		return DND.DragMotionResult.NO_DROP;
		
	},
	
	unlock: function() {
		this.lock = false;
		log('unlock - hybrid');
		Mainloop.source_remove(this._timeoutId);
	},
	
	popdown: function() {
		if(!this.lock) {
			Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown();
			
			this._timeoutId = Mainloop.timeout_add(POPDOWN_TIMEOUT, Lang.bind(this, this.unlock));
			this.lock = true;
			
			removeActionTop.actor.visible = false;
			removeActionBottom.actor.visible = false;
			upAction.actor.visible = true;
			downAction.actor.visible = true;
		}
	},
	
	acceptDrop: function(source, actor, x, y, time) {	//not sure everything make sense
		log('----------- accept the drop -------------');
		
		if (source instanceof AppDisplay.FolderIcon) {
			log('cancel a merging');
			// TODO ?
			Main.overview.endItemDrag(this);
			removeActionTop.actor.visible = false;
			removeActionBottom.actor.visible = false;
			return true;
		} else if (source instanceof AppDisplay.AppIcon) {
			log('remove-from');
			this.removeApp(source);
			Main.overview.endItemDrag(this);
			removeActionTop.actor.visible = false;
			removeActionBottom.actor.visible = false;
			return true;
		}
		
		log(source);
		log("*************");
		log(actor);
		
		Main.overview.endItemDrag(this);
		return false;
	},
	
	removeApp: function(source) {
		let id = source.app.get_id();
		log('id : ' + id);
			
		let _folder = Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source.id;
		log('_folder : ' + _folder);
		
		let currentFolderSchema = new Gio.Settings({
			schema_id: 'org.gnome.desktop.app-folders.folder',
			path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
		});
		
		if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) {
			log('true');
			Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown();
		} else {
			log('false');
		}
							
		if ( Extension.isInFolder(id, currentFolderSchema) ) {
		
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
	},
});


let deleteAction;
let createAction;
let upAction;
let downAction;
let removeActionTop;
let removeActionBottom;
let addAction = [];
	
function dndInjections() {
	
	deleteAction = new FolderActionBox('delete', 'rgba(200,0,0,0.5)');
	createAction = new FolderActionBox('create', 'rgba(200,0,0,0.5)');
	upAction = new NavigationBox('up', 'rgba(0,200,0,0.5)');
	downAction = new NavigationBox('down', 'rgba(0,200,0,0.5)');
	removeActionTop = new HybridBox('remove-top', 'rgba(0,0,200,0.5)');
	removeActionBottom = new HybridBox('remove-bottom', 'rgba(0,0,200,0.5)');
	
	if (!AppDisplay.FolderIcon.injections2) {
	
		AppDisplay.FolderIcon.prototype.injections2 = true;
		
		if (injections['_init2']) {
			removeInjection(AppDisplay.FolderIcon.prototype, injections, '_init2');
		}
		
		injections['_init2'] = injectToFunction(AppDisplay.FolderIcon.prototype, '_init', function(){
			
			let isDraggable = true; //FIXME
			if (isDraggable) {
				this._draggable = DND.makeDraggable(this.actor);
				this._draggable.connect('drag-begin', Lang.bind(this,
					function () {
						//this._removeMenuTimeout(); //FIXME ??
						Main.overview.beginItemDrag(this);
						log('it has begun (folder)');
						deleteAction.actor.visible = true;
						createAction.actor.visible = true;
						if (
							Main.overview.viewSelector.appDisplay._views[1].view._currentPopup
							&&
							Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source._boxPointerArrowside == St.Side.TOP
						) {
							upAction.actor.visible = false;
							downAction.actor.visible = false;
							removeActionTop.actor.visible = true;
							removeActionBottom.actor.visible = false;
						} else if (
							Main.overview.viewSelector.appDisplay._views[1].view._currentPopup
							&&
							Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source._boxPointerArrowside == St.Side.BOTTOM
						) {
							upAction.actor.visible = false;
							downAction.actor.visible = false;
							removeActionTop.actor.visible = false;
							removeActionBottom.actor.visible = true;
						} else {
							removeActionTop.actor.visible = false;
							removeActionBottom.actor.visible = false;
							upAction.actor.visible = true;
							downAction.actor.visible = true;
						}
					}
				));
				this._draggable.connect('drag-cancelled', Lang.bind(this,
					function () {
						log('cancelled');
						Main.overview.cancelledItemDrag(this);
						
						hideAll();
					}
				));
				this._draggable.connect('drag-end', Lang.bind(this,
					function () {
						log('it ended');
						Main.overview.endItemDrag(this);
						
						hideAll();
					}
				));
			}
			
			
			
		});
		
		
		
		
		
		
	}
	
	
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid.actor.x);
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid.actor.y);
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid.actor.width); //96
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid.actor.height);
//	log('~~~~~~~~~~');
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid._getHItemSize()); //96
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid._rowsPerPage);
//	log('~~~~~~~~~~');
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid._grid.x);
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid._grid.y);
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid._grid.width); //96
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid._grid.height);
//	log('~~~~~~~~~~');
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid.topPadding);
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid.bottomPadding);
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid.rightPadding);
//	log(Main.overview.viewSelector.appDisplay._views[1].view._grid.leftPadding);
	
	
	
	
	if (!AppDisplay.AppIcon.injections2) {
	
		AppDisplay.AppIcon.prototype.injections2 = true;
		
		if (injections['_init3']) {
			removeInjection(AppDisplay.AppIcon.prototype, injections, '_init3');
		}
		
		injections['_init3'] = injectToFunction(AppDisplay.AppIcon.prototype, '_init', function(){
		
		
//			this._draggable = DND.makeDraggable(this.actor); //FIXME ??
			this._draggable.connect('drag-begin', Lang.bind(this,
				function () {
					//this._removeMenuTimeout(); //FIXME ??
					Main.overview.beginItemDrag(this);
					log('it has begun (app)');
					deleteAction.actor.visible = true;
					createAction.actor.visible = true;
					if (
						Main.overview.viewSelector.appDisplay._views[1].view._currentPopup
						&&
						Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source._boxPointerArrowside == St.Side.TOP
					) {
						upAction.actor.visible = false;
						downAction.actor.visible = false;
						removeActionTop.actor.visible = true;
						removeActionBottom.actor.visible = false;
					} else if (
						Main.overview.viewSelector.appDisplay._views[1].view._currentPopup
						&&
						Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source._boxPointerArrowside == St.Side.BOTTOM
					) {
						upAction.actor.visible = false;
						downAction.actor.visible = false;
						removeActionTop.actor.visible = false;
						removeActionBottom.actor.visible = true;
					} else {
						removeActionTop.actor.visible = false;
						removeActionBottom.actor.visible = false;
						upAction.actor.visible = true;
						downAction.actor.visible = true;
					}
					
				}
			));
			this._draggable.connect('drag-cancelled', Lang.bind(this,
				function () {
					log('cancelled');
					Main.overview.cancelledItemDrag(this);
					
					hideAll();
				}
			));
			this._draggable.connect('drag-end', Lang.bind(this,
				function () {
					log('it ended');
					Main.overview.endItemDrag(this);
					
					hideAll();
				}
			));
			
		});
	
	
	}
	
	
	
	
	
}

function hideAll() {
	deleteAction.actor.visible = false;
	createAction.actor.visible = false;
	upAction.actor.visible = false;
	downAction.actor.visible = false;
	removeActionTop.actor.visible = false;
	removeActionBottom.actor.visible = false;
}

