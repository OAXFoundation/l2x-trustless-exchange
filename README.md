[![Version](https://img.shields.io/github/package-json/v/OAXFoundation/l2x-trustless-exchange.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](https://opensource.org/licenses/MIT)


# Layer 2 Trustless Exchange (L2X)

This is an implementation of the OAX L2X protocol as a full-stack high-performance, scalable, trustless exchange.

## Documentation
* [Getting Started with the OAX Testnet](#getting-started-with-the-oax-testnet)
* [Architecture](./docs/Architecture.md)
* [L2X Protocol Specification](./docs/l2x-protocol-33c7d42.pdf)
* [Exchange Client Library](./docs/Client_ExchangeClient.md)
* [Operator Client Library](./docs/Client_L2Client.md)
* [Client CLI](./docs/Client_Cli.md)
* [Server Development](./docs/Server_Development.md)
* [Server Deployment](./docs/Server_Deployment.md)
* [Operator Notes](./docs/Operator_Notes.md)
* [Contribution Guidelines](./docs/Contribution.md)

## Getting Started with the OAX Testnet
This section will walk you through using the client library and CLI to interact with the OAX testnet. If you'd like to learn how to run the server, modify it and deploy it, see the Server related sections in the documentation.

### Requirements

- node.js v10.x or later

### Installation

1. Create a new folder
2. Create a package.json
```
npm init
```
3. Install the OAX client package
```
npm install @oax/client --save
```
4. Initialize the CLI. This will create a new config.json file with the OAX Testnet config.
```
npx oax init
```
Once this is created, please open the config.json file and update the `providerUrl` by adding in your geth node url or infura url for the rinkeby testnet. 

5. Create a new encrypted wallet.
```
npx oax createWallet
```
6. Fund the wallet with Rinkeby test ether. You can use one of the public Rinkeby faucets to request Ether for the wallet address you just created.

    - https://etherfaucet.xyz
    - http://rinkeby-faucet.com
    - https://faucet.rinkeby.io/ (Requires Twitter or Facebook account)

### Interacting with the Testnet Exchange

After funding your wallet, you need to purchase OAX tokens. OAX tokens are needed to pay fees. They can be purchased using the buy method. WETH can also be purchased in this way. Once you purchase these tokens you can send them to the exchange using the deposit method. Finally once your tokens show up on the exchange balances, you can start trading. 

Launch the CLI in console mode
```
> npx oax buy OAX 1
Buying 1 OAX...
Bought 1 OAX.

> npx oax fetchWalletBalance OAX
Balance: 1.0

> npx oax deposit OAX 1.0
Depositing 1 OAX...

> fetchBalances
{
    "OAX": {
        "free": "1",
        "locked": "0"
    },
    "WETH": {
        "free": "0",
        "locked": "0"
    }
}

> npx oax createOrder BUY OAX/WETH 5 0.1
Placing order to BUY 5 OAX/WETH @ 0.1...
Order placed successfully.
"0xfd91b90308ccfcaff77ae9cfc7e455b6383320aa981f1cbd273f1ead2732081b"
```

You can see the full list of commands available in the CLI by typing:
```
npx oax --help
```

## Building the Client from source 

Currently the build script will build everything, client , server , smart-contracts, so you can simply run `pnpm run clean-build` after modifying some source code. 


* * *



&copy; 2019 OAX Foundation
