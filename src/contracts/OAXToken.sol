pragma solidity ^0.5.0;

// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import "./openzeppelin/ERC20.sol";


contract OAXToken is ERC20 {
    string public constant name = "OAX Token";
    string public constant symbol = "OAX";
    uint8 public constant decimals = 18;

    constructor() public {
        _totalSupply = 2100000000 * 10 ** uint(decimals);

        _balances[msg.sender] = _totalSupply;

        emit Transfer(address(0), msg.sender, _totalSupply);
    }
}
