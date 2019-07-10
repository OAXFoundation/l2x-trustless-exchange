#!/usr/bin/env bash

# Deploy contracts
ts-node bin/deployContracts.ts --UseTestWallets

# Set env
#GETH_RPC_URL="http://127.0.0.1:8545" \
#WALLET_FILEPATH="/app/mount/wallet.bin" \
#WALLET_PASSWORD="blah" \
#STORAGE_DIR="/app/storage" \
#FEE_AMOUNT_ETHER="0.0000001" \

CONTRACT_OAXToken=$(cat deploy.json | jq -r .assets.OAX) \
CONTRACT_ETHToken=$(cat deploy.json | jq -r .assets.WETH) \
CONTRACT_Mediator=$(cat deploy.json | jq -r .mediator) \
WALLET_ADDRESS=$(cat deploy.json | jq -r .operator)

if [ "$1" == "--docker" ];
then
   docker rm oax-test 2> /dev/null

   if [ -z "$FEE_AMOUNT_ETHER" ]; then
     FEE_AMOUNT_ETHER=$(cat .env | grep FEE_AMOUNT_ETHER | cut -d = -f 2)
   fi

   docker run --init -it \
        -p 8899:8899 \
        -e GETH_RPC_URL="http://oax-test-geth:8545" \
        -e WALLET_ADDRESS=$WALLET_ADDRESS \
        -e IN_MEMORY_DB=1 \
        -e STORAGE_DIR="/app/storage" \
        -e FEE_AMOUNT_ETHER=$FEE_AMOUNT_ETHER \
        -e CONTRACT_OAXToken=$CONTRACT_OAXToken \
        -e CONTRACT_ETHToken=$CONTRACT_ETHToken \
        -e CONTRACT_Mediator=$CONTRACT_Mediator \
        --network oax-test-network \
        --name oax-test \
        oax/server:latest
        #nix-shell -p bash nodejs-10_x
else
   IN_MEMORY_DB=1 \
   CONTRACT_OAXToken=$CONTRACT_OAXToken \
   CONTRACT_ETHToken=$CONTRACT_ETHToken \
   CONTRACT_Mediator=$CONTRACT_Mediator \
   WALLET_ADDRESS=$WALLET_ADDRESS \
   node build/dist/src/server/main.js
fi

