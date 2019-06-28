pragma solidity ^0.5.0;

// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import "./openzeppelin/ERC20.sol";


contract ETHToken is ERC20 {

    string public constant name = "ETH Token";
    string public constant symbol = "ETH";
    uint8 public constant decimals = 0;

    constructor() public {
        _totalSupply = 0;
    }

    function ()
    external
    payable
    {
        address sender = msg.sender;
        uint256 amount = msg.value;

        _totalSupply = _totalSupply.add(amount);
        _balances[sender] = _balances[sender].add(amount);
    }

    function withdraw()
    public
    {
        address payable sender = msg.sender;
        uint256 amount = _balances[sender];

        _balances[sender] = 0;
        _totalSupply = _totalSupply.sub(amount);

        sender.transfer(amount);
    }

}
