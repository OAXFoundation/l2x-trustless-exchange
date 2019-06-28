pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2; // solium-disable-line no-experimental

// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------


contract Struct {

    struct MyStruct {
        uint256 a;
        uint256 b;
    }

    function acceptStruct(MyStruct memory s) public pure returns (uint256) {
        return s.a + s.b;
    }

    function returnStruct(uint256 a, uint256 b) public pure returns (MyStruct memory) {
        return MyStruct(a, b);
    }
}
