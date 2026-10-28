
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FailingToken is ERC20 {
    bool public failTransfers;

    constructor() ERC20("Failing Token", "FLT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailTransfers(bool enabled) external {
        failTransfers = enabled;
    }

    function transfer(address to, uint256 value)
        public
        override
        returns (bool)
    {
        require(!failTransfers, "Transfer failed");
        return super.transfer(to, value);
    }

    
function transferFrom(
    address from,
    address to,
    uint256 value
) public override returns (bool) {
    require(!failTransfers, "Transfer failed");
    return super.transferFrom(from, to, value);
}

}
