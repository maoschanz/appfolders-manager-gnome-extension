
const DND = imports.ui.dnd;
const AppDisplay = imports.ui.appDisplay;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Extension = Me.imports.extension;

const CHANGE_PAGE_TIMEOUT = 250;
const POPDOWN_TIMEOUT = 500;
const OPEN_FOLDER_TIMEOUT = 800;
const POPDOWN_ACTOR_HEIGHT = 100;

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
moving folders don't redraw overlays actors for folders ??
set positions of these actors for folders


*/

// droppable: create, delete
const FolderActionArea = new Lang.Class({
	Name:	'FolderActionArea',
	
	_init:	function(id) {
		this.id = id;
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
				i = 'folder-new-symbolic';
//				i = 'list-add-symbolic';
			break;
			default:
				x = 10;
				y = 10;
				h = 10;
				w = 10;
				i = 'face-sad-symbolic';
			break;
		}
		
		this.actor = new St.BoxLayout ({
			width: w,
			height: h,
			style_class: 'actionArea',
			visible: false,
		});
		this.actor.add(new St.Icon({
			icon_name: i,
			icon_size: 16,
			style_class: 'system-status-icon',
			x_expand: true,
			y_expand: true,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		}));
		
		this.setPosition(x, y);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
		this.actor._delegate = this;
		
		this.lock = false
	},
	
	setPosition: function (x, y) {
		let monitor = Main.layoutManager.primaryMonitor;
		this.actor.set_position(
			monitor.x + x,
			monitor.y + y
		);
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
			log('non');
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
		}
		
		if (this.id == 'create') {
			if (source instanceof AppDisplay.FolderIcon) {
				log('ça ne fait pas sens de creer un dossier en droppant un dossier, sombre connard');
				Main.overview.endItemDrag(this);
				return false;
			} else if (source instanceof AppDisplay.AppIcon) {
				Extension.createNewFolder(source);
				Main.overview.endItemDrag(this);
				return true;
			}
		}
		
		Main.overview.endItemDrag(this);
		return false;
	},
	
	removeApp: function(source) {
		let id = source.app.get_id();
		log('id : ' + id);
			
		let _folder = Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source.id;
		log('_folder : ' + _folder);
		//FIXME dans le cas où c'est nul il faut supprimer de tous les dossiers mais n'exclure d'aucun,
		//ce qui demande une autre fonction !
		
		let currentFolderSchema = new Gio.Settings({
			schema_id: 'org.gnome.desktop.app-folders.folder',
			path: '/org/gnome/desktop/app-folders/folders/' + _folder + '/'
		});
		
		if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) {
			log('true 191');
			Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown();
		} else {
			log('false 194');
		}
							
		Extension.removeFromFolder(id, currentFolderSchema);
		
		Main.overview.viewSelector.appDisplay._views[1].view._redisplay();
	},
	
	deleteFolder(source) {
		Extension.deleteFolder(source);
		hideAll();
	}
	
});


