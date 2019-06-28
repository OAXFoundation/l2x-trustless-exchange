# OAX Client

Client side code to interact with the rinkeby test net deployment of the
trustless OAX Exchange. At the moment the functionality includes

- Funding of wallet.
- Deposit into exchange contract.
- Querying balance information.
- Placing orders.
- Querying order book.
- Withdrawal from exchange contract.

In this preview version you can trade OAX and WETH tokens.

## Installation

```bash
npm i @oax/client
```

## Usage
To use the cli
```bash
npx oax --init
```
This will generate a `config.json` in the current directory.

If you would like to use an existing menmonic, add it to `config.json` with the
`walletMnemonic` key. Otherwise the CLI will generate one for you the next time
it runs.

To see the available commands run
```bash
npx oax
```
To obtain tokens to trade you first need some rinkeby Ether (see
https://faucet.rinkeby.io/). Then use the CLI to convert these to WETH tokens
```
npx oax buy WETH 1.1
npx oax buy OAX 1.2
```
where the number at the end is the amount in Ether you will convert.

Finally deposit your tokens into the exchange by running
```
npx oax deposit WETH 1.1
npx oax deposit OAX 1.2
```
To see your deposit
```
npx oax fetchBalances
```
To place an order
```
npx oax createOrder BUY OAX/WETH 0.5 1.23
```
See `client-cli.js` for examples of programmatic use.

## Not yet implemented

- Order cancellation. In this deployment orders expire when the round advances.
