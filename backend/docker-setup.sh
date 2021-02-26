#!/bin/bash
set -euo pipefail

BASEDIR=$(dirname "$0")

DB_CONFIG_FILE=$BASEDIR"/config/autoload/doctrine.local.dev.php"
if [ ! -f "$DB_CONFIG_FILE" ]; then
    cp $BASEDIR/config/autoload/doctrine.docker.dist "$DB_CONFIG_FILE"
fi

FRONTEND_CONFIG_FILE=$BASEDIR"/config/autoload/frontend.local.dev.php"
if [ ! -f "$FRONTEND_CONFIG_FILE" ]; then
    cp $BASEDIR/config/autoload/frontend.docker.dist "$FRONTEND_CONFIG_FILE"
fi

MAIL_CONFIG_FILE=$BASEDIR"/config/autoload/mail.local.dev.php"
if [ ! -f "$MAIL_CONFIG_FILE" ]; then
    cp $BASEDIR/config/autoload/mail.local.docker.dist "$MAIL_CONFIG_FILE"
fi

php bin/wait-for-composer-install.php
php bin/wait-for-db.php

# load schema, prod date & dev data
php cli-setup.php dev

apache2-foreground
