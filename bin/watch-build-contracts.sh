#!/usr/bin/env bash

while true; do
    ls -d src/contracts/*.sol | entr -d make contracts
    sleep 1
done
