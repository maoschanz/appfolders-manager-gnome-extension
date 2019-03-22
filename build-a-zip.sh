#!/bin/bash

#./update-and-compile-translations.sh --all

cd appfolders-manager@maestroschan.fr

glib-compile-schemas ./schemas

zip ../appfolders-manager@maestroschan.fr.zip *.js
zip ../appfolders-manager@maestroschan.fr.zip *.css
zip ../appfolders-manager@maestroschan.fr.zip *json

zip -r ../appfolders-manager@maestroschan.fr.zip schemas
zip -r ../appfolders-manager@maestroschan.fr.zip locale
