#!/bin/bash

#####

echo "Generating .pot file..."

xgettext --files-from=POTFILES.in --from-code=UTF-8 --output=appfolders-manager@maestroschan.fr/locale/appfolders-manager.pot

#####

IFS='
'
liste=`ls ./appfolders-manager@maestroschan.fr/locale/`
prefix="./appfolders-manager@maestroschan.fr/locale"

for dossier in $liste
do
	if [ "$dossier" != "appfolders-manager.pot" ]; then
		echo "Updating translation for: $dossier"
		msgmerge -N $prefix/$dossier/LC_MESSAGES/appfolders-manager.po $prefix/appfolders-manager.pot > $prefix/$dossier/LC_MESSAGES/appfolders-manager.temp.po
		mv $prefix/$dossier/LC_MESSAGES/appfolders-manager.temp.po $prefix/$dossier/LC_MESSAGES/appfolders-manager.po
		echo "Compiling translation for: $dossier"
		msgfmt $prefix/$dossier/LC_MESSAGES/appfolders-manager.po -o $prefix/$dossier/LC_MESSAGES/appfolders-manager.mo
	fi
done

#####

exit 0
