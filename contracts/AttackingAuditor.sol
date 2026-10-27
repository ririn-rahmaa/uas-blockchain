// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDonationTarget {
    function approveDisbursement(uint256 id) external;
}

contract AttackingAuditor {
    IDonationTarget public donation;
    address public token;
    uint256 public disbursementId;
    bool public reentryAttempted;
    bool public reentryBlocked;

    constructor(address donationAddress, address tokenAddress) {
        donation = IDonationTarget(donationAddress);
        token = tokenAddress;
    }

    function attack(uint256 id) external {
        disbursementId = id;
        donation.approveDisbursement(id);
    }

    function onTokenTransfer() external {
        require(msg.sender == token, "Only token");
        reentryAttempted = true;

        try donation.approveDisbursement(disbursementId) {
            // Reentry unexpectedly succeeded.
        } catch {
            reentryBlocked = true;
        }
    }
}