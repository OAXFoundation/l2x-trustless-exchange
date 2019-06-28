#!/usr/bin/env bash

echo -n "Cleaning build/... "

if [[ -d "build/" ]]
then
    rm -r build/
    echo "completed."
else
    echo "directory does not exist."
fi
