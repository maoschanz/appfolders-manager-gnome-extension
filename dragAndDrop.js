
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

const BROWSING_TIMEOUT = 250;

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


const FolderActionBox = new Lang.Class({
	Name:	'FolderActionBox',
	
	_init:	function(id, color) {
		this.id = id;
		this.color = color;
		let x, y, h, w;
		switch (this.id) {
			case 'delete':
				x = 100;
				y = 130;
				h = 520;
				w = 100;
			break;
			case 'create':
				x = 1200;
				y = 130;
				h = 520;
				w = 100;
			break;
			case 'up':
				x = 200;
				y = 30;
				h = 100;
				w = 1000;
			break;
			case 'down':
				x = 200;
				y = 650;
				h = 100;
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
		
		this.actor = new St.BoxLayout ({
			width: w,
			height: h,
			style: 'background-color: ' + this.color + ';',
			visible: false,			
		});
		let monitor = Main.layoutManager.primaryMonitor;
		this.actor.set_position(
			monitor.x + x,
			monitor.y + y
		);
		Main.layoutManager.overviewGroup.add_actor(this.actor);
		this.actor._delegate = this;
		
		this.lock = false
	},
	
	react: function() {
		log(this.id);
	},
	
	handleDragOver: function(source, actor, x, y, time) {
		this.react();

		if (this.id == 'delete') {
			if (source instanceof AppDisplay.FolderIcon) {
				return DND.DragMotionResult.MOVE_DROP;
			} else if (source instanceof AppDisplay.AppIcon) {
				return DND.DragMotionResult.MOVE_DROP;
			}
			log('nani mono, omae wa ??');
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
		
		if (this.id == 'create') {
			if (source instanceof AppDisplay.FolderIcon) {
				return DND.DragMotionResult.MOVE_DROP;
			} else if (source instanceof AppDisplay.AppIcon) {
				return DND.DragMotionResult.MOVE_DROP;
			}
			log('nani mono, omae wa ??');
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
		
		if (this.id == 'up') {
			if (source instanceof AppDisplay.FolderIcon) {
				this.pageUp();
				return DND.DragMotionResult.MOVE_DROP;
			} else if (source instanceof AppDisplay.AppIcon) {
				this.pageUp();
				return DND.DragMotionResult.MOVE_DROP;
			}
			log('nani mono, omae wa ??');
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
			log('nani mono, omae wa ??');
			Main.overview.endItemDrag(this);
			return DND.DragMotionResult.NO_DROP;
		}
		
	},
	
	actualPageUp: function() {
	
		this.lock = false;
		log('unlock');
		Mainloop.source_remove(this._timeoutId);
	},
	
	pageUp: function() {
		if(!this.lock) {
			var currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
			log(currentPage);
			Main.overview.viewSelector.appDisplay._views[1].view.goToPage( currentPage - 1 );
		
			this._timeoutId = Mainloop.timeout_add(BROWSING_TIMEOUT, Lang.bind(this, this.actualPageUp));
			this.lock = true;
		}
	},
	
	pageDown: function() {
		if(!this.lock) {
			var currentPage = Main.overview.viewSelector.appDisplay._views[1].view._grid.currentPage;
			log(currentPage);
			Main.overview.viewSelector.appDisplay._views[1].view.goToPage( currentPage + 1 );
		
			this._timeoutId = Mainloop.timeout_add(BROWSING_TIMEOUT, Lang.bind(this, this.actualPageUp));
			this.lock = true;
		}
	},

	acceptDrop: function(source, actor, x, y, time) {
		log('----------- accept the drop -------------');
		
		
		if (this.id == 'delete') {
			if (source instanceof AppDisplay.FolderIcon) {
				log('omg on supprime un dossier ??????');
				
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
				
				deleteAction.actor.visible = false;
				createAction.actor.visible = false;
				upAction.actor.visible = false;
				downAction.actor.visible = false;
						
				Main.overview.endItemDrag(this);
				return true;
				
			} else if (source instanceof AppDisplay.AppIcon) {
				log('on retire une appli');
				Main.overview.endItemDrag(this);
				return true;
			}
			log('139 no nani mono, omae wa ??');
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
		
		if (this.id == 'up') {
			return false
		}
		
		if (this.id == 'down') {
			return false
		}
		
		
		
		
		this.react();
		
		log(source);
		log("*************");
		log(actor);
		
		Main.overview.endItemDrag(this);
		return true;
	}
	
});

let deleteAction;
let createAction;
let upAction;
let downAction;
	
function dndInjections() {
	
	deleteAction = new FolderActionBox('delete', '#880000');
	createAction = new FolderActionBox('create', '#880000');
	upAction = new FolderActionBox('up', '#008800');
	downAction = new FolderActionBox('down', '#008800');
	
	if (!AppDisplay.FolderIcon.injections2) {
	
		AppDisplay.FolderIcon.prototype.injections2 = true;
		
		if (injections['_init2']) {
			removeInjection(AppDisplay.FolderIcon.prototype, injections, '_init');
		}
		
		injections['_init2'] = injectToFunction(AppDisplay.FolderIcon.prototype, '_init', function(){
			
			let isDraggable = true; //FIXME
			if (isDraggable) {
				this._draggable = DND.makeDraggable(this.actor);
				this._draggable.connect('drag-begin', Lang.bind(this,
					function () {
						//this._removeMenuTimeout(); //FIXME ??
						Main.overview.beginItemDrag(this);
						log('i has begun');
						deleteAction.actor.visible = true;
						createAction.actor.visible = true;
						upAction.actor.visible = true;
						downAction.actor.visible = true;
						
					}
				));
				this._draggable.connect('drag-cancelled', Lang.bind(this,
					function () {
						log('cancelled');
						Main.overview.cancelledItemDrag(this);
						
						deleteAction.actor.visible = false;
						createAction.actor.visible = false;
						upAction.actor.visible = false;
						downAction.actor.visible = false;
					}
				));
				this._draggable.connect('drag-end', Lang.bind(this,
					function () {
						log('dont cry because it ended, smile because it happened');
						Main.overview.endItemDrag(this);
						
						deleteAction.actor.visible = false;
						createAction.actor.visible = false;
						upAction.actor.visible = false;
						downAction.actor.visible = false;
					}
				));
			}
			
			
			
			/*
			
			getDragActor: function() {
				return this.app.create_icon_texture(Main.overview.dashIconSize);
			},

			// Returns the original actor that should align with the actor
			// we show as the item is being dragged.
			getDragActorSource: function() {
				return this.icon.icon;
			},
			
			*/
			
			
			
			
			
			
			
			
			
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
	
	
}






