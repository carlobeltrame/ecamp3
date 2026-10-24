#!/bin/bash
set -euo pipefail

until [ -f node_modules/.package-lock.json ] && [ -x node_modules/.bin/vite ]; do
  echo 'Waiting for the frontend container to install node_modules...'
  sleep 5
done

if [ "$CI" = 'true' ] ; then
  npm run pdf-server:build
  npm run pdf-server:start
else
  npm run pdf-server:dev
fi
