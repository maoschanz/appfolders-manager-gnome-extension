//dragAndDrop.js

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

//-------------------------------------------------
/* do not edit this section */

let injections=[];

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

//-------------------------------------------------

var OVERLAY_MANAGER;

function initDND () {
	OVERLAY_MANAGER = new OverlayManager();
	
	injections['_init2'] = injectToFunction(AppDisplay.AppIcon.prototype, '_init', function(){
		this._draggable.connect('drag-begin', Lang.bind(this,
			function () { //TODO optimization
				this._removeMenuTimeout(); // why ?
				Main.overview.beginItemDrag(this);
				OVERLAY_MANAGER.popdownFolder();
			}
		));
		this._draggable.connect('drag-cancelled', Lang.bind(this,
			function () {
				Main.overview.cancelledItemDrag(this);
				OVERLAY_MANAGER.updateState(false);
			}
		));
		this._draggable.connect('drag-end', Lang.bind(this,
			function () {
				Main.overview.endItemDrag(this);
				OVERLAY_MANAGER.updateState(false);
			}
		));
	});
}

//--------------------------------------------------------------

const OverlayManager = new Lang.Class({
	Name:	'OverlayManager',
	
	_init:	function () {
		this.addActions = [];
		this.removeAction = new FolderActionArea('remove');
		this.createAction = new FolderActionArea('create');
		this.upAction = new NavigationArea('up');
		this.downAction = new NavigationArea('down');
	},

	updateArrowVisibility:	function () {
		let grid = Main.overview.viewSelector.appDisplay._views[1].view._grid;
		if (grid.currentPage == 0) {
			this.upAction.setActive(false);
		} else {
			this.upAction.setActive(true);
		}
		if (grid.currentPage == grid._nPages -1) {
			this.downAction.setActive(false);
		} else {
			this.downAction.setActive(true);
		}
		this.upAction.show();
		this.downAction.show();
	},

	updateState:	function (isDragging) {
		if (isDragging) {
			this.removeAction.show();
			if (this.openedFolder == null) {
				this.removeAction.setActive(false);
			} else {
				this.removeAction.setActive(true);
			}
			this.createAction.show();
			this.updateArrowVisibility();
		} else {
			this.hideAll();
		}
	},

	hideAll:	function () {
		this.removeAction.hide();
		this.createAction.hide();
		this.upAction.hide();
		this.downAction.hide();
		this.hideAllFolders();
	},

	hideAllFolders:	function () {
		for (var i = 0; i < this.addActions.length; i++) {
			this.addActions[i].hide();
		}
	},

	findBorders:	function () {
		let y = 0;
		let monitor = Main.layoutManager.primaryMonitor;
		let widget = null;
		let upper = null;
		let lower = null;
		
		while (lower == null) {
			widget = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, monitor.width-1, y);
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
	},

	updateActorsPositions:	function () {
		let monitor = Main.layoutManager.primaryMonitor;
		let [bottomOfTheGrid, topOfTheGrid] = this.findBorders();
		let _availHeight = bottomOfTheGrid - topOfTheGrid;
		let _availWidth = Main.overview.viewSelector.appDisplay._views[1].view._grid.actor.width;
		let sideMargin = (monitor.width - _availWidth) / 2;
		
		let xMiddle = ( monitor.x + monitor.width ) / 2;
		let yMiddle = ( monitor.y + monitor.height ) / 2;
		
		// Positions of areas
		this.removeAction.setPosition( xMiddle , bottomOfTheGrid );
		this.createAction.setPosition( xMiddle, Main.overview._panelGhost.height );
		this.upAction.setPosition( 0, Main.overview._panelGhost.height );
		this.downAction.setPosition( 0, bottomOfTheGrid );
		
		// Sizes of areas
		this.removeAction.setSize(xMiddle, monitor.height - bottomOfTheGrid);
		this.createAction.setSize(xMiddle, topOfTheGrid - Main.overview._panelGhost.height);
		this.upAction.setSize(xMiddle, topOfTheGrid - Main.overview._panelGhost.height);
		this.downAction.setSize(xMiddle, monitor.height - bottomOfTheGrid);
		
		this.updateArrowVisibility();
	},

	computeFolderOverlayActors:	function (movingFolderId) {
		for (var i = 0; i < this.addActions.length; i++) {
			this.addActions[i].actor.destroy();
		}
		
		let allAppsGrid = Main.overview.viewSelector.appDisplay._views[1].view._grid;

		let availHeightPerPage = (allAppsGrid.actor.height)/(allAppsGrid._nPages);
		let parentBox = allAppsGrid.actor.get_parent().allocation;
		let gridBox = allAppsGrid.actor.get_theme_node().get_content_box(parentBox);
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
		let xMiddle = ( monitor.x + monitor.width ) / 2;
		let yMiddle = ( monitor.y + monitor.height ) / 2;
		
		for (var i = 0; i < indexes.length; i++) {
			let inPageIndex = indexes[i] % allAppsGrid._childrenPerPage;
			let page = Math.floor(indexes[i] / allAppsGrid._childrenPerPage);
			
			if ((decrementLimit == null) || (i < decrementLimit)) {
				[x, y] = folders[i].actor.get_position();
			} else {
				[x, y] = previous[i].actor.get_position();
			}
			
			x += allAppsGrid.leftPadding * 3; //XXX this works perfectly, but for no reason
			
			y = y + this.findBorders()[1];
			y = y - (page * availHeightPerPage);
			
			this.addActions[i] = new FolderArea(folders[i].id, x, y, page);
		}

		this.updateFoldersVisibility();
	},

	updateFoldersVisibility:	function () {
		let currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
		for (var i = 0; i < this.addActions.length; i++) {
			if ( Convenience.getSettings('org.gnome.shell.extensions.appfolders-manager').get_boolean('debug') ) {
				log(currentPage + 'ème page ; dossier en page ' + this.addActions[i].page +
				' ; positionné en ' + this.addActions[i].actor.x + ', ' + this.addActions[i].actor.y);
			}
			if (100 > this.addActions[i].actor.x) {	// TODO hack immonde à virer
				this.addActions[i].hide();			// TODO hack immonde à virer
			} else								// TODO hack immonde à virer
			if ((this.addActions[i].page == currentPage) && (!Main.overview.viewSelector.appDisplay._views[1].view._currentPopup)) {
				this.addActions[i].show();
			} else {
				this.addActions[i].hide();
			}
		}
	},

	popdownFolder:	function () {
		if (Main.overview.viewSelector.appDisplay._views[1].view._currentPopup) {
			this.openedFolder = Main.overview.viewSelector.appDisplay._views[1].view._currentPopup._source.id;
			Main.overview.viewSelector.appDisplay._views[1].view._currentPopup.popdown();
		} else {
			this.openedFolder = null;
		}
		this.computeFolderOverlayActors(null);
		this.updateActorsPositions();
		this.updateState(true);
	},
	
	goToPage:	function (nb) {
		Main.overview.viewSelector.appDisplay._views[1].view.goToPage( nb );
		this.updateArrowVisibility();
		this.hideAllFolders();
		this.updateFoldersVisibility(); //load folders of the new page
	},

	destroy:	function () {
		for (let i = 0; i > this.addActions.length; i++) {
			this.addActions[i].destroy();
		}
		this.removeAction.destroy();
		this.createAction.destroy();
		this.upAction.destroy();
		this.downAction.destroy();
		log('OverlayManager no destroy');
	},
});

