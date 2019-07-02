#!/bin/bash

EXTENSION_ID="appfolders-manager@maestroschan.fr"
TRANSLATION_ID="appfolders-manager"

#####

if [ $# = 0 ]; then
	echo "No parameter, exiting now."
	echo ""
	echo "Parameters and options for this script:"
	echo "	xx		update only the language xx, and compile only xx"
	echo "	--pot		update the pot file"
	echo "	--compile	compile all languages (without updating them first)"
	echo "	--all		update all translations files, and compile them all"
	echo "	--add xx	add a .po file for the language xx"
	exit 1
fi

#####

function update_pot () {
	echo "Generating .pot file..."
	xgettext --files-from=POTFILES.in --from-code=UTF-8 --output=$EXTENSION_ID/locale/$TRANSLATION_ID.pot
}

function update_lang () {
	echo "Updating translation for: $1"
	msgmerge $prefix/$1/LC_MESSAGES/$TRANSLATION_ID.po $prefix/$TRANSLATION_ID.pot > $prefix/$1/LC_MESSAGES/$TRANSLATION_ID.temp.po
	mv $prefix/$1/LC_MESSAGES/$TRANSLATION_ID.temp.po $prefix/$1/LC_MESSAGES/$TRANSLATION_ID.po
}

function compile_lang () {
	echo "Compiling translation for: $1"
	msgfmt $prefix/$1/LC_MESSAGES/$TRANSLATION_ID.po -o $prefix/$1/LC_MESSAGES/$TRANSLATION_ID.mo
}

function create_po () {
	mkdir -p $prefix/$1/LC_MESSAGES
	touch $prefix/$1/LC_MESSAGES/$TRANSLATION_ID.po
	echo "msgid \"\"
msgstr \"\"
\"Project-Id-Version: \\n\"
\"Report-Msgid-Bugs-To: \\n\"
\"POT-Creation-Date: 2019-07-02 18:58+0200\\n\"
\"PO-Revision-Date: 2017-02-05 16:47+0100\\n\"
\"Last-Translator: \\n\"
\"Language-Team: \\n\"
\"Language: $1\\n\"
\"MIME-Version: 1.0\\n\"
\"Content-Type: text/plain; charset=UTF-8\\n\"
\"Content-Transfer-Encoding: 8bit\\n\"
\"X-Generator: \\n\"
\"Plural-Forms: nplurals=2; plural=(n > 1);\\n\"
" > $prefix/$1/LC_MESSAGES/$TRANSLATION_ID.po
	update_lang $1
}

#####

IFS='
'
liste=`ls ./$EXTENSION_ID/locale/`
prefix="./$EXTENSION_ID/locale"

#####

if [ $1 = "--all" ]; then
	update_pot
	for lang_id in $liste
	do
		if [ "$lang_id" != "$TRANSLATION_ID.pot" ]; then
			update_lang $lang_id
			compile_lang $lang_id
		fi
	done
elif [ $1 = "--pot" ]; then
	update_pot
elif [ $1 = "--compile-only" ]; then
	for lang_id in $liste
	do
		if [ "$lang_id" != "$TRANSLATION_ID.pot" ]; then
			compile_lang $lang_id
		fi
	done
elif [ $1 = "--add" ]; then
	create_po $2
else
	for lang_id in $@
	do
		if [ "$lang_id" != "$TRANSLATION_ID.pot" ]; then
			update_lang $lang_id
			compile_lang $lang_id
		fi
	done
fi

exit 0

