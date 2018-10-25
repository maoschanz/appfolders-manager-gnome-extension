'use strict';

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
const POPDOWN_ACTOR_HEIGHT = 122; //FIXME booooo ugly

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
		this.use_frame = Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('debug');
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
		
		let x, y, label;
		
		switch (this.id) {
			case 'delete':
				label = _("Delete this folder");
				this.actor.style_class = 'shadowedAreaBottom';
			break;
			case 'create':
				label = _("Create a new folder");
				this.actor.style_class = 'shadowedAreaTop';
			break;
			default:
				label = 'invalid id';
			break;
		}
		
		if (this.use_frame) {
			this.actor.style_class = 'framedArea';
		}
		
		this.actor.add(new St.Label({
			text: label,
			style_class: 'dropAreaLabel',
			x_expand: true,
			y_expand: true,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		}));
		
		this.setPosition(10, 10);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
	},
	
	handleDragOver: function(source, actor, x, y, time) {		
		if (source instanceof AppDisplay.AppIcon) {
			return DND.DragMotionResult.MOVE_DROP;
		} else if ((source instanceof AppDisplay.FolderIcon) && (this.id == 'delete')) {
			return DND.DragMotionResult.MOVE_DROP;
		}
		Main.overview.endItemDrag(this);
		return DND.DragMotionResult.NO_DROP;
	},
	
	acceptDrop: function(source, actor, x, y, time) {		
		if ((source instanceof AppDisplay.FolderIcon) && (this.id == 'delete')) {
			this.deleteFolder(source);
			Main.overview.endItemDrag(this);
			return true;
		} else if ((source instanceof AppDisplay.AppIcon) && (this.id == 'create')) {
			Extension.createNewFolder(source);
			Main.overview.endItemDrag(this);
			return true;
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
				this.actor.style_class = 'shadowedAreaTop';
			break;
			case 'down':
				i = 'pan-down-symbolic';
				this.actor.style_class = 'shadowedAreaBottom';
			break;
			case 'popdown-bottom':
				i = 'pan-start-symbolic';
				this.actor.style_class = 'shadowedAreaBottom';
			break;
			case 'popdown-top':
				i = 'pan-start-symbolic';
				this.actor.style_class = 'shadowedAreaTop';
			break;
			default:
				i = 'pan-start-symbolic';
			break;
		}
		
		if (this.use_frame) {
			this.actor.style_class = 'framedArea';
		}
		
		this.actor.add(new St.Icon({
			icon_name: i,
			icon_size: 24,
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
				
				computeFolderOverlayActors(null);
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
			updateFoldersVisibility(); //load folders of the new page
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
			updateFoldersVisibility();//load folders of the new page
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
		log('remove app : ' + id);
		
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

		let grid = Main.overview.viewSelector.appDisplay._views[1].view._grid;
		this.actor.width = grid._getHItemSize();
		this.actor.height = grid._getVItemSize();
		
		if (this.use_frame) {
			this.actor.style_class = 'framedArea';
			this.actor.add(new St.Label({
				text: this.id,
				x_expand: true,
				y_expand: true,
				x_align: Clutter.ActorAlign.CENTER,
				y_align: Clutter.ActorAlign.CENTER,
			}));
		} else {
			this.actor.style_class = 'folderArea';
			this.actor.add(new St.Icon({
				icon_name: 'list-add-symbolic',
				icon_size: 24,
				style_class: 'system-status-icon',
				x_expand: true,
				y_expand: true,
				x_align: Clutter.ActorAlign.CENTER,
				y_align: Clutter.ActorAlign.CENTER,
			}));
		}
		
		this.setPosition(asked_x, asked_y);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
	},
	
	handleDragOver: function(source, actor, x, y, time) {
		log('_______________survol_______________');
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
			log('[À VIRER] utilisation d\'une clause de garde puissamment maudite');
		}
		injections['_init2'] = injectToFunction(AppDisplay.FolderIcon.prototype, '_init', function(){
			this._draggable = DND.makeDraggable(this.actor);
			this._draggable.connect('drag-begin', Lang.bind(this,
				function () {
//					this._removeMenuTimeout(); //FIXME ??
					Main.overview.beginItemDrag(this);
					log('it has begun (folder)');
					updateActorsPositions();
					computeFolderOverlayActors(this.id);
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
					Main.overview.viewSelector.appDisplay._views[1].view._redisplay(); // TODO à vérifier
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
	
	if (!AppDisplay.AppIcon.injections2) {
		AppDisplay.AppIcon.prototype.injections2 = true;
		if (injections['_init3']) {
			removeInjection(AppDisplay.AppIcon.prototype, injections, '_init3');
			log('[À VIRER] utilisation d\'une clause de garde puissamment maudite');
		}
		injections['_init3'] = injectToFunction(AppDisplay.AppIcon.prototype, '_init', function(){
//			this._draggable = DND.makeDraggable(this.actor); //TODO ??
			this._draggable.connect('drag-begin', Lang.bind(this,
				function () {
					this._removeMenuTimeout(); //TODO ??
					Main.overview.beginItemDrag(this);
					log('it has begun (app)');
					updateActorsPositions();
					computeFolderOverlayActors(null);
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
	if ( // The free space is upon the opened folder
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
	} else if ( // The free space is below the opened folder
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
	} else { // No opened folder
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

function findBorders() { // gérer différemment le cas du popup ? TODO FIXME
	let y = 0;
	let monitor = Main.layoutManager.primaryMonitor;
	let widget = null;
	let upper = null;
	let lower = null;
	
	while (lower == null) {
		widget = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, monitor.width-1, y);
//		if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup)
//			log(widget);
		if (widget instanceof St.Button || widget instanceof St.ScrollView) {
			if (upper == null) {
				upper = y;
			}
		} else {
			if (upper != null) {
				lower = y-15;
			}
		}
		y += 5;
	}
	return [lower, upper];
}

function updateActorsPositions () {

	let monitor = Main.layoutManager.primaryMonitor;
	let [bottomOfTheGrid, topOfTheGrid] = findBorders();
	let _availHeight = bottomOfTheGrid - topOfTheGrid;
	let _availWidth = Main.overview.viewSelector.appDisplay._views[1].view._grid.actor.width;
	let sideMargin = (monitor.width - _availWidth) / 2;
	
	let xMiddle = ( monitor.x + monitor.width ) / 2;
	let yMiddle = ( monitor.y + monitor.height ) / 2;
	
	//---- TODO totally an object-oriented action
	
	deleteAction.setPosition( xMiddle , bottomOfTheGrid );
	createAction.setPosition( xMiddle, Main.overview._panelGhost.height );
	upAction.setPosition( 0, Main.overview._panelGhost.height );
	downAction.setPosition( 0, bottomOfTheGrid );
	
	removeActionTop.setPosition( sideMargin + _availWidth * 0.1, topOfTheGrid );
	removeActionBottom.setPosition( sideMargin + _availWidth * 0.1, bottomOfTheGrid - POPDOWN_ACTOR_HEIGHT );
	addToTop.setPosition( sideMargin + _availWidth * 0.05, topOfTheGrid + POPDOWN_ACTOR_HEIGHT );
	addToBottom.setPosition( sideMargin + _availWidth * 0.05, topOfTheGrid );
	
	//---- TODO totally an object-oriented action
	
	deleteAction.actor.width = xMiddle;
	createAction.actor.width = xMiddle;
	upAction.actor.width = xMiddle;
	downAction.actor.width = xMiddle;
	
	removeActionTop.actor.width = _availWidth * 0.8;
	removeActionBottom.actor.width = _availWidth * 0.8;
	addToTop.actor.width = _availWidth * 0.9; //???
	addToBottom.actor.width = _availWidth * 0.9;
	
	//---- TODO totally an object-oriented action
	
	deleteAction.actor.height = monitor.height - bottomOfTheGrid;
	createAction.actor.height = topOfTheGrid - Main.overview._panelGhost.height;
	upAction.actor.height = topOfTheGrid - Main.overview._panelGhost.height;
	downAction.actor.height = monitor.height - bottomOfTheGrid;
	
	removeActionTop.actor.height = POPDOWN_ACTOR_HEIGHT;
	removeActionBottom.actor.height = POPDOWN_ACTOR_HEIGHT;
	addToTop.actor.height = _availHeight - POPDOWN_ACTOR_HEIGHT;
	addToBottom.actor.height = _availHeight - POPDOWN_ACTOR_HEIGHT;
	
	//----
	
	updateArrowVisibility();
}

function destroyAllFolderAreas () {
	//TODO FIXME déconnecter de force ?
	for (var i = 0; i < addActions.length; i++) {
		addActions[i].actor.destroy();
	}
}

function computeFolderOverlayActors (movingFolderId) {
// TODO ne pas afficher movingFolderId et décaler de -1 ceux qui suivent
	destroyAllFolderAreas();
	
	let allAppsGrid = Main.overview.viewSelector.appDisplay._views[1].view._grid;

	let availHeightPerPage = (allAppsGrid.actor.height)/(allAppsGrid._nPages);
	let parentBox = allAppsGrid.actor.get_parent().allocation;
	let gridBox = allAppsGrid.actor.get_theme_node().get_content_box(parentBox);
	let box = allAppsGrid._grid.get_theme_node().get_content_box(gridBox);
	let children = allAppsGrid._getVisibleChildren();
	let availWidth = box.x2 - box.x1;
	let availHeight = box.y2 - box.y1;
	
	let items = allAppsGrid._grid.get_n_children();
	
	let nItems = 0;
	let indexes = [];
	let folders = [];
	let previous = [];
	let x, y;
	let decrementLimit = null;
	let previousIcon = null;
	
	Main.overview.viewSelector.appDisplay._views[1].view._allItems.forEach(function(icon) {
		if (icon.actor.visible) {
			if ((icon instanceof AppDisplay.FolderIcon) && (icon.id == movingFolderId)) {
				decrementLimit = indexes.length;
			} else if (icon instanceof AppDisplay.FolderIcon) {
				indexes.push(nItems);
				folders.push(icon);
				previous.push(previousIcon);
			}
			nItems++;
			previousIcon = icon;
		}
	});
	
	let monitor = Main.layoutManager.primaryMonitor;
	let rowsPerPage = allAppsGrid._rowsPerPage;
	let [nColumns, usedWidth] = allAppsGrid._computeLayout(availWidth);
	let xMiddle = ( monitor.x + monitor.width ) / 2;
	let yMiddle = ( monitor.y + monitor.height ) / 2;
	
	for (var i = 0; i < indexes.length; i++) {
		let inPageIndex = indexes[i] % allAppsGrid._childrenPerPage;
		let page = Math.floor(indexes[i] / allAppsGrid._childrenPerPage);
	//	log('Le dossier ' + folders[i].id + ' est en ' + inPageIndex + 'ème position sur la ' + page + 'ème page.');
		
		if ((decrementLimit == null) || (i < decrementLimit)) {
			[x, y] = folders[i].actor.get_position();
		} else {
			[x, y] = previous[i].actor.get_position();
		}
		
		x += allAppsGrid.leftPadding * 3; //FIXME this works perfectly, but for no reason
		
		y = y + findBorders()[1];
		y = y - (page * availHeightPerPage);
		
	//	log('positionning the overlay of ' + folders[i].id + ' at: ' + x + ', ' + y);
		addActions[i] = new FolderArea(folders[i].id, x, y, page);
	}

	updateFoldersVisibility();
}

//-----------

function updateFoldersVisibility () {
	let currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
	for (var i = 0; i < addActions.length; i++) {
		log(currentPage + 'ème page ; dossier en page ' + addActions[i].page +
		' ; positionné en ' + addActions[i].actor.x + ', ' + addActions[i].actor.y);
		if (100 > addActions[i].actor.x) {	// TODO hack immonde à virer
			addActions[i].hide();			// TODO hack immonde à virer
		} else								// TODO hack immonde à virer
		if ((addActions[i].page == currentPage) && (!Main.overview.viewSelector.appDisplay._views[1].view._currentPopup)) {
			addActions[i].show();
		} else {
			addActions[i].hide();
		}
	}
}


