#!/bin/bash

if (( $EUID == 0 )); then

	if [ ! -d "/usr/share/gnome-shell/extensions" ]; then
		mkdir /usr/share/gnome-shell/extensions
	fi
	
	INSTALL_DIR="/usr/share/gnome-shell/extensions/appfolders-manager@maestroschan.fr"

else

	if [ ! -d "$HOME/.local/share/gnome-shell/extensions" ]; then
		mkdir $HOME/.local/share/gnome-shell/extensions
	fi
	
	INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/appfolders-manager@maestroschan.fr"

fi

if [ ! -d "$INSTALL_DIR" ]; then
	mkdir $INSTALL_DIR
fi

echo "Installing extension files in $INSTALL_DIR"

cp appfolderDialog.js $INSTALL_DIR/appfolderDialog.js
cp extension.js $INSTALL_DIR/extension.js
cp prefs.js $INSTALL_DIR/prefs.js
cp convenience.js $INSTALL_DIR/convenience.js
cp stylesheet.css $INSTALL_DIR/stylesheet.css
cp dragAndDrop.js $INSTALL_DIR/dragAndDrop.js
cp metadata.json $INSTALL_DIR/metadata.json

cp -r schemas $INSTALL_DIR
cp -r locale $INSTALL_DIR

echo "Done."

exit