const NavigationArea = new Lang.Class({
	Name:	'NavigationArea',
	
	_init:	function(id) {
		this.id = id;
		let x, y, h, w, i;
		switch (this.id) { //FIXME arbitrary hardcoded values are overwriten anyway
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
			case 'popdown-top':
				x = 300;
				y = 130;
				h = 120;
				w = 800;
				i = 'pan-start-symbolic';
			break;
			case 'popdown-bottom':
				x = 300;
				y = 530;
				h = 120;
				w = 800;
				i = 'pan-start-symbolic';
			break;
			default:
				x = 10;
				y = 10;
				h = 10;
				w = 10;
				i = 'face-sad-symbolic';
			break;
		}
		
		this.actor = new St.BoxLayout ({
			width: w,
			height: h,
			style_class: 'navigationArea',
			visible: false,
		});
		this.actor.add(new St.Icon({
			icon_name: i,
			icon_size: 16,
			style_class: 'system-status-icon',
			x_expand: true,
			y_expand: true,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		}));
		
		this.setPosition(x, y);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
		this.actor._delegate = this;
		
		this.lock = false
	},
	
	setPosition: function (x, y) {
		let monitor = Main.layoutManager.primaryMonitor;
		this.actor.set_position(
			monitor.x + x,
			monitor.y + y
		);
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
		
		if (this.id == 'popdown-top') {
			if (source instanceof AppDisplay.FolderIcon) {
				this.popdown();
				return DND.DragMotionResult.MOVE_DROP;
			} else if (source instanceof AppDisplay.AppIcon) {
				this.popdown();
				return DND.DragMotionResult.MOVE_DROP;
			}
			log('wtf did i just drag ?');
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
		
		if (this.id == 'popdown-bottom') {
			if (source instanceof AppDisplay.FolderIcon) {
				this.popdown();
				return DND.DragMotionResult.MOVE_DROP;
			} else if (source instanceof AppDisplay.AppIcon) {
				this.popdown();
				return DND.DragMotionResult.MOVE_DROP;
			}
			log('wtf did i just drag ?');
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
		
	},
	
	popdown: function() {		
		if(!this.lock){ 
			log('---------- 446 ----------');
			if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) { //FIXME mécanisme similaire partout
				log('---------- 448 ----------');
				Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown();
			
				this._timeoutId = Mainloop.timeout_add(POPDOWN_TIMEOUT, Lang.bind(this, this.unlock));
				this.lock = true;
				
				removeActionTop.actor.visible = false;
				removeActionBottom.actor.visible = false;
				upAction.actor.visible = true;
				downAction.actor.visible = true;
			
				hideAllFolders();
				computeFolderOverlayActors();
				computeActionActors();
			}
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
			
			this.updateArrowVisibility();			
			this._timeoutId = Mainloop.timeout_add(CHANGE_PAGE_TIMEOUT, Lang.bind(this, this.unlock));
			this.lock = true;
			hideAllFolders();
			computeFolderOverlayActors();
		}
	},
	
	updateArrowVisibility: function() {
		upAction.actor.visible = true;
		downAction.actor.visible = true;
		if (Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage == 0) {
			upAction.actor.visible = false;
		}
		if (Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage == Main.overview.viewSelector.appDisplay._views[1].view._grid._nPages -1) {
			downAction.actor.visible = false;
		}
	},
	
	pageDown: function() {
		if(!this.lock) {
			var currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
			log(currentPage);
			Main.overview.viewSelector.appDisplay._views[1].view.goToPage( currentPage + 1 );
			
			this.updateArrowVisibility();	
			this._timeoutId = Mainloop.timeout_add(CHANGE_PAGE_TIMEOUT, Lang.bind(this, this.unlock));
			this.lock = true;
			hideAllFolders();
			computeFolderOverlayActors();
		}
	},

	acceptDrop: function(source, actor, x, y, time) {
		log('no drop here pls, it makes no sense');
		
		Main.overview.endItemDrag(this);
		return false;
	},
	
});

const FolderArea = new Lang.Class({
	Name:	'FolderArea',
	
	_init:	function(id, asked_x, asked_y) {
		this.id = id;
		let x, y, h, w, i;
		x = asked_x;
		y = asked_y;
		h = 96;
		w = 96;
		i = 'list-add-symbolic';
		
		this.actor = new St.BoxLayout ({
			width: w,
			height: h,
			style_class: 'folderArea',
			visible: false,			
		});
		this.actor.add(new St.Icon({
			icon_name: i,
			icon_size: 16,
			style_class: 'system-status-icon',
			x_expand: true,
			y_expand: true,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		}));
		
		this.setPosition(x, y);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
		this.actor._delegate = this;
		
		this.lock = false
	},
	
	setPosition: function (x, y) {
		let monitor = Main.layoutManager.primaryMonitor;
		this.actor.set_position(
			monitor.x + x,
			monitor.y + y
		);
	},
	
	handleDragOver: function(source, actor, x, y, time) {
		log('________________ 463 ________________');
		if (source instanceof AppDisplay.FolderIcon) {
			this.popupFolder();
			return DND.DragMotionResult.MOVE_DROP;
		} else if (source instanceof AppDisplay.AppIcon) {
			this.popupFolder();
			return DND.DragMotionResult.MOVE_DROP;
		}
		Main.overview.endItemDrag(this);
		return DND.DragMotionResult.NO_DROP;
		
	},
	
	unlock: function() {
		this.lock = false;
		log('unlock - hybrid');
		
		//FIXME ???
		
		computeFolderOverlayActors();
		computeActionActors();
		
		//FIXME ??
		
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
		}
		
		Mainloop.source_remove(this._timeoutId);
	},
	
	popupFolder: function() {		
		if(!this.lock){
			log('popupFolder ++++++++++++++++++');
			for(var i = 0; i < Main.overview.viewSelector.appDisplay._views[1].view.folderIcons.length; i++) {
				log('ET...' + Main.overview.viewSelector.appDisplay._views[1].view.folderIcons[i].id + ' ... ' + this.id);
				if (Main.overview.viewSelector.appDisplay._views[1].view.folderIcons[i].id == this.id) {
					log('ET QUE S\'OUVRE LE DOSSIER !');
					Main.overview.viewSelector.appDisplay._views[1].view.folderIcons[i]._ensurePopup();
					Main.overview.viewSelector.appDisplay._views[1].view.folderIcons[i].view.actor.vscroll.adjustment.value = 0;
					Main.overview.viewSelector.appDisplay._views[1].view.folderIcons[i]._openSpaceForPopup();
				}
			}
		
			this._timeoutId = Mainloop.timeout_add(OPEN_FOLDER_TIMEOUT, Lang.bind(this, this.unlock));
			this.lock = true;
			
			hideAllFolders();
		}
	},
	
	acceptDrop: function(source, actor, x, y, time) {
		//TODO
		
		
		Main.overview.endItemDrag(this);
		return false;
	},
	
});


