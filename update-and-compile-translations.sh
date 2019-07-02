#!/bin/bash

#####

echo "Generating .pot file..."

xgettext --files-from=POTFILES.in --from-code=UTF-8 --output=appfolders-manager@maestroschan.fr/locale/appfolders-manager.pot

#####

if [ $# = 0 ]; then
	echo "No parameter, exiting now."
	echo ""
	echo "Parameters and options for this script:"
	echo "	xx		update only the language xx, and compile"
	echo "	--all		update all translations files, and compile"
	echo "	--add xx	add empty files for the language xx"
	exit 1
fi

function update_lang () {
	echo "Updating translation for: $dossier"
	msgmerge $prefix/$dossier/LC_MESSAGES/appfolders-manager.po $prefix/appfolders-manager.pot > $prefix/$dossier/LC_MESSAGES/appfolders-manager.temp.po
	mv $prefix/$dossier/LC_MESSAGES/appfolders-manager.temp.po $prefix/$dossier/LC_MESSAGES/appfolders-manager.po
	echo "Compiling translation for: $dossier"
	msgfmt $prefix/$dossier/LC_MESSAGES/appfolders-manager.po -o $prefix/$dossier/LC_MESSAGES/appfolders-manager.mo
}

IFS='
'
liste=`ls ./appfolders-manager@maestroschan.fr/locale/`
prefix="./appfolders-manager@maestroschan.fr/locale"

if [ $1 = "--all" ]; then
	for dossier in $liste
	do
		if [ "$dossier" != "appfolders-manager.pot" ]; then
			update_lang
		fi
	done
elif [ $1 = "--add" ]; then
	dossier=$2
	mkdir -p $prefix/$dossier/LC_MESSAGES
	touch $prefix/$dossier/LC_MESSAGES/appfolders-manager.po
	echo "msgid \"\"
msgstr \"\"
\"Project-Id-Version: \\n\"
\"Report-Msgid-Bugs-To: \\n\"
\"POT-Creation-Date: 2019-07-02 18:58+0200\\n\"
\"PO-Revision-Date: 2017-02-05 16:47+0100\\n\"
\"Last-Translator: \\n\"
\"Language-Team: \\n\"
\"Language: $dossier\\n\"
\"MIME-Version: 1.0\\n\"
\"Content-Type: text/plain; charset=UTF-8\\n\"
\"Content-Transfer-Encoding: 8bit\\n\"
\"X-Generator: \\n\"
\"Plural-Forms: nplurals=2; plural=(n > 1);\\n\"
" > $prefix/$dossier/LC_MESSAGES/appfolders-manager.po
	update_lang
else
	for dossier in $@
	do
		if [ "$dossier" != "appfolders-manager.pot" ]; then
			update_lang
		fi
	done
fi

exit 0

