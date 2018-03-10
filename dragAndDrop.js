
const DND = imports.ui.dnd;
const AppDisplay = imports.ui.appDisplay;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Extension = Me.imports.extension;

const CHANGE_PAGE_TIMEOUT = 300;
const POPDOWN_TIMEOUT = 1000;
const OPEN_FOLDER_TIMEOUT = 1500;
const POPDOWN_ACTOR_HEIGHT = 122;

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

TODO

set positions of actors for folders

*/

const DroppableArea = new Lang.Class({
	Name:		'DroppableArea',
	Abstract:	true,
	
	_init:		function (id) {
		this.id = id;
		
		this.actor = new St.BoxLayout ({
			width: 10,
			height: 10,
			visible: false,
		});
		
		this.actor._delegate = this;
		
		this.lock = true;
	},
	
	setPosition: function (x, y) {
		let monitor = Main.layoutManager.primaryMonitor;
		this.actor.set_position(
			monitor.x + x,
			monitor.y + y
		);
	},
	
	hide:		function () {
		this.actor.visible = false;
		this.lock = true;
	},
	
	show:		function () {
		this.actor.visible = true;
	},
	
	unlock: function() {
		this.lock = false;
		this.timeoutSet = false;
		log('unlock');
		Mainloop.source_remove(this._timeoutId);
	},
	
	
});

