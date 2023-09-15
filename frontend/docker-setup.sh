#!/bin/bash
set -euo pipefail

BASEDIR=$(dirname "$0")
ENV_FILE=$BASEDIR"/public/environment.js"
PDF_FILE=$BASEDIR"/src/pdf/pdf.mjs"

if [ ! -f "$ENV_FILE" ]; then
    cp $BASEDIR/public/environment.docker.dist "$ENV_FILE"
fi

if [ ! -f "$PDF_FILE" ]; then
    # Copy dummy versions of the pdf build outputs, to make sure there is always something to import
    cp $BASEDIR/src/pdf/pdf.mjs.dist "$PDF_FILE"
    cp $BASEDIR/src/pdf/prepareInMainThread.mjs.dist "$BASEDIR/src/pdf/prepareInMainThread.mjs"
fi

if [ "$CI" = 'true' ] ; then
  npm ci --verbose
  npm run build
  npm run preview
else
  npm install
  npm run dev
fi
