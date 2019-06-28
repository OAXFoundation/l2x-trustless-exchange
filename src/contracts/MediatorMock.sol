pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2; // solium-disable-line no-experimental

// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import "./Mediator.sol";


/**
 * @title MediatorMock
 * Note that all the functions below are only for testing purposes.
 */
contract MediatorMock is Mediator {

    uint256 blockNumber;

    //Events, for debugging purposes only
    event ShowAddress(address value);
    event ShowUint256(uint256 value);

    //This boolean field enables to skip the execution
    // of Mediator.checkClaimedVSExpectedBalances
    bool public skipCompareBalancesDispute;

    constructor(
        uint32 roundSize,
        address operatorAddress
    ) Mediator(
        roundSize,
        operatorAddress
    )
    public {
        roundSize = roundSize;
        operatorAddress = operatorAddress;
        skipCompareBalancesDispute = false;
    }

    /**
     * Enables to set halt to true
     */
    function halt() public {
        haltedRound = getCurrentRound();
        haltedQuarter = getCurrentQuarter();

        halted = true;

        emit Halted(haltedRound, haltedQuarter);
    }

    /**
     * Returns the current block number
     */
    function getCurrentBlockNumber()
    public
    view
    returns (uint256)
    {
        return blockNumber;
    }

    /**
     * Unregister a token.
     * For testing purpose only
     */
    function unregisterToken(address tokenAddress)
    public
    onlyBy(operatorAddress)
    {
        // If the token is registered we unregister it
        if (registeredTokens[tokenAddress]) {
            registeredTokens[tokenAddress] = false;
            tokenCount = tokenCount.sub(1);
        }
    }

    /**
     * Skip a few blocks
     * @param n number of blocks to skip
     */
    function skipBlocks(uint256 n)
    public
    {
        blockNumber = blockNumber + n;
    }

    /**
    * Enables to update the block number so that we go to the next round
    */
    function skipToNextRound()
    public
    {
        uint256 currentRound = getCurrentRound();
        uint256 firstBlockOfNextRound = (currentRound + 1) * roundSize;
        setBlockNumber(firstBlockOfNextRound);
    }

    /**
     * Enables to go back to round 0
     */
    function goToRound0()
    public
    {
        setBlockNumber(blockNumberAtCreation);
    }

    /**
     * Enables to update the block number so that we go to the next quarter
     */
    function skipToNextQuarter()
    public
    {
        uint256 currentRound = getCurrentRound();
        uint256 currentQuarter = getCurrentQuarter();
        uint256 firstBlockOfNextQuarter = currentRound * roundSize + (currentQuarter + 1) * quarterSize;
        setBlockNumber(firstBlockOfNextQuarter);
    }

    /**
     * Sets some value for the totalWithdrawal map
     * @param round round to consider for the update operation
     * @param tokenAddress type of token used
     * @param amount total of amount that was withdrawn during the round *round*
     */
    function setTotalWithdrawalAmount(uint256 round, address tokenAddress, uint256 amount)
    public
    {
        totalRequestedWithdrawals[round][tokenAddress] = amount;
    }

    /**
     * Sets the counter for open balance disputes for a specific round
     */
    function setOpenDisputeCounter(uint256 round, uint256 counter)
    public
    {
        openDisputeCounters[round] = counter;
    }

    /**
     * Enables to set the number of registered tokens.
     */
    function setRegisteredNumTokens(uint256 numTokensValue)
    public
    {
        tokenCount = numTokensValue;
    }

    /**
     * Enables to set the number commits for a specific round
     */
    function setCommitsCounter(uint256 round, uint256 numberOfCommits)
    public
    {
        commitCounters[round] = numberOfCommits;
    }

    ///// Dispute related functions ////////////////////////////////////////////////////////////////////////////////////

    /**
     * Get the length of the fillsId array
     * @param clientAddress address of the client of opened the dispute
     */
    function getNumberOfFillsFromDispute(address clientAddress)
    public
    view
    returns (uint256)
    {
        uint256 res = disputes[clientAddress].fillCount;
        return res;
    }

    function setCommittedRounds(uint256 count)
    public
    {
        committedRounds = count;
    }

    /**
     * Get a specific fill Id from a dispute
     * @param disputeId id of the dispute.
     * @param fillId id of the fill to retrieve.
     */
    function getFillFromDispute(
        uint256 disputeId,
        uint256 fillId
    )
    public
    view
    returns (Fill memory)
    {
        return disputeFills[disputeId][fillId];
    }

    /**
     * Get the length of the opening balances array for a dispute
     * @param clientAddress address of the client of opened the dispute
     */
    function getBalancesArrayLengthFromDispute(
        address clientAddress
    )
    public
    view
    returns (uint256)
    {
        uint256 res = disputes[clientAddress].openingBalances.length;
        return res;
    }

    /**
     * Get a specific balance from a dispute
     * @param clientAddress address of the client of opened the dispute
     * @param index index of the array where a specific balance
     */
    function getBalanceFromDispute(
        address clientAddress,
        uint256 index
    )
    public
    view
    returns (uint256)
    {
        uint256 res = disputes[clientAddress].openingBalances[index];
        return res;
    }

    /////////// End of dispute related functions ///////////////////////////////////////////////////////////////////////

    /**
     * Enables to set an arbitrary block number
     * @param newBlockNumber the block number to be considered from now on
     */
    function setBlockNumber(uint256 newBlockNumber)
    private
    {
        blockNumber = newBlockNumber;
    }


}
