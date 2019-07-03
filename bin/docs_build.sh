#!/usr/bin/env bash

# Remove existing doc build
rm -r build/docs 2> /dev/null

# Build docs
typedoc --options typedoc.json src/client

# Fix relative links
sed -i 's/exchangeclient.md//g' ./build/docs/classes/exchangeclient.md
sed -i 's/l2client.md/Client_L2Client.md/g' ./build/docs/classes/exchangeclient.md
sed -i 's/l2client.md//g' ./build/docs/classes/l2client.md

# Update files in the docs folder
cp ./build/docs/classes/exchangeclient.md docs/Client_ExchangeClient.md
cp ./build/docs/classes/l2client.md docs/Client_L2Client.md

