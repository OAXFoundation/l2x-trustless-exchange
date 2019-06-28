# Operator Notes

L2X is a time based protocol that relies on events happening withing a specific interval. At the core of the protocol implementation is the processing of new quarters and the commit function, where the operator performs a number of critical operations including:

1. Processing deposits
The operator needs to credit all on-chain deposits that happened in the previous round so that the client balances is credited accordingly.

2. Processing withdrawals
The operator needs to look at withdrawals that were initiated during the previous round and cancel them if they are not valid (e.g. the user is trying to withdraw amounts that are locked in orders). For withdrawals that are invalid, the operator will be allowed to cancel them on-chain.
For withdrawals that are indeed valid, they will be debited from the exchange ledger.

3. Processing open disputes
The operator needs to look at the disputes that were opened during the previous quarter and close them by providing proofs and signed messages that the Mediator smart contract needs to accept closure.

4. Committing a new root for each asset
The operator needs to commit the Merkle root of the balance tree for each asset and update it on-chain, via the Mediator smart contract.

All the above functions are handled automatically by the operator code and no external input should be needed under normal conditions. For this to work properly though, we need to make sure that:

1. The operator remains continuously online to:
    - Process blockchain events.
    - Issue the cancelWithdrawal, closeDispute and commit transactions to the blockchain.

    ** please watch for memory, disk, networking, compute availability. the exchange's node.js process itself. Also consider a high-availability setup in multiple regions.

2. The operator key has enough ETH in order to issue the required transactions (may want keep a minimum of 10+ ETH in the wallet at any time to avoid interruptions).

3. Connectivity to the blockchain network is always available.
    - Can use a service such as [infura.io](http://infura.io/) for blockchain node since maintaining a node running is not an easy task.

4. The data stored by the operator in the local database (under the /storage folder) is properly safeguarded.

5. Monitor the logs (under the /logs folder) for any warnings or errors.

The most time-sensitive part of the protocol needs the operator to be able to respond to events within 1 quarter. A quarter is defined in number of blocks on the blockchain and is configurable by the operator at deployment time. In typical setups, we would use a quarter time of 8 hours (aka a round time of 24 hours) which means that the operator needs to make sure to react to all events and finish processing within that 8 hour time window otherwise the Mediator smart contract may go into HALTED mode. HALTED mode is a necessary safeguarded which guarantees the trustlessnes of the protocol. Once HALTED, all users can safely withdraw their funds from the Mediator smart contract without incurring any loss.

In case the exchange fails to process events because of planned or unplanned downtime, networking issues, not enough ETH or other such issues, it is possible to retry / replay the processing of events in order to ensure a consistent state and return to normal operations. There are two ways to handle this:

### Resolving issues

The operator has logic in place so that if any of the event processing has failed, it will retry.

If the operator process has terminated (aka crashed), you may simply restart the operator and at the next block event from the blockchain, it will automatically check what was the last block successfully processed and resume processing events from the last successful checkpoint.

If a few retries, the operator is not able to process the event, it will terminate. Somesome should investigate the issue and then restart the operator process again so it can resume where it left off.