#!/usr/bin/env bash

# Wraps the execution of prettier with direnv for editors/IDEs that are not
# direnv aware

exec direnv exec . pnpx prettier "$@"
