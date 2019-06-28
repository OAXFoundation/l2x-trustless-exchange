
# Client CLI

The client CLI allows users to interact and experiment with the server such as placing making, deposits and much more. 

## Installation
```
npm install @oax/client
```

## Usage
```
npx oax [options] <command> [arguments]
```

## Commands

init
Creates a config.json with information needed to connect to the OAX Testnet.

### createWallet
Creates a new encrypted wallet and stores its file name in config.json for later use. Make sure to properly secure the wallet file and the password. Note that it is also possible to create an encrypted wallet using MyCrypto or other standard wallet applications.

### console
Enters the CLI console mode. This mode allows users to enter commands without having to reconnect to the server each time. It is the recommended way to use the CLI.

### getWalletAddress
Returns the Ethereum address of the wallet associated with the CLI. This is the address that will need to have funds before depositing into the exchange. It's also the address used to sign add client -> server messages and that will receive withdrawals.

### buy &lt;symbol&gt; &lt;amount&gt;
Convenience function to convert test ETH to test OAX or test WETH. This works only against token contracts that allow send Ether to their default payable function in order to receive tokens. 

### fetchBalances
Returns the balance of all assets for the user on the exchange.

### fetchWalletBalance &lt;symbol&gt;
Returns the balance of a specific asset in the user wallet, that has not been deposited into the exchange.

### fetchOrderBook &lt;pair&gt;
Returns the order book for a given asset pair e.g. OAX/WETH.

### fetchTrades &lt;pair&gt;
Returns all the executed trades for the user, for the given asset pair.

### fetchOrder &lt;id&gt;
Returns the order for the given order ID.

### fetchOrders
Returns all active and completed orders for the user.

### createOrder &lt;side&gt; &lt;pair&gt; &lt;amount&gt; &lt;price&gt;
Creates a new buy or sell order for a given asset pair.

### cancelOrder &lt;id&gt;
Cancels an active order.

### deposit &lt;symbol&gt; &lt;amount&gt;
Deposits a certain amount of asset from the user's wallet onto the exchange.

### requestWithdrawal &lt;symbol&gt; &lt;amount&gt;
Requests a withdrawal from the exchange. This only initiates the request and the operator has a certain amount of time to validate the request.

### confirmWithdrawal &lt;symbol&gt;
Confirms a withdrawal and transfers the funds from the exchange to the user's wallet.


## Notes
Note that all amounts are specified in ether units (eg. 1.25).


* * *
&copy; 2019 OAX Foundation
