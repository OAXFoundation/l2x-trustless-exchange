> ## [@oax/client](../README.md)

[Globals](../globals.md) / [L2Client](l2client.md) /

# Class: L2Client

## Hierarchy

* **L2Client**

### Index

#### Constructors

* [constructor](l2client.md#constructor)

#### Properties

* [address](l2client.md#address)
* [assets](l2client.md#assets)
* [identity](l2client.md#identity)
* [ledger](l2client.md#ledger)
* [persistence](l2client.md#persistence)
* [transport](l2client.md#transport)

#### Accessors

* [authorization](l2client.md#authorization)
* [isConnected](l2client.md#isconnected)
* [quarter](l2client.md#quarter)
* [round](l2client.md#round)
* [roundJoined](l2client.md#roundjoined)
* [roundSize](l2client.md#roundsize)

#### Methods

* [audit](l2client.md#audit)
* [auditAsset](l2client.md#auditasset)
* [cancelOrder](l2client.md#cancelorder)
* [checkProof](l2client.md#checkproof)
* [checkProofsArray](l2client.md#checkproofsarray)
* [confirmWithdrawal](l2client.md#confirmwithdrawal)
* [createOrder](l2client.md#createorder)
* [deposit](l2client.md#deposit)
* [ensureQuarter](l2client.md#ensurequarter)
* [ensureRound](l2client.md#ensureround)
* [fetchFills](l2client.md#fetchfills)
* [fetchProofs](l2client.md#fetchproofs)
* [getBalanceTokenOffChain](l2client.md#getbalancetokenoffchain)
* [getBalanceTokenOnChain](l2client.md#getbalancetokenonchain)
* [getInstanceId](l2client.md#getinstanceid)
* [getProofAsync](l2client.md#getproofasync)
* [getRegisteredAssets](l2client.md#getregisteredassets)
* [getSortedProofsArray](l2client.md#getsortedproofsarray)
* [goToQuarter](l2client.md#gotoquarter)
* [goToRound](l2client.md#gotoround)
* [hasAuthorization](l2client.md#hasauthorization)
* [hasFill](l2client.md#hasfill)
* [init](l2client.md#init)
* [insertFill](l2client.md#insertfill)
* [isHalted](l2client.md#ishalted)
* [isProofBalanceOk](l2client.md#isproofbalanceok)
* [join](l2client.md#join)
* [leave](l2client.md#leave)
* [makeSignedApproval](l2client.md#makesignedapproval)
* [on](l2client.md#on)
* [onNewBlockAsync](l2client.md#onnewblockasync)
* [onReceiveFillAsync](l2client.md#onreceivefillasync)
* [once](l2client.md#once)
* [openBalanceDispute](l2client.md#openbalancedispute)
* [recoverFunds](l2client.md#recoverfunds)
* [signApprovBytes](l2client.md#signapprovbytes)
* [storeProofsAsync](l2client.md#storeproofsasync)
* [waitForEvent](l2client.md#waitforevent)
* [withdraw](l2client.md#withdraw)

## Constructors

###  constructor

\+ **new L2Client**(`identity`: `Identity`, `transport`: `HTTPClient` | string, `options`: `L2ClientOptions`): *[L2Client](l2client.md)*

Constructor

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`identity` | `Identity` | A JsonRPCIdentity or PrivateKeyIdentity object for the user's wallet. |
`transport` | `HTTPClient` \| string | Used for communicating with the server. |
`options` | `L2ClientOptions` | Various configuration options including the operatorAddress, etc.  |

**Returns:** *[L2Client](l2client.md)*

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

###  persistence

● **persistence**: *`knex`*

___

###  transport

● **transport**: *`HTTPClient`*

___

## Accessors

###  authorization

● **get authorization**(): *`IAuthorizationMessage`*

Returns the authorization message signed by the operator when joining

**Returns:** *`IAuthorizationMessage`*

___

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

###  audit

▸ **audit**(): *`Promise<void>`*

Checks that the operator / mediator state is accurate else open a dispute

**Returns:** *`Promise<void>`*

___

###  auditAsset

▸ **auditAsset**(`asset`: string, `proof`: `Proof`, `round`: number): *`Promise<void>`*

Audits a specific asset and throws if the audit fails

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the asset to audit |
`proof` | `Proof` | Proof for the asset at the given round |
`round` | number | Round number  |

**Returns:** *`Promise<void>`*

___

###  cancelOrder

▸ **cancelOrder**(`approvalId`: string): *`Promise<void>`*

Cancels an active order

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`approvalId` | string | Order Approval ID  |

**Returns:** *`Promise<void>`*

___

###  checkProof

▸ **checkProof**(`proof`: `Proof`, `proofRound`: number): *`Promise<void>`*

Checks that the proof is valid for the given round

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`proof` | `Proof` | Proof object to validate |
`proofRound` | number | Round number  |

**Returns:** *`Promise<void>`*

___

###  checkProofsArray

▸ **checkProofsArray**(`proofs`: `Proof`[], `round`: number): *`Promise<void>`*

Check a whole proofs array sent by the operator

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`proofs` | `Proof`[] | Array of proofs to check |
`round` | number | Round number to check against  |

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

###  ensureQuarter

▸ **ensureQuarter**(): *`Promise<void>`*

Internal use only

**Returns:** *`Promise<void>`*

___

###  ensureRound

▸ **ensureRound**(): *`Promise<void>`*

Internal use only

**Returns:** *`Promise<void>`*

___

###  fetchFills

▸ **fetchFills**(`round`: number): *`Promise<void>`*

Retrieves all fills for a given round

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`round` | number | Round number  |

**Returns:** *`Promise<void>`*

___

###  fetchProofs

▸ **fetchProofs**(`round`: number): *`Promise<Proof[]>`*

Returns all proofs for the given round

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`round` | number | Round number  |

**Returns:** *`Promise<Proof[]>`*

___

###  getBalanceTokenOffChain

▸ **getBalanceTokenOffChain**(`assetAddress`: string, `round`: number): *`Promise<BigNumber>`*

Returns the balance for a specific asset/round

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`assetAddress` | string | Address of the address |
`round` | number | Round for computing the balance  |

**Returns:** *`Promise<BigNumber>`*

___

###  getBalanceTokenOnChain

▸ **getBalanceTokenOnChain**(`assetAddress`: string): *`Promise<BigNumber>`*

Returns the balance of tokens on-chain

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`assetAddress` | string | Address of the asset to return the balance for  |

**Returns:** *`Promise<BigNumber>`*

___

###  getInstanceId

▸ **getInstanceId**(): *string*

Returns the instanceId (mediator contract address) that
the client is connected to

**Returns:** *string*

___

###  getProofAsync

▸ **getProofAsync**(`asset`: string, `round`: number): *`Promise<Proof | undefined>`*

Fetches a proof for the given asset and round number

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the asset to get the proof for |
`round` | number | Round number  |

**Returns:** *`Promise<Proof | undefined>`*

___

###  getRegisteredAssets

▸ **getRegisteredAssets**(): *`Promise<string[]>`*

Returns the ordered list of registered assets of the mediator

**Returns:** *`Promise<string[]>`*

___

###  getSortedProofsArray

▸ **getSortedProofsArray**(`round`: number): *`Promise<Proof[]>`*

Returns the list of proofs sorted by registered assets

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`round` | number | Round of the proofs to be retrieved  |

**Returns:** *`Promise<Proof[]>`*

___

###  goToQuarter

▸ **goToQuarter**(`round`: number, `quarter`: `Quarter`): *`Promise<void>`*

Internal use only

**Parameters:**

Name | Type |
------ | ------ |
`round` | number |
`quarter` | `Quarter` |

**Returns:** *`Promise<void>`*

___

###  goToRound

▸ **goToRound**(`round`: number): *void*

Internal use only

**Parameters:**

Name | Type |
------ | ------ |
`round` | number |

**Returns:** *void*

___

###  hasAuthorization

▸ **hasAuthorization**(): *boolean*

Checks if the client has been authorized to join the exchange
Assumes the join() function took care of verifying the authorization
token

**Returns:** *boolean*

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

###  insertFill

▸ **insertFill**(`fill`: `ISignedFill`): *`Promise<void>`*

Internal use only

**Parameters:**

Name | Type |
------ | ------ |
`fill` | `ISignedFill` |

**Returns:** *`Promise<void>`*

___

###  isHalted

▸ **isHalted**(): *`Promise<boolean>`*

Checks if the mediator is in HALTED mode

**Returns:** *`Promise<boolean>`*

___

###  isProofBalanceOk

▸ **isProofBalanceOk**(`asset`: string, `round`: number, `proofBalance`: `BigNumber`): *`Promise<boolean>`*

Checks that the ledger balance matches the proof balance

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the asset to check |
`round` | number | Round number |
`proofBalance` | `BigNumber` | Balance amount of the proof  |

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

###  makeSignedApproval

▸ **makeSignedApproval**(`approvParams`: `IApproval`): *`Promise<ISignedApproval>`*

Signs an approval object using the client key

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`approvParams` | `IApproval` | Approval object to sign  |

**Returns:** *`Promise<ISignedApproval>`*

___

###  on

▸ **on**(`eventName`: string, `callback`: `ListenerFn`): *void*

Used to watch for specific events

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`eventName` | string | Name of the event to watch for |
`callback` | `ListenerFn` | Callback function to be invoked when the event happens  |

**Returns:** *void*

___

###  onNewBlockAsync

▸ **onNewBlockAsync**(): *`Promise<void>`*

Internal use only

**Returns:** *`Promise<void>`*

___

###  onReceiveFillAsync

▸ **onReceiveFillAsync**(`fill`: `ISignedFill`): *`Promise<void>`*

Internal use only

**Parameters:**

Name | Type |
------ | ------ |
`fill` | `ISignedFill` |

**Returns:** *`Promise<void>`*

___

###  once

▸ **once**(`eventName`: string, `callback`: `ListenerFn`): *void*

Used to watch for specific events

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`eventName` | string | Name of the event to watch for |
`callback` | `ListenerFn` | Callback function to be invoked when the event happens  |

**Returns:** *void*

___

###  openBalanceDispute

▸ **openBalanceDispute**(`round`: number): *`Promise<void>`*

Opens a new balance dispute

The operator will have to answer this challenge within a certain
time otherwise the mediator will go into HALTED mode.

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`round` | number | Round number  |

**Returns:** *`Promise<void>`*

___

###  recoverFunds

▸ **recoverFunds**(`asset`: string): *`Promise<void>`*

Allows the use to recover funds once the mediator has
entered HALTED state.

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`asset` | string | Address of the asset to recover funds for  |

**Returns:** *`Promise<void>`*

___

###  signApprovBytes

▸ **signApprovBytes**(`approvParams`: `IApproval`): *`Promise<SignatureSol>`*

Internal use only

**Parameters:**

Name | Type |
------ | ------ |
`approvParams` | `IApproval` |

**Returns:** *`Promise<SignatureSol>`*

___

###  storeProofsAsync

▸ **storeProofsAsync**(`proofs`: `Proof`[], `round`: number): *`Promise<void>`*

Stores a set of proofs for a given round

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`proofs` | `Proof`[] | Array of proofs |
`round` | number | Round number  |

**Returns:** *`Promise<void>`*

___

###  waitForEvent

▸ **waitForEvent**(`eventName`: string): *`Promise<any>`*

Used to watch for specific events

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`eventName` | string | Name of the event to watch for  |

**Returns:** *`Promise<any>`*

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