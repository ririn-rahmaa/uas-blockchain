// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ITokenCallback {
    function onTokenTransfer() external;
}

contract ReentrantToken is ERC20 {
    address public target;
    address public callback;
    bool public attackEnabled;

    constructor() ERC20("Reentrant Token", "RTK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function configureAttack(address targetAddress, address callbackAddress)
        external
    {
        target = targetAddress;
        callback = callbackAddress;
        attackEnabled = true;
    }

    function transfer(address to, uint256 value)
        public
        override
        returns (bool)
    {
        if (attackEnabled && msg.sender == target) {
            attackEnabled = false;
            ITokenCallback(callback).onTokenTransfer();
        }

        return super.transfer(to, value);
    }
}