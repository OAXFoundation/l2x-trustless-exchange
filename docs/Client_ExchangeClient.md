> ## [@oax/client](../README.md)

[Globals](../globals.md) / [ExchangeClient](exchangeclient.md) /

# Class: ExchangeClient

## Hierarchy

* **ExchangeClient**

### Index

#### Constructors

* [constructor](exchangeclient.md#constructor)

#### Properties

* [assetRegistry](exchangeclient.md#assetregistry)
* [config](exchangeclient.md#config)

#### Accessors

* [isConnected](exchangeclient.md#isconnected)

#### Methods

* [cancelOrder](exchangeclient.md#cancelorder)
* [confirmWithdrawal](exchangeclient.md#confirmwithdrawal)
* [createOrder](exchangeclient.md#createorder)
* [deposit](exchangeclient.md#deposit)
* [fetchBalances](exchangeclient.md#fetchbalances)
* [fetchOrder](exchangeclient.md#fetchorder)
* [fetchOrderBook](exchangeclient.md#fetchorderbook)
* [fetchOrders](exchangeclient.md#fetchorders)
* [fetchTrades](exchangeclient.md#fetchtrades)
* [join](exchangeclient.md#join)
* [leave](exchangeclient.md#leave)
* [requestWithdrawal](exchangeclient.md#requestwithdrawal)
* [requestWithdrawalConvert](exchangeclient.md#requestwithdrawalconvert)
* [requestWithdrawalWithWeiConversion](exchangeclient.md#requestwithdrawalwithweiconversion)

## Constructors

###  constructor

\+ **new ExchangeClient**(`identity`: `Identity`, `hubClient`: `L2Client`, `assetRegistry`: `AssetRegistry`, `config`: `ClientConfig`): *[ExchangeClient](exchangeclient.md)*

Constructor

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`identity` | `Identity` | Identity used by the operator for signing |
`hubClient` | `L2Client` | L2Client to communicate with the operator layer |
`assetRegistry` | `AssetRegistry` | AssetRegistry, mapping asset symbols to Ethereum addresses |
`config` | `ClientConfig` | Configuration object including mediator address, fees, etc  |

**Returns:** *[ExchangeClient](exchangeclient.md)*

___

## Properties

###  assetRegistry

● **assetRegistry**: *`AssetRegistry`*

___

###  config

● **config**: *`ClientConfig`*

___

## Accessors

###  isConnected

● **get isConnected**(): *boolean*

Returns whether the client is currently connected

**Returns:** *boolean*

___

## Methods

###  cancelOrder

▸ **cancelOrder**(`id`: string): *`Promise<void>`*

Cancels an active order

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`id` | string | ID of the order to cancel  |

**Returns:** *`Promise<void>`*

___

###  confirmWithdrawal

▸ **confirmWithdrawal**(`asset`: string): *`Promise<void>`*

Confirms an elligible withdrawal

The withdrawal must have been initiated with requestWithdrawal and
additional conditions must be met for it to be elligible for confirmation.

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the asset to confirm for  |

**Returns:** *`Promise<void>`*

___

###  createOrder

▸ **createOrder**(`symbol`: string, `orderType`: "limit", `side`: "buy" | "sell", `amount`: `BigNumber`, `price`: `BigNumber`): *`Promise<string>`*

Create order

**`signing_required`** 

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`symbol` | string | Asset pair (e.g. OAX/WETH) |
`orderType` | "limit" | Must be 'limit' |
`side` | "buy" \| "sell" | Must be 'buy' or 'sell' |
`amount` | `BigNumber` | Amount to buy or sell (in Ether units) |
`price` | `BigNumber` | Limit price for the order |

**Returns:** *`Promise<string>`*

The ID for the newly created order

___

###  deposit

▸ **deposit**(`asset`: string, `amount`: `BigNumber`, `approve`: boolean): *`Promise<void>`*

Deposit asset

**`onchain`** 

**`signing_required`** 

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the token for the withdrawal |
`amount` | `BigNumber` | Quantity of tokens to be withdrawn (in wei) |
`approve` | boolean | Whether to call ERC20.approve before doing the deposit  |

**Returns:** *`Promise<void>`*

___

###  fetchBalances

▸ **fetchBalances**(): *`Promise<IExchangeBalances>`*

Get all balances for each asset

**Returns:** *`Promise<IExchangeBalances>`*

___

###  fetchOrder

▸ **fetchOrder**(`id`: string): *`Promise<IOrder | null>`*

Get order details

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`id` | string | ID of the order to fetch  |

**Returns:** *`Promise<IOrder | null>`*

___

###  fetchOrderBook

▸ **fetchOrderBook**(`symbol`: string): *`Promise<IOrderBook>`*

Get the order book for a symbol asset pair

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`symbol` | string | Asset pair (e.g. OAX/WETH)  |

**Returns:** *`Promise<IOrderBook>`*

___

###  fetchOrders

▸ **fetchOrders**(): *`Promise<IOrder[]>`*

Get all user orders

**Returns:** *`Promise<IOrder[]>`*

___

###  fetchTrades

▸ **fetchTrades**(`symbol`: string): *`Promise<ITradeExternal[]>`*

Trade history for a symbol/asset pair

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`symbol` | string | Asset pair (e.g. OAX/WETH)  |

**Returns:** *`Promise<ITradeExternal[]>`*

___

###  join

▸ **join**(): *`Promise<void>`*

Joins an OAX hub

Each wallet address must join the operator at least once

**`signing_required`** 

**Returns:** *`Promise<void>`*

___

###  leave

▸ **leave**(): *`Promise<void>`*

Leaves an OAX hub

Gracefully leaves an OAX hub, doing the necessary cleanup.

**Returns:** *`Promise<void>`*

___

###  requestWithdrawal

▸ **requestWithdrawal**(`asset`: string, `amount`: `BigNumber`): *`Promise<void>`*

Initiates a withdrawal without wei conversion

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the token for the withdrawal |
`amount` | `BigNumber` | Quantity of tokens to withdraw (in wei)  |

**Returns:** *`Promise<void>`*

___

###  requestWithdrawalConvert

▸ **requestWithdrawalConvert**(`asset`: string, `amount`: `BigNumber`, `convertToWei`: boolean): *`Promise<void>`*

Non-collaborative asset withdrawal request

In case if the hub is unresponsive, the withdrawal request can be
submitted directly to the hub smart contract.

A withdrawal confirmation window must pass
(approximately X hours currently) before the user can perform the actual
withdrawal by calling on-chain withdrawal.

Note: Confirmation of withdrawal handled by hubClient on new Quarter.

**`onchain`** 

**`signing_required`** 

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the token for the withdrawal |
`amount` | `BigNumber` | Quantity of tokens to be withdrawn |
`convertToWei` | boolean | True if the amount needs to be converted to wei  |

**Returns:** *`Promise<void>`*

___

###  requestWithdrawalWithWeiConversion

▸ **requestWithdrawalWithWeiConversion**(`asset`: string, `amount`: `BigNumber`): *`Promise<void>`*

Initiates a withdrawal with wei conversion

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | - |
`amount` | `BigNumber` | Quantity of tokens (will be converted to wei)  |

**Returns:** *`Promise<void>`*

___