const FolderActionArea = new Lang.Class({
	Name:		'FolderActionArea',
	Extends:	DroppableArea,
	
	_init:	function(id) {
		this.parent(id);
		
		let x, y, i;
		
		switch (this.id) {
			case 'delete':
				i = 'user-trash-symbolic';
			break;
			case 'create':
				i = 'folder-new-symbolic';
			break;
			default:
				i = 'face-sad-symbolic';
			break;
		}
		
		this.actor.style_class = 'actionArea';
		
		this.actor.add(new St.Icon({
			icon_name: i,
			icon_size: 16,
			style_class: 'system-status-icon',
			x_expand: true,
			y_expand: true,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		}));
		
		this.setPosition(10, 10);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
		
	},
	
	handleDragOver: function(source, actor, x, y, time) {
		if (this.id == 'delete') {
			if (source instanceof AppDisplay.FolderIcon) {
				return DND.DragMotionResult.MOVE_DROP;
			} else if (source instanceof AppDisplay.AppIcon) {
				return DND.DragMotionResult.MOVE_DROP;
			}
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
		
		if (this.id == 'create') {
			if (source instanceof AppDisplay.AppIcon) {
				return DND.DragMotionResult.MOVE_DROP;
			}
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
	},
	
	acceptDrop: function(source, actor, x, y, time) {		
		if (this.id == 'delete') {
			if (source instanceof AppDisplay.FolderIcon) {
				this.deleteFolder(source);
				Main.overview.endItemDrag(this);
				return true;
			}
		}
		
		if (this.id == 'create') {
			if (source instanceof AppDisplay.AppIcon) {
				Extension.createNewFolder(source);
				Main.overview.endItemDrag(this);
				return true;
			}
		}
		
		hideAll();
		Main.overview.endItemDrag(this);
		return false;
	},
	
	deleteFolder: function(source) {
		Extension.deleteFolder(source.id);
		hideAll();
	},
	
});

const NavigationArea = new Lang.Class({
	Name:	'NavigationArea',
	Extends:	DroppableArea,
	
	_init:	function(id) {
		this.parent(id);
		
		let x, y, i;
		switch (this.id) {
			case 'up':
				i = 'pan-up-symbolic';
			break;
			case 'down':
				i = 'pan-down-symbolic';
			break;
			default:
				i = 'pan-start-symbolic';
			break;
		}
		
		this.actor.style_class = 'navigationArea';
		
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
	},
	
	handleDragOver: function(source, actor, x, y, time) {
		if (this.id == 'up') {
			this.pageUp();
			return DND.DragMotionResult.CONTINUE;
		}
		
		if (this.id == 'down') {
			this.pageDown();
			return DND.DragMotionResult.CONTINUE;
		}
		
		/*
			The popdowning actors behave like a FolderArea actor but
			they have to be NavigationArea because their lifecycle
			is the same as regular "up/down" areas' lifecycle.
		*/
		if ( (this.id == 'popdown-bottom') || (this.id == 'popdown-top') ){
			if (source instanceof AppDisplay.AppIcon) {
				this.popdown();
				return DND.DragMotionResult.MOVE_DROP;
			} else {
				this.popdown();
				return DND.DragMotionResult.CONTINUE;
			}
		}
		
		Main.overview.endItemDrag(this);
		return DND.DragMotionResult.NO_DROP;
	},
	
	popdown: function() {
		if(this.lock && !this.timeoutSet) {
			this._timeoutId = Mainloop.timeout_add(POPDOWN_TIMEOUT, Lang.bind(this, this.unlock));
			this.timeoutSet = true;
		}
		if(!this.lock){
			if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) { //FIXME mécanisme similaire partout ?? utile ?
				Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown();
			
				this.lock = true;
				
				computeFolderOverlayActors();
				updateActorsPositions();
				
				updateState('app-in-allview');
			}
		}
	},

	pageUp: function() {
		if(this.lock && !this.timeoutSet) {
			this._timeoutId = Mainloop.timeout_add(CHANGE_PAGE_TIMEOUT, Lang.bind(this, this.unlock));
			this.timeoutSet = true;
		}
		if(!this.lock) {
			var currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
			Main.overview.viewSelector.appDisplay._views[1].view.goToPage( currentPage - 1 );
			
			updateArrowVisibility();
			
			this.lock = true;
			hideAllFolders();
			computeFolderOverlayActors();
		}
	},
	
	pageDown: function() {
		if(this.lock && !this.timeoutSet) {
			this._timeoutId = Mainloop.timeout_add(CHANGE_PAGE_TIMEOUT, Lang.bind(this, this.unlock));
			this.timeoutSet = true;
		}
		if(!this.lock) {
			var currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
			Main.overview.viewSelector.appDisplay._views[1].view.goToPage( currentPage + 1 );
			
			updateArrowVisibility();
			this.lock = true;
			hideAllFolders();
			computeFolderOverlayActors();
		}
	},

	acceptDrop: function(source, actor, x, y, time) {
		if ((this.id == 'popdown-top') || (this.id == 'popdown-bottom')) {
			if (source instanceof AppDisplay.AppIcon) {
				this.removeApp(source);
				log('removing');
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
		
		if(!Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) {
			log('ERREUR : pas de dossier ouvert');
			return;
		}
		let _folder = Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source.id;
		log('_folder : ' + _folder);
		//FIXME dans le cas où c'est nul il faut supprimer de tous les dossiers mais n'exclure d'aucun,
		//ce qui demande une autre fonction !
		
		if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) {
			Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown();
		}
							
		Extension.removeFromFolder(id, _folder);
		hideAll();
		
		Main.overview.viewSelector.appDisplay._views[1].view._redisplay();
	},
});

const BigArea = new Lang.Class({
	Name:	'BigArea',
	Extends:	DroppableArea,
	
	_init:	function(id) {
		this.parent(id);
		
		this.actor.style_class = 'droppableArea';
		
		this.setPosition(10, 10);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
	},
	
	handleDragOver: function(source, actor, x, y, time) {
		/*
			The popdowning actors behave like a FolderArea actor but
			they have to be NavigationArea because their lifecycle
			is the same as regular "up/down" areas' lifecycle.
		*/
		if (source instanceof AppDisplay.AppIcon) {
			return DND.DragMotionResult.MOVE_DROP;
		}
		Main.overview.endItemDrag(this); //vraiment ?
		return DND.DragMotionResult.NO_DROP;
	},

	acceptDrop: function(source, actor, x, y, time) { //FIXME recharger la vue ou au minimum les icônes des dossiers
		if (source instanceof AppDisplay.AppIcon) {
			let _folder = Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source.id;
			if(_folder == undefined) {
				Main.overview.endItemDrag(this);
				return false;
			}
			if(Extension.isInFolder(source.id, _folder)) {
				Main.overview.endItemDrag(this);
				return false;
			}
			Extension.addToFolder(source, _folder);
			Main.overview.endItemDrag(this);
			return true;
		}
		Main.overview.endItemDrag(this);
		return false;
	},
});

/*
 * This corresponds to the area upon a folder. Position and visibility of the actor
 * is handled by exterior functions.
 * 
 * "this.id" is the folder's id, a string, as written in the gsettings key.
 * 
 * Hovering-while-dragging during OPEN_FOLDER_TIMEOUT milliseconds upon this
 * class' actor will open the corresponding folder if the dragged item is an AppIcon.
 * 
 * Dropping another folder on this folder will merge them (dropped folder is deleted)
 * Dropping an app on this folder will add it to the folder
 */
const FolderArea = new Lang.Class({
	Name:		'FolderArea',
	Extends:	DroppableArea,
	
	_init:		function(id, asked_x, asked_y, page) {
		this.parent(id);
		this.page = page;
		
		this.actor.style_class = 'folderArea';
		this.actor.width = 96;
		this.actor.height = 96;
		
		this.actor.add(new St.Label({
			text: this.id,
			x_expand: true,
			y_expand: true,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		}));
		
//		this.actor.add(new St.Icon({
//			icon_name: 'list-add-symbolic',
//			icon_size: 16,
//			style_class: 'system-status-icon',
//			x_expand: true,
//			y_expand: true,
//			x_align: Clutter.ActorAlign.CENTER,
//			y_align: Clutter.ActorAlign.CENTER,
//		}));
		
		this.setPosition(asked_x, asked_y);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
	},
	
	handleDragOver: function(source, actor, x, y, time) {
		log('________________ 463 ________________');
		if (source instanceof AppDisplay.FolderIcon) {
			return DND.DragMotionResult.MOVE_DROP;
		} else if (source instanceof AppDisplay.AppIcon) {
			this.popupFolder();
			return DND.DragMotionResult.MOVE_DROP;
		}
		Main.overview.endItemDrag(this);
		return DND.DragMotionResult.NO_DROP;
	},
	
	popupFolder: function() {
		if(this.lock && !this.timeoutSet) {
			this._timeoutId = Mainloop.timeout_add(OPEN_FOLDER_TIMEOUT, Lang.bind(this, this.unlock));
			this.timeoutSet = true;
		}
		if(!this.lock){
			for(var i = 0; i < Main.overview.viewSelector.appDisplay._views[1].view.folderIcons.length; i++) {
				if (Main.overview.viewSelector.appDisplay._views[1].view.folderIcons[i].id == this.id) {
					Main.overview.viewSelector.appDisplay._views[1].view.folderIcons[i]._ensurePopup();
					Main.overview.viewSelector.appDisplay._views[1].view.folderIcons[i].view.actor.vscroll.adjustment.value = 0;
					Main.overview.viewSelector.appDisplay._views[1].view.folderIcons[i]._openSpaceForPopup();
					break;
				}
			}
			
			hideAllFolders();
			
			this._timeoutId2 = Mainloop.timeout_add(500, Lang.bind(this, this.updateRemoveArrow)); //FIXME ????
			
			this.lock = true;
		}
	},
	
	updateRemoveArrow: function () {
		updateFolderViewInterface();
		Mainloop.source_remove(this._timeoutId2);
	},
	
	acceptDrop: function(source, actor, x, y, time) { //FIXME recharger la vue ou au minimum les icônes des dossiers
		if (source instanceof AppDisplay.FolderIcon) {
			hideAll();
			log('merging ' + this.id + ' with ' + source.id);
			Extension.mergeFolders(this.id, source.id); //FIXME suppression intempestive ???
			Main.overview.endItemDrag(this);
			return true;
		} else if (source instanceof AppDisplay.AppIcon) {
			hideAll();
//			if(Extension.isInFolder(source.id, this.id)) {
//				log('app déjà ici');
//				Main.overview.endItemDrag(this);
//				return false;
//			}
			Extension.addToFolder(source, this.id);
			Main.overview.endItemDrag(this);
			return true;
		}
		Main.overview.endItemDrag(this);
		return false;
	},
	
});

//-----------------------------------------------

let deleteAction;
let createAction;
let upAction;
let downAction;
let removeActionTop;
let removeActionBottom;
let addToTop;
let addToBottom;
let addActions = [];
	
function dndInjections() {
	
	deleteAction = new FolderActionArea('delete');
	createAction = new FolderActionArea('create');
	upAction = new NavigationArea('up');
	downAction = new NavigationArea('down');
	removeActionTop = new NavigationArea('popdown-top');
	removeActionBottom = new NavigationArea('popdown-bottom');
	addToTop = new BigArea('popdown-top');
	addToBottom = new BigArea('popdown-bottom');
	
	
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
						computeFolderOverlayActors();
						updateActorsPositions();
						if (!Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) {
							updateState('folder-in-allview');
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
					updateActorsPositions();
					computeFolderOverlayActors();
					if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup){
						updateState('app-in-folderview');
					} else {
						updateState('app-in-allview');
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

//---------------------------------------------

function updateArrowVisibility () {
	if (Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage == 0) {
		upAction.hide();
	} else {
		upAction.show();
	}
	if (Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage == Main.overview.viewSelector.appDisplay._views[1].view._grid._nPages -1) {
		downAction.hide();
	} else {
		downAction.show();
	}
}

function updateFolderViewInterface () {
	if ( // The free space is upon the open folder
		Main.overview.viewSelector.appDisplay._views[1].view._currentPopup
		&&
		Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source._boxPointerArrowside == St.Side.TOP
	) {
		upAction.hide();
		downAction.hide();
		
		removeActionTop.show();
		removeActionBottom.hide();
		addToBottom.hide();
		addToTop.show();
	} else if ( // The free space is below the open folder
		Main.overview.viewSelector.appDisplay._views[1].view._currentPopup
		&&
		Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source._boxPointerArrowside == St.Side.BOTTOM
	) {
		upAction.hide();
		downAction.hide();
		
		removeActionTop.hide();
		removeActionBottom.show();
		addToBottom.show();
		addToTop.hide();
	} else { // No open folder
		removeActionTop.hide();
		removeActionBottom.hide();
		addToBottom.hide();
		addToTop.hide();
	}
}

function updateState (state) {
	
	switch (state) {
		case 'folder-in-allview':
			deleteAction.show();
			createAction.hide();
			updateArrowVisibility();
		break;
		case 'app-in-allview':
			removeActionTop.hide();
			removeActionBottom.hide();
			addToTop.hide();
			addToBottom.hide();
			deleteAction.hide();
			createAction.show();
			updateArrowVisibility();
		break;
		case 'app-in-folderview':
			hideAllFolders();
			deleteAction.hide();
			createAction.show();
			updateFolderViewInterface();
		break;
		default:
			hideAll();
		break;
	}
	log('update : ' + state);
}

function hideAll() {
	deleteAction.hide();
	createAction.hide();
	upAction.hide();
	downAction.hide();
	removeActionTop.hide();
	removeActionBottom.hide();
	addToTop.hide();
	addToBottom.hide();
	hideAllFolders();
}

function hideAllFolders () {
	for (var i = 0; i < addActions.length; i++) {
		addActions[i].hide();
	}
}

let previousWidth = 0;

function updateActorsPositions () {

	let monitor = Main.layoutManager.primaryMonitor;
	let pertinentGrid;
	let _availWidth;
	
	/* The drag begin inside of a folder: */
	if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) {
		// previousWidth is hard to initialize but once set, it shall be used.
		if (previousWidth == 0) {
			pertinentGrid = Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source.view._grid;
			_availWidth = pertinentGrid.actor.width;
		} else {
			_availWidth = previousWidth;
		}
		
	/* The drag begin outside of a folder: */
	} else {
		pertinentGrid = Main.overview.viewSelector.appDisplay._views[1].view._grid; //FIXME ptdrrrrrrrr ok mais ça ne suffit pas manifestement.
		_availWidth = pertinentGrid.actor.width;
		previousWidth = pertinentGrid.actor.width;
	}
	
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
	addToTop.setPosition( sideMargin + _availWidth * 0.05, topOfTheGrid + POPDOWN_ACTOR_HEIGHT );
	addToBottom.setPosition( sideMargin + _availWidth * 0.05, topOfTheGrid );
	
	deleteAction.actor.width = sideMargin/2;
	createAction.actor.width = sideMargin/2;
	upAction.actor.width = _availWidth;
	downAction.actor.width = _availWidth;
	removeActionTop.actor.width = _availWidth * 0.8;
	removeActionBottom.actor.width = _availWidth * 0.8;
	addToTop.actor.width = _availWidth * 0.9; //???
	addToBottom.actor.width = _availWidth * 0.9;
	
	deleteAction.actor.height = _availHeight;
	createAction.actor.height = _availHeight;
	upAction.actor.height = topOfTheGrid;
	downAction.actor.height = monitor.height - bottomOfTheGrid;
	removeActionTop.actor.height = POPDOWN_ACTOR_HEIGHT;
	removeActionBottom.actor.height = POPDOWN_ACTOR_HEIGHT;
	addToTop.actor.height = _availHeight - POPDOWN_ACTOR_HEIGHT;
	addToBottom.actor.height = _availHeight - POPDOWN_ACTOR_HEIGHT;
	
	updateArrowVisibility();
}

function destroyAllFolderAreas () {
	//TODO FIXME déconnecter de force
	for (var i = 0; i < addActions.length; i++) {
		addActions[i].actor.destroy();
	}
}

function computeFolderOverlayActors () {
	
	destroyAllFolderAreas();
	
	let availWidth = Main.overview.viewSelector.appDisplay._views[1].view._grid.actor.width;
	let availHeight = Main.overview.viewSelector.appDisplay._views[1].view._grid.getPageHeight();
	
	let x = availWidth/2;
	let y = availHeight/2;
	
	let items = Main.overview.viewSelector.appDisplay._views[1].view._grid._grid.get_n_children();
	
	let nItems = 0;
	
	let indexes = [];
	let folders = [];
	
	Main.overview.viewSelector.appDisplay._views[1].view._allItems.forEach(function(icon) {
		if (icon.actor.visible) {
			if (icon instanceof AppDisplay.FolderIcon) {
				indexes.push(nItems);
				folders.push(icon);
			}
			nItems++;
		}
	});
	
	let monitor = Main.layoutManager.primaryMonitor;
	let rowsPerPage = Main.overview.viewSelector.appDisplay._views[1].view._grid._rowsPerPage;
	let [nColumns, usedWidth] = Main.overview.viewSelector.appDisplay._views[1].view._grid._computeLayout(availWidth);
	let xMiddle = ( monitor.x + monitor.width ) / 2;
	let yMiddle = ( monitor.y + monitor.height ) / 2;
	
	for (var i = 0; i < indexes.length; i++) {
	
		log(folders[i].id + ' (index ' + indexes[i] + ')');
		
		log(Main.overview.viewSelector.appDisplay._views[1].view._grid._childrenPerPage);
		
		let inPageIndex = indexes[i] % Main.overview.viewSelector.appDisplay._views[1].view._grid._childrenPerPage;
		let page = Math.floor(indexes[i] / Main.overview.viewSelector.appDisplay._views[1].view._grid._childrenPerPage);
		log('inPageIndex: ' + inPageIndex);
		
		x = (inPageIndex % nColumns) - (nColumns/2);
		y = ((inPageIndex - (inPageIndex % nColumns)) / rowsPerPage) - (rowsPerPage/2);
		
		log(x + ' ' + y);
		
		x *= usedWidth / (nColumns + 0.2); /*FIXME responsivness*/
		y *= availHeight / (rowsPerPage + 2); /*FIXME responsivness*/
		
		log(x + ' ' + y);
		
		x = Math.floor(x + xMiddle + (20)); /*FIXME responsivness*/
		y = Math.floor(y + yMiddle - (50)); /*FIXME responsivness*/
		
		log(x + ' ' + y);
		
		log('positionning the overlay of ' + folders[i].id + ' at: ' + x + ', ' + y);
		
		addActions[i] = new FolderArea(folders[i].id, x, y, page);
	
	}

/* mécanisme pour mettre à jour les pages ? pas la peine */

//-----------
	
	for (var i = 0; i < addActions.length; i++) {
		let currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
		log(currentPage + ' *** ' + addActions[i].page);
		if ((addActions[i].page == currentPage) && (!Main.overview.viewSelector.appDisplay._views[1].view._currentPopup)) {
			addActions[i].show();
		} else {
			addActions[i].hide();
		}
	}
}


