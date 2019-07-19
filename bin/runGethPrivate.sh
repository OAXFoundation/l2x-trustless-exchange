#!/usr/bin/env bash

DATA_DIR=~/.ethereum/oax-test

# Remove existing test folder
if [ -d $DATA_DIR ]; then
   echo "Removing existing geth data folder..."
   rm -r $DATA_DIR
fi

# Create data folder
mkdir -p $DATA_DIR

# Generate new private key
echo -n "" > $DATA_DIR/testpassword.txt
for i in `seq 1 5`;
do
   echo "testtest" >> $DATA_DIR/testpassword.txt
   geth --verbosity 0 --datadir $DATA_DIR account new --password $DATA_DIR/testpassword.txt
done

# Generate a new genesis file
node bin/generate_genesis_poa.js

# Create new chain
geth --datadir $DATA_DIR init $DATA_DIR/genesis_poa.json

# Get list of wallets
ADDRESS_LIST=$(geth --verbosity 0 --datadir $DATA_DIR account list | cut -d ' ' -f 3 | cut -c2- | rev | cut -c2- | rev | sed -e 's/^/0x/' | sed '$!s/$/,/' | tr -d '\n')

# Run geth
args="--nousb --networkid 88 --datadir ${DATA_DIR} --unlock ${ADDRESS_LIST} --password ${DATA_DIR}/testpassword.txt --rpc --rpccorsdomain '*' --rpcport 8545 --rpcapi 'admin,db,shh,txpool,personal,eth,net,web3,debug,miner'  --mine --minerthreads 1 --maxpeers 0 --nodiscover --verbosity 3"

if [ "$1" == "--docker" ];
then
   docker rm oax-test-geth 2>/dev/null
   docker network rm oax-test-network 2> /dev/null
   docker network create oax-test-network 2> /dev/null
   DATA_DIR2=/ethereum
   args="--nousb --networkid 88 --datadir ${DATA_DIR2} --unlock ${ADDRESS_LIST} --password ${DATA_DIR2}/testpassword.txt --rpc --rpccorsdomain '*' --rpcport 8545 --rpcapi 'admin,db,shh,txpool,personal,eth,net,web3,debug,miner'  --mine --minerthreads 1 --maxpeers 0 --nodiscover --verbosity 3"
   docker run -it --name oax-test-geth --network oax-test-network -p 8545:8545 -v ${DATA_DIR}:/ethereum ethereum/client-go:v1.8.22 --rpcaddr 0.0.0.0 --rpcvhosts '*' $args
else
   geth --nousb --networkid 88 --datadir $DATA_DIR --unlock $ADDRESS_LIST --password $DATA_DIR/testpassword.txt --rpc --rpccorsdomain '*' --rpcport 8545 --rpcapi "admin,db,shh,txpool,personal,eth,net,web3,debug,miner" --mine --minerthreads 1 --maxpeers 0 --nodiscover
fi
