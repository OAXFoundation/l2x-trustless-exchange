pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2; // solium-disable-line no-experimental

// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import "./Mediator.sol";


/**
 * @title MediatorMockChaos
 * Contract that has the same behaviour as Mediator, yet with the possibility to halt on demand.
 * Used for chaos testing.
 */
contract MediatorMockChaos is Mediator {

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

}
