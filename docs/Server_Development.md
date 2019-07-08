
# Server Development

This document focuses on developers who would like to experiment with the server itself, including building, running tests, and more.

## Requirements
A machine running MacOS, Ubuntu Linux or NixOS.

## Machine Setup

Clone the repository
```
git clone https://github.com/OAXFoundation/l2x-trustless-exchange.git
```

Install `nix`

    curl https://nixos.org/nix/install | sh
    . ~/.nix-profile/etc/profile.d/nix.sh

If necessary install `direnv`. For instance with

    nix-env -i direnv

and hook it into your shell, by running

    eval "$(direnv hook bash)"

Replace `bash` with `zsh`, `fish` or whatever shell you're using. You may want
to add this line to `.bashrc` to make it "persistent".

Finally, from the clones repository root folder, run

    direnv allow

which takes care of activating a `nix-shell`.

*Note that we are using pnpm instead of npm.

## Configuration

Environment-specific configurations are stored under `.env` file. To get
started, copy the example configuration:

    cp .env.example .env

## Development

### Testing

#### Running all tests

Run a geth private chain and watch contracts source files for rebuild

    develop

Run tests

    pnpm test
    
    
Running an individual test file
    
    jest tests/XXX.test.ts

#### Using docker

Need docker v18 or later.

Install dependencies

    install-deps

Make sure docker is running. (e.g. https://docs.docker.com/config/daemon/systemd/)
   
Launch a geth private chain

    runGethPrivate.sh --docker   

Run e2e tests

    run-e2e-server

Wait until you see operator logs, then run

    run-e2e-test
    
#### Chaos testing

```
    > runChaosGeth.sh
    > pnpm run start
    > ts-node demo/chaos.ts 
```
    
If you want to just run the server with docker do 
(be sure the server of for the tests above is not running anymore):

    pnpm run start-docker

### Running the Exchange locally

Launch a geth private chain

    runGethPrivate.sh    

Launch the exchange server

    
    > pnpm start
    
    Saved deployment info to deploy.json.
    Deployment completed successfully.
    2019-06-20T21:04:49.133Z - info: Starting...
    2019-06-20T21:04:49.154Z - info: Loading operator wallet from running node...
    2019-06-20T21:04:49.156Z - info: Loaded operator wallet with address 0x71Cdd21e72BE8F275C7162d76403b283779427cD
    2019-06-20T21:04:49.158Z - info: Using database file storage/ledger-0xE24652F14E19716502Cc52fE862a4EfeD0B6E86e.sqlite
    2019-06-20T21:04:49.227Z - info: Creating operator.
    2019-06-20T21:04:49.228Z - info: Exchange config: {"fee":{"asset":"0x02690d95F2C1A7C5f139bE96D5FEbfED2b9C1B53","amount":"10000000000000"}}
    2019-06-20T21:04:49.229Z - info: Creating exchange.
    2019-06-20T21:04:49.229Z - info: Adding OAX token asset - address: 0x02690d95F2C1A7C5f139bE96D5FEbfED2b9C1B53
    2019-06-20T21:04:49.229Z - info: Adding WETH token asset - address: 0xFAD1D7c989b6CAEf9C2EEC1a5449fB286ee91D78
    2019-06-20T21:04:49.229Z - info: Ledger starting...
    2019-06-20T21:04:49.521Z - info: Registering client 0x71Cdd21e72BE8F275C7162d76403b283779427cD.
    2019-06-20T21:04:53.255Z - info: New block 5, round 0, quarter 0
    2019-06-20T21:04:53.257Z - info: Block 5 processed



### Using the CLI locally

Once the exchange server is running locally (see section above), you can use the CLI as follows:

    npx oax init

This create a file `config.json`. Edit this file so that it has the following values:


```json
{
    "hubUrl": "http://localhost:8899/",
    "providerUrl": "http://localhost:8545/",
    "operatorAddress": "0x71Cdd21e72BE8F275C7162d76403b283779427cD",
    "mediatorAddress": "0xE24652F14E19716502Cc52fE862a4EfeD0B6E86e",
    "assets": {
        "WETH": "0xFAD1D7c989b6CAEf9C2EEC1a5449fB286ee91D78",
        "OAX": "0x02690d95F2C1A7C5f139bE96D5FEbfED2b9C1B53"
    },
    "fee": {
        "asset": "OAX",
        "amount": "0.00001"
    }
}

```

Note that the address for the tokens WETH,OAX, the operator and mediator must be copied from the local file `deploy.json`

```json
{
  "assets": {
    "OAX": "0x02690d95F2C1A7C5f139bE96D5FEbfED2b9C1B53",
    "WETH": "0xFAD1D7c989b6CAEf9C2EEC1a5449fB286ee91D78"
  },
  "mediator": "0xE24652F14E19716502Cc52fE862a4EfeD0B6E86e",
  "operator": "0x71Cdd21e72BE8F275C7162d76403b283779427cD"
}

```

Create a local wallet

    > npx oax createWallet
    
Fetch the wallet address

    > npx oax getWalletAddress
    0x80f9C31c8a9B9806Ad2fc3aA6C8F34A68a8F936F
       
Fund the wallet with ethers

    bin/fund-wallet "<client_address>" "<amount in wei>"  
    
    (example: bin/fund-wallet 0x80f9C31c8a9B9806Ad2fc3aA6C8F34A68a8F936F "100000000000000")
 
 Now you can use the CLI
    
    > npx oax buy OAX 1
    Enter wallet password: 
    Wallet 0x80f9C31c8a9B9806Ad2fc3aA6C8F34A68a8F936F loaded successfully.
    
    2019-06-20T23:56:19.743Z - info: Ledger starting...
    2019-06-20T23:56:19.749Z - info: Registering client 0xC1B06154dc2EB43FdabFD7e7ff4002E541df6f7f.
    2019-06-20T23:56:19.753Z - info: Registration skipped: 0xC1B06154dc2EB43FdabFD7e7ff4002E541df6f7f has already been registered.
    Connecting...
    2019-06-20T23:56:19.766Z - info: Registering client 0x80f9C31c8a9B9806Ad2fc3aA6C8F34A68a8F936F.
    2019-06-20T23:56:19.767Z - info: Registration skipped: 0x80f9C31c8a9B9806Ad2fc3aA6C8F34A68a8F936F has already been registered.
    Buying 1 OAX...
    Bought 1 OAX.
 

### Deploying the Exchange
In order to deploy the exchange stand-alone to run on the public Ethereum testnet see the [Deployment Documentation](DEPLOYMENT.md).

* * *
&copy; 2019 OAX Foundation
