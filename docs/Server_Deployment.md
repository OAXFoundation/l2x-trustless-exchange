
# Server Deployment

This document describes how to deploy a OAX hub on an Ethereum public Testnet. If you only want to run the hub for development and testing purposes, we recommend following the instructions in the [Server Development](Server_Development.md) document instead.
<br/>
<br/>

## Prerequisites

### Machines
We'll need a machine with the OAX enlistment (aka DEV machine) and machine where the OAX hub will be deployed (aka HUB machine). Both machines should have Docker v18 or later installed.

### Geth node or Infura key
The hub needs to be able to access the blockchain to read information and issue new transactions. This can be done via your own node or through the Infura service (recommended). In order to use Infura, you'll first need to create a project key. See https://infura.io/ for more details.

### Wallets for deployment and for the operator
We will use two wallets in this setup, one for deploying contracts and one for the hub operator. You can use a wallet app such as [MyCrypto](https://download.mycrypto.com) or the OAX CLI to create a new encrypted wallet file (see the createWallet command).

### Test Ether
In order to sign transactions, both wallets need to have sufficient Ether. If you're using one of the public Ethereum testnets, you can request test Ether through one of the faucets available such as:
 * https://etherfaucet.xyz
 * http://rinkeby-faucet.com
 * https://faucet.rinkeby.io/ (Requires Twitter or Facebook account)
<br/>
<br/>

## Deploying to Rinkeby Testnet
In the following sections, we will refer to the Rinkeby testnet although it you may also deploy to another testnet such as Ropsten, etc as needed.

### Deploy Contracts
In our setup, we will run the OAX hub with 2 assets: OAX token and WETH token. This means that we will need to deploy a total of 3 smart contracts: one for each of the tokens and one for the Mediator smart contract which is fundamental to Hub operations.

On the DEV machine:

- Make sure the contract bindings are generated
```
> make
```
- Go to the root folder of the enlistment
- Open `bin/deployContracts.js` and customize the following two constants to match your setup:
```
const GETH_RPC_URL = 'https://rinkeby.infura.io/v3/<your project key>'
const OPERATOR_WALLET_FILEPATH = 'wallet/wallet.bin'
const DEPLOYER_WALLET_FILEPATH = 'wallet/deploy.bin'
const ROUND_SIZE = 240
```
- Comment out the following line so you get prompted for password instead:
```
const DEPLOYER_PASSWORD = 'testtest'
```
- Run the script
```
node bin/deployContracts.js
```
This should produce output similar to this one, also showing the address of each one of the deployed contracts. We will need this later on to run the Hub.
```
Loading wallets from disk...
Enter wallet password for wallet/deploy.bin:
Enter wallet password for wallet/wallet.bin:
Loaded deployer wallet with address 0x4d7Bbfd959D37F07B3F5aD43fE964c9CE7073b4d
Loaded operator wallet with address 0x5dc74058622aaaB98A52534E23930cd358918421

Deploying token OAXToken.
Sent tx with hash 0x4a5c263716d8ec464fcbbb154397e9e64d4e6c18c6ff8c9b278e82ec5597d405. Waiting for mining...
Deployed Token OAXToken at 0x70fd44b8e636514eD63dC9747204BDdfD8cD9cB2

Deploying token ETHToken.
Sent tx with hash 0x9c7614110abd08e2f60e6fb30de73983e7554038bd65c9a1fca70d252baddb0a. Waiting for mining...
Deployed Token ETHToken at 0xA99eeECed2A9362400CA790D8819265e2339bF7D

Deploying mediator for operator 0x5dc74058622aaaB98A52534E23930cd358918421, 32-block rounds.
Sent tx with hash 0x0156a9c5972a5558da5d23365dafa0ce88d2df0a03baa28001d071140d626fc0. Waiting for mining...
Deployed Mediator at 0x77Ea7B06C493810C0fCFe158678b6a2ac137b1d5

Registering OAX token with Mediator...
Registering WETH token with Mediator...

Saved deployment info to deploy.json.
Deployment completed successfully.
```

### Operator Server
#### Building the Hub Docker image
You can build the docker image from the OAX enlistment using the following command:
```
pnpm run build-docker
```

#### Pushing the docker image
```
docker save oax/server | ssh -C user@host docker load
```

#### Creating the operator docker container
Stop and remove the existing container on the host if it exists.
```
systemctl stop oax
docker stop oax
docker rm oax
```

The target machine will need to have the Docker image and also the encrypted operator wallet file (we'll refer to it as wallet.bin)
Create a `.sh` file similar to this one:
```
docker create -it \
            -p 8899:8899 \
            -v /localFolderWithWalletFile:/app/mount \
            -e GETH_RPC_URL="http://127.0.0.1:8545" \
            -e WALLET_FILEPATH="/app/mount/wallet.bin" \
            -e WALLET_PASSWORD="this is a test password" \
            -e STORAGE_DIR="/app/storage" \
            -e FEE_AMOUNT_ETHER="0.00001" \
            -e CONTRACT_OAXToken="0x70fd44b8e636514eD63dC9747204BDdfD8cD9cB2" \
            -e CONTRACT_ETHToken="0xA99eeECed2A9362400CA790D8819265e2339bF7D" \
            -e CONTRACT_Mediator="0x77Ea7B06C493810C0fCFe158678b6a2ac137b1d5" \
            --name oax \
            oax/server:latest
```
or, using `.env` file with all environment settings:
```
docker create -it \
            -p 8899:8899 \
            -v /localFolderWithWalletFile:/app/mount \
            --env-file .env \
            --name oax \
            oax/server:latest
```

A few important parameters to customize above:
- `localFolderWithWalletFile` should be the full folder path on the local machine where the encrypted wallet file is lodated (e.g. `/Users/hubUser/mount`).
- `GETH_RPC_URL` should be the URL to the blockchain node you want the hub to use. In the case of infura, this would look like: `https://rinkeby.infura.io/v3/<your project key>`
- `WALLET_FILEPATH` make sure the `wallet.bin` file matches the name of your encrypted wallet file
- `WALLET_PASSWORD` password needed to decrypt `wallet.bin`
- `CONTRACT_OAXToken` this is the address of the OAX contract that was deployed by the deployment script
- `CONTRACT_ETHToken` this is the address of the WETH contract that was deployed by the deployment script
- `CONTRACT_Mediator` this is the address of the Mediator contract that was deployed by the deployment script

NOTE: Make sure that port 8899 is open on the firewall if you want to be able to connect to it remotely.

#### Starting the operator server
After the `oax` docker container has been created the container should be
started with `systemd`.
```
systemctl start operator
```
To check the status of the server run
```
systemctl status operator
```
The hub should start and initialize without errors. You should see log output similar to this:
```
info: Loaded operator wallet with address 0xBC3AdE3dFdE456ab5f531F32E6fa04658ED80f3b {"timestamp":"2019-04-20T05:55:33.794Z"}
info: Register 0xBC3AdE3dFdE456ab5f531F32E6fa04658ED80f3b. {"timestamp":"2019-04-20T05:55:33.842Z"}
info: Exchange config: {"txFee":{"asset":"0x0A7b4FF63e027545E206e3b8e02Ae49Aa6c627d1","amount":"100000000000"}} {"timestamp":"2019-04-20T05:55:33.846Z"}
info: Creating exchange. {"timestamp":"2019-04-20T05:55:33.847Z"}
info: Adding OAX token asset - address: 0x0A7b4FF63e027545E206e3b8e02Ae49Aa6c627d1 {"timestamp":"2019-04-20T05:55:33.850Z"}
info: Adding WETH token asset - address: 0x993dB75BC06522B0f2869FcE3cc3900ADC1e6bfB {"timestamp":"2019-04-20T05:55:33.853Z"}
info: Creating operator. {"timestamp":"2019-04-20T05:55:33.854Z"}
info: Ledger starting... {"timestamp":"2019-04-20T05:55:33.858Z"}
[...]
```

#### Updating the operator docker container
Assuming you followed the steps above before (using the `.env` file), you can
run the following after building the docker container to update the operator.
```
env SSH_CON=[user]@[host] deploy-operator
```
Note this will only deploy the new container but not deploy the contracts.

### Try it with the CLI
You can now connect to the hub and experiment with it, using the client libraries, the CLI or REST APIs. Here are instructions on how connect with the CLI.

#### Create a CLI config.json file
```
oax init
```
#### Create a client wallet (different from the operator wallet)
```
oax createWallet
```

#### Edit the config.json according to your setup
```
"hubUrl": "http://127.0.0.1:8899/",
"providerUrl": "https://ropsten.infura.io/v3/<yourProjectKey>",
"operatorAddress": "0xBC3AdE3dFdE456ab5f531F32E6fa04658ED80f3b",
"mediatorAddress": "0x9F26ADc5Eb8e3c4Cc4964ab1D448faDBF7ff51C0",
   "assets": {
      "WETH": "0x74558CFc9a02451a586eFeAeA5D6D776C6a5089c",
      "OAX": "0x03126dA14a554C8Af162BEb1c235cBb00AC8a4B3"
   },
"walletFile": "UTC--2019-XXXXXXXXXXXX"
```
#### Run some commands against the hub
```
oax fetchBalances
oax buy OAX 100
oax deposit OAX 100
[...]
```
<br />
<br />

## Deploying to Ethereum Mainnet
The OAX hub is not yet production ready so deploying to the Ethereum Mainnet is NOT recommended at this point.

<br />
<br />


* * *
&copy; 2019 OAX Foundation