let deleteAction;
let createAction;
let upAction;
let downAction;
let removeActionTop;
let removeActionBottom;
let addActions = [];
	
function dndInjections() {
	
	deleteAction = new FolderActionArea('delete');
	createAction = new FolderActionArea('create');
	upAction = new NavigationArea('up');
	downAction = new NavigationArea('down');
	removeActionTop = new NavigationArea('popdown-top');
	removeActionBottom = new NavigationArea('popdown-bottom');
	
	
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
						createAction.actor.visible = false;
						computeFolderOverlayActors();
						computeActionActors();
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
							upAction.updateArrowVisibility();
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
					computeActionActors();
					computeFolderOverlayActors();
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
						upAction.updateArrowVisibility();
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
	hideAllFolders();
}

function hideAllFolders () {
	for (var i = 0; i < addActions.length; i++) {
		addActions[i].actor.visible = false;
	}
}

function computeActionActors () {

	let monitor = Main.layoutManager.primaryMonitor;
	
	let pertinentGrid;
	if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) {
		pertinentGrid = Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source.view._grid;
		log('grid inadaptée à un popup fermé');
	} else {
		pertinentGrid = Main.overview.viewSelector.appDisplay._views[1].view._grid;
	}
	let _availWidth = pertinentGrid.actor.width;
	let _availHeight = //do not use the pertinentGrid here since it's a scrollable grid.
		(Main.overview.viewSelector.appDisplay._views[1].view._grid.actor.height)
		/
		(Main.overview.viewSelector.appDisplay._views[1].view._grid._nPages)
	;
	
	let xMiddle = ( monitor.x + monitor.width ) / 2;
	let yMiddle = ( monitor.y + monitor.height ) / 2;
	
	let sideMargin = (monitor.width - _availWidth) / 2;
	
	let topOfTheGrid = yMiddle - (_availHeight/2);
	let bottomOfTheGrid = yMiddle + (_availHeight/2);
	
	deleteAction.setPosition( sideMargin/2 ,  topOfTheGrid );
	createAction.setPosition( monitor.width - sideMargin, topOfTheGrid );
	upAction.setPosition( sideMargin, 0 );
	downAction.setPosition( sideMargin, bottomOfTheGrid );
	removeActionTop.setPosition( sideMargin + _availWidth * 0.1, topOfTheGrid );
	removeActionBottom.setPosition( sideMargin + _availWidth * 0.1, bottomOfTheGrid - POPDOWN_ACTOR_HEIGHT );
	
	deleteAction.actor.width = sideMargin/2;
	createAction.actor.width = sideMargin/2;
	upAction.actor.width = _availWidth;
	downAction.actor.width = _availWidth;
	removeActionTop.actor.width = _availWidth * 0.8;
	removeActionBottom.actor.width = _availWidth * 0.8;
	
	deleteAction.actor.height = _availHeight;
	createAction.actor.height = _availHeight;
	upAction.actor.height = topOfTheGrid;
	downAction.actor.height = monitor.height - bottomOfTheGrid;
	removeActionTop.actor.height = POPDOWN_ACTOR_HEIGHT;
	removeActionBottom.actor.height = POPDOWN_ACTOR_HEIGHT;
}

function computeFolderOverlayActors () {
	
	let foldersArray = Extension.FOLDER_SCHEMA.get_strv('folder-children');
		//FIXME ne s'adapte pas au nombre réel de dossiers
	for (var i = 0 ; i < foldersArray.length ; i++) {
		
		let x = Main.overview.viewSelector.appDisplay._views[1].view._availWidth/2;
		let y = Main.overview.viewSelector.appDisplay._views[1].view._availHeight/2;
		
		
		
		
		
		
		log('positionning the overlay of ' + foldersArray[i] + ' at: ' + x + ', ' + y);
		
		//------------------------------------
		
		addActions[i] = new FolderArea(foldersArray[i], x-30+i*30, y-30+i*30);
	}
	
	for (var i = 0; i < addActions.length; i++) {
		let itemPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.getItemPage(
			Main.overview.viewSelector.appDisplay._views[1].view.folderIcons[i].actor
		);
		let currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
		log(currentPage + ' *** ' + itemPage);
		if ((itemPage == currentPage) && (!Main.overview.viewSelector.appDisplay._views[1].view._currentPopup)) {
			addActions[i].actor.visible = true;
			log('the ' + i + 'th actor is visible.');
		} else {
			addActions[i].actor.visible = false;
			log('the ' + i + 'th actor is not.');
		}
	}
	log('folders overlays are finished');
}




