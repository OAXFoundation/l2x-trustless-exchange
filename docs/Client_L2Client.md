> ## [OAX](../README.md)

[L2Client]() /

# Class: L2Client

## Hierarchy

* **L2Client**

### Index

#### Constructors

* [constructor](#constructor)

#### Properties

* [address](#address)
* [assets](#assets)
* [identity](#identity)
* [ledger](#ledger)
* [mediator](#mediator)
* [persistence](#persistence)
* [transport](#transport)

#### Accessors

* [isConnected](#isconnected)
* [quarter](#quarter)
* [round](#round)
* [roundJoined](#roundjoined)
* [roundSize](#roundsize)

#### Methods

* [cancelOrder](#cancelorder)
* [confirmWithdrawal](#confirmwithdrawal)
* [createOrder](#createorder)
* [deposit](#deposit)
* [getInstanceId](#getinstanceid)
* [hasFill](#hasfill)
* [init](#init)
* [isHalted](#ishalted)
* [join](#join)
* [leave](#leave)
* [withdraw](#withdraw)

## Constructors

###  constructor

\+ **new L2Client**(`identity`: `Identity`, `transport`: [HTTPClient](httpclient.md) | string, `options`: [L2ClientOptions](../interfaces/l2clientoptions.md)): *[L2Client]()*

Constructor

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`identity` | `Identity` | A JsonRPCIdentity or PrivateKeyIdentity object for the user's wallet. |
`transport` | [HTTPClient](httpclient.md) \| string | Used for communicating with the server. |
`options` | [L2ClientOptions](../interfaces/l2clientoptions.md) | Various configuration options including the operatorAddress, etc.  |

**Returns:** *[L2Client]()*

___

## Properties

###  address

● **address**: *string*

___

###  assets

● **assets**: *string[]*

___

###  identity

● **identity**: *`Identity`*

___

###  ledger

● **ledger**: *`MetaLedger`*

___

###  mediator

● **mediator**: *`IMediatorAsync`*

___

###  persistence

● **persistence**: *`knex`*

___

###  transport

● **transport**: *[HTTPClient](httpclient.md)*

___

## Accessors

###  isConnected

● **get isConnected**(): *boolean*

Checks if the client is connected to the server

**Returns:** *boolean*

___

###  quarter

● **get quarter**(): *`0` | `1` | `2` | `3`*

Returns the current quarter

**Returns:** *`0` | `1` | `2` | `3`*

___

###  round

● **get round**(): *number*

Returns the current round

**Returns:** *number*

___

###  roundJoined

● **get roundJoined**(): *number*

Gets the round number when the client first joined the operator

**Returns:** *number*

___

###  roundSize

● **get roundSize**(): *`BigNumber` | undefined*

Gets the round size for the mediator

**Returns:** *`BigNumber` | undefined*

___

## Methods

###  cancelOrder

▸ **cancelOrder**(`approvalId`: string): *`Promise<void>`*

Cancels an active order

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`approvalId` | string | Order Approval ID  |

**Returns:** *`Promise<void>`*

___

###  confirmWithdrawal

▸ **confirmWithdrawal**(`asset`: string): *`Promise<void>`*

Confirms a withdrawal that has been previously initiated by the user

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the asset for withdrawal  |

**Returns:** *`Promise<void>`*

___

###  createOrder

▸ **createOrder**(`order`: `IApproval`, `fee`: `IApproval`): *`Promise<string>`*

Creates a new BUY or SELL order also passing in required fee approval

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`order` | `IApproval` | Order Approval object |
`fee` | `IApproval` | Fee Approval object  |

**Returns:** *`Promise<string>`*

___

###  deposit

▸ **deposit**(`asset`: string, `amount`: `BigNumber`, `approve`: boolean): *`Promise<void>`*

Deposit asset from client wallet to the mediator

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the asset to deposit |
`amount` | `BigNumber` | Amount of asset to deposit (in wei) |
`approve` | boolean | Whether to call ERC20.approve before doing the token transfer  |

**Returns:** *`Promise<void>`*

___

###  getInstanceId

▸ **getInstanceId**(): *string*

Returns the instanceId (mediator contract address) that
the client is connected to

**Returns:** *string*

___

###  hasFill

▸ **hasFill**(`round`: number, `fill`: `ISignedFill`): *`Promise<boolean>`*

Checks if a given round has a fill

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`round` | number | Round number |
`fill` | `ISignedFill` | Fill object to check for  |

**Returns:** *`Promise<boolean>`*

___

###  init

▸ **init**(): *`Promise<void>`*

Initialize the client

**Returns:** *`Promise<void>`*

___

###  isHalted

▸ **isHalted**(): *`Promise<boolean>`*

Checks if the mediator is in HALTED mode

**Returns:** *`Promise<boolean>`*

___

###  join

▸ **join**(): *`Promise<void>`*

Joins the layer 2 network

**`throws`** {SignatureError}

**Returns:** *`Promise<void>`*

___

###  leave

▸ **leave**(): *`Promise<void>`*

Gracefull cleanup

**Returns:** *`Promise<void>`*

___

###  withdraw

▸ **withdraw**(`asset`: string, `amount`: `BigNumber`): *`Promise<TransactionReceipt>`*

Initiates a new withdrawal for a given asset

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the asset to withdraw |
`amount` | `BigNumber` | Amount to withdraw (in wei)  |

**Returns:** *`Promise<TransactionReceipt>`*

___