//-------------------------------------------------------

const DroppableArea = new Lang.Class({
	Name:		'DroppableArea',
	Abstract:	true,
	
	_init:		function (id) {
		this.id = id;
		this.styleClass = 'folderArea';
		
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
	
	setSize:	function (w, h) {
		this.actor.width = w;
		this.actor.height = h;
	},
	
	hide:		function () {
		this.actor.visible = false;
		this.lock = true;
	},
	
	show:		function () {
		this.actor.visible = true;
	},
	
	setActive:	function (active) {
		this._active = active;
		if (this._active) {
			this.actor.style_class = this.styleClass;
		} else {
			this.actor.style_class = 'insensitiveArea';
		}
	},
	
	destroy:	function () {
		this.actor.destroy();
	},
});

const FolderActionArea = new Lang.Class({
	Name:		'FolderActionArea',
	Extends:	DroppableArea,
	
	_init:	function(id) {
		this.parent(id);
		
		let x, y, label;
		
		switch (this.id) {
			case 'create':
				label = _("Create a new folder");
				this.styleClass = 'shadowedAreaTop';
			break;
			case 'remove':
				label = '';
				this.styleClass = 'shadowedAreaBottom';
			break;
			default:
				label = 'invalid id';
			break;
		}
		if (this.use_frame) {
			this.styleClass = 'framedArea';
		}
		this.actor.style_class = this.styleClass;
		
		this.label = new St.Label({
			text: label,
			style_class: 'dropAreaLabel',
			x_expand: true,
			y_expand: true,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this.actor.add(this.label);
		
		this.setPosition(10, 10);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
	},
	
	getRemoveLabel: function () {
		let label = _("Remove from ");
		if (OVERLAY_MANAGER.openedFolder == null) {
			label += '…';
		} else {
			let folder_schema = Extension.folderSchema (OVERLAY_MANAGER.openedFolder);
			label += folder_schema.get_string('name');
		}
		return label;
	},
	
	setActive: function (active) {
		this.parent(active);
		if (this.id == 'remove') {
			this.label.text = this.getRemoveLabel();
		}
	},
	
	handleDragOver: function (source, actor, x, y, time) {
		if (source instanceof AppDisplay.AppIcon && this._active) {
			return DND.DragMotionResult.MOVE_DROP;
		}
		Main.overview.endItemDrag(this);
		return DND.DragMotionResult.NO_DROP;
	},
	
	acceptDrop: function (source, actor, x, y, time) {
		if ((source instanceof AppDisplay.AppIcon) && (this.id == 'create')) {
			Extension.createNewFolder(source);
			Main.overview.endItemDrag(this);
			return true;
		}
		if ((source instanceof AppDisplay.AppIcon) && (this.id == 'remove')) {
			this.removeApp(source);
			Main.overview.endItemDrag(this);
			return true;
		}
		Main.overview.endItemDrag(this);
		return false;
	},
	
	removeApp: function (source) {
		let id = source.app.get_id();
		Extension.removeFromFolder(id, OVERLAY_MANAGER.openedFolder);
		OVERLAY_MANAGER.updateState(false);
		Main.overview.viewSelector.appDisplay._views[1].view._redisplay();
	},
	
	destroy:	function () {
		this.label.destroy();
		this.parent();
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
				this.styleClass = 'shadowedAreaTop';
			break;
			case 'down':
				i = 'pan-down-symbolic';
				this.styleClass = 'shadowedAreaBottom';
			break;
			default:
				i = 'dialog-error-symbolic';
			break;
		}
		if (this.use_frame) {
			this.styleClass = 'framedArea';
		}
		this.actor.style_class = this.styleClass;
		
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
		if (this.id == 'up' && this._active) {
			this.pageUp();
			return DND.DragMotionResult.CONTINUE;
		}
		
		if (this.id == 'down' && this._active) {
			this.pageDown();
			return DND.DragMotionResult.CONTINUE;
		}
		
		Main.overview.endItemDrag(this);
		return DND.DragMotionResult.NO_DROP;
	},

	pageUp:	function() {
		if(this.lock && !this.timeoutSet) {
			this._timeoutId = Mainloop.timeout_add(CHANGE_PAGE_TIMEOUT, Lang.bind(this, this.unlock));
			this.timeoutSet = true;
		}
		if(!this.lock) {
			let currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
			this.lock = true;
			OVERLAY_MANAGER.goToPage(currentPage - 1);
		}
	},
	
	pageDown:	function() {
		if(this.lock && !this.timeoutSet) {
			this._timeoutId = Mainloop.timeout_add(CHANGE_PAGE_TIMEOUT, Lang.bind(this, this.unlock));
			this.timeoutSet = true;
		}
		if(!this.lock) {
			let currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
			this.lock = true;
			OVERLAY_MANAGER.goToPage(currentPage + 1);
		}
	},

	acceptDrop: function(source, actor, x, y, time) {
		Main.overview.endItemDrag(this);
		return false;
	},
	
	unlock:		function() {
		this.lock = false;
		this.timeoutSet = false;
		Mainloop.source_remove(this._timeoutId);
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
			this.styleClass = 'framedArea';
			this.actor.add(new St.Label({
				text: this.id,
				x_expand: true,
				y_expand: true,
				x_align: Clutter.ActorAlign.CENTER,
				y_align: Clutter.ActorAlign.CENTER,
			}));
		} else {
			this.styleClass = 'folderArea';
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
		if (this.use_frame) {
			this.styleClass = 'framedArea';
		}
		this.actor.style_class = this.styleClass;
		
		this.setPosition(asked_x, asked_y);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
	},
	
	handleDragOver: function(source, actor, x, y, time) {
		if (source instanceof AppDisplay.AppIcon) {
			return DND.DragMotionResult.MOVE_DROP;
		}
		Main.overview.endItemDrag(this);
		return DND.DragMotionResult.NO_DROP;
	},
	
	acceptDrop: function(source, actor, x, y, time) { //FIXME recharger la vue ou au minimum les icônes des dossiers
		if (source instanceof AppDisplay.AppIcon) {
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
