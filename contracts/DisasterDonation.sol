
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DisasterDonation is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =========================================================
    // 1. ROLES
    // =========================================================

    address public admin;

    mapping(address => bool) public amils;
    mapping(address => bool) public volunteers;
    mapping(address => bool) public auditors;
    mapping(address => bool) public regulators;

    IERC20 public immutable token;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyAmil() {
        require(amils[msg.sender], "Only amil");
        _;
    }

    modifier onlyVolunteer() {
        require(volunteers[msg.sender], "Only volunteer");
        _;
    }

    modifier onlyAuditor() {
        require(auditors[msg.sender], "Only auditor");
        _;
    }

    modifier onlyAuditorOrRegulator() {
        require(
            auditors[msg.sender] || regulators[msg.sender],
            "Only auditor or regulator"
        );
        _;
    }

    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Invalid token address");

        admin = msg.sender;
        token = IERC20(tokenAddress);
    }

    function setAmil(address account, bool enabled)
        external
        onlyAdmin
    {
        require(account != address(0), "Invalid address");
        amils[account] = enabled;
        emit RoleUpdated(account, "AMIL", enabled);
    }

    function setVolunteer(address account, bool enabled)
        external
        onlyAdmin
    {
        require(account != address(0), "Invalid address");
        volunteers[account] = enabled;
        emit RoleUpdated(account, "VOLUNTEER", enabled);
    }

    function setAuditor(address account, bool enabled)
        external
        onlyAdmin
    {
        require(account != address(0), "Invalid address");
        auditors[account] = enabled;
        emit RoleUpdated(account, "AUDITOR", enabled);
    }

    function setRegulator(address account, bool enabled)
        external
        onlyAdmin
    {
        require(account != address(0), "Invalid address");
        regulators[account] = enabled;
        emit RoleUpdated(account, "REGULATOR", enabled);
    }

    // =========================================================
    // 2. DATA STRUCTURES
    // =========================================================

    enum DonationStatus {
        RECEIVED,
        ALLOCATED,
        DISBURSED
    }

    enum DisbursementStatus {
        PENDING,
        APPROVED,
        REJECTED
    }

    struct Donation {
        address donor;
        uint256 amount;
        uint256 allocatedAmount;
        uint256 disbursedAmount;
        DonationStatus status;
        bool exists;
    }

    struct Recipient {
        address wallet;
        address submittedBy;
        bytes32 documentHash;
        bool amilVerified;
        bool auditorVerified;
        bool exists;
    }

    struct Allocation {
        uint256 donationId;
        bytes32 recipientHash;
        uint256 amount;
        uint256 disbursedAmount;
        uint256 reservedAmount;
        bool exists;
    }

    struct Disbursement {
        uint256 allocationId;
        uint256 amount;
        bytes32 documentHash;
        DisbursementStatus status;
        bool exists;
    }

    uint256 public nextDonationId = 1;
    uint256 public nextAllocationId = 1;
    uint256 public nextDisbursementId = 1;

    mapping(uint256 => Donation) private donations;
    mapping(bytes32 => Recipient) private recipients;
    mapping(uint256 => Allocation) private allocations;
    mapping(uint256 => Disbursement) private disbursements;

    // =========================================================
    // 3. EVENTS
    // =========================================================

    event RoleUpdated(
        address indexed account,
        string role,
        bool enabled
    );

    event DonationReceived(
        uint256 indexed donationId,
        address indexed donor,
        uint256 amount
    );

    event RecipientSubmitted(
        bytes32 indexed recipientHash,
        address indexed wallet,
        address submittedBy
    );

    event RecipientVerified(
        bytes32 indexed recipientHash,
        address indexed verifier,
        string verifierRole
    );

    event DonationAllocated(
        uint256 indexed allocationId,
        uint256 indexed donationId,
        bytes32 indexed recipientHash,
        uint256 amount
    );

    event DisbursementRequested(
        uint256 indexed disbursementId,
        uint256 indexed allocationId,
        uint256 amount
    );

    event DisbursementApproved(
        uint256 indexed disbursementId,
        address indexed recipientWallet,
        uint256 amount
    );

    event DisbursementRejected(
        uint256 indexed disbursementId,
        address indexed auditor,
        bytes32 reasonHash
    );

    // =========================================================
    // 4. DONATIONS
    // =========================================================

    function donate(uint256 amount)
        external
        nonReentrant
        returns (uint256 donationId)
    {
        require(amount > 0, "Amount must be positive");

        donationId = nextDonationId++;

        // Reverts if the ERC-20 transfer fails.
        token.safeTransferFrom(msg.sender, address(this), amount);

        donations[donationId] = Donation({
            donor: msg.sender,
            amount: amount,
            allocatedAmount: 0,
            disbursedAmount: 0,
            status: DonationStatus.RECEIVED,
            exists: true
        });

        emit DonationReceived(donationId, msg.sender, amount);
    }

    // =========================================================
    // 5. RECIPIENT REGISTRATION AND VERIFICATION
    // =========================================================

    function submitRecipient(
        bytes32 recipientHash,
        address wallet,
        bytes32 documentHash
    ) external onlyVolunteer {
        require(recipientHash != bytes32(0), "Invalid recipient hash");
        require(wallet != address(0), "Invalid wallet");
        require(documentHash != bytes32(0), "Invalid document hash");
        require(!recipients[recipientHash].exists, "Recipient exists");

        recipients[recipientHash] = Recipient({
            wallet: wallet,
            submittedBy: msg.sender,
            documentHash: documentHash,
            amilVerified: false,
            auditorVerified: false,
            exists: true
        });

        emit RecipientSubmitted(recipientHash, wallet, msg.sender);
    }

    function verifyRecipient(bytes32 recipientHash)
        external
        onlyAmil
    {
        Recipient storage recipient = recipients[recipientHash];

        require(recipient.exists, "Recipient not found");
        require(!recipient.amilVerified, "Already verified by amil");

        recipient.amilVerified = true;

        emit RecipientVerified(recipientHash, msg.sender, "AMIL");
    }

    function approveRecipient(bytes32 recipientHash)
        external
        onlyAuditor
    {
        Recipient storage recipient = recipients[recipientHash];

        require(recipient.exists, "Recipient not found");
        require(recipient.amilVerified, "Amil verification required");
        require(!recipient.auditorVerified, "Already auditor verified");

        recipient.auditorVerified = true;

        emit RecipientVerified(recipientHash, msg.sender, "AUDITOR");
    }

    // =========================================================
    // 6. DONATION ALLOCATION
    // =========================================================

    function allocateDonation(
        uint256 donationId,
        bytes32 recipientHash,
        uint256 amount
    )
        external
        onlyAmil
        returns (uint256 allocationId)
    {
        Donation storage donation = donations[donationId];
        Recipient storage recipient = recipients[recipientHash];

        require(donation.exists, "Donation not found");
        require(recipient.exists, "Recipient not found");
        require(recipient.amilVerified, "Amil verification required");
        require(recipient.auditorVerified, "Auditor verification required");
        require(amount > 0, "Amount must be positive");

        require(
            amount <= donation.amount - donation.allocatedAmount,
            "Insufficient unallocated donation"
        );

        donation.allocatedAmount += amount;
        donation.status = DonationStatus.ALLOCATED;

        allocationId = nextAllocationId++;

        allocations[allocationId] = Allocation({
            donationId: donationId,
            recipientHash: recipientHash,
            amount: amount,
            disbursedAmount: 0,
            reservedAmount: 0,
            exists: true
        });

        emit DonationAllocated(
            allocationId,
            donationId,
            recipientHash,
            amount
        );
    }

    // =========================================================
    // 7. DISBURSEMENT REQUEST
    // =========================================================

    function requestDisbursement(
        uint256 allocationId,
        uint256 amount,
        bytes32 documentHash
    )
        external
        onlyAmil
        returns (uint256 disbursementId)
    {
        Allocation storage allocation = allocations[allocationId];

        require(allocation.exists, "Allocation not found");
        require(amount > 0, "Amount must be positive");
        require(documentHash != bytes32(0), "Invalid document hash");

        uint256 remaining = allocation.amount
            - allocation.disbursedAmount
            - allocation.reservedAmount;

        require(amount <= remaining, "Insufficient allocation balance");

        // Reserve funds to prevent overlapping pending requests.
        allocation.reservedAmount += amount;

        disbursementId = nextDisbursementId++;

        disbursements[disbursementId] = Disbursement({
            allocationId: allocationId,
            amount: amount,
            documentHash: documentHash,
            status: DisbursementStatus.PENDING,
            exists: true
        });

        emit DisbursementRequested(
            disbursementId,
            allocationId,
            amount
        );
    }

    // =========================================================
    // 8. AUDITOR APPROVAL AND TOKEN TRANSFER
    // =========================================================

    function approveDisbursement(uint256 disbursementId)
        external
        onlyAuditor
        nonReentrant
    {
        Disbursement storage disbursement =
            disbursements[disbursementId];

        require(disbursement.exists, "Disbursement not found");
        require(
            disbursement.status == DisbursementStatus.PENDING,
            "Request is not pending"
        );

        Allocation storage allocation =
            allocations[disbursement.allocationId];

        Donation storage donation =
            donations[allocation.donationId];

        Recipient storage recipient =
            recipients[allocation.recipientHash];

        require(recipient.exists, "Recipient not found");
        require(recipient.amilVerified, "Amil verification required");
        require(recipient.auditorVerified, "Auditor verification required");

        uint256 amount = disbursement.amount;

        require(
            allocation.reservedAmount >= amount,
            "Invalid reserved amount"
        );

        // Effects before interaction; a failed token transfer reverts
        // these state changes as part of the same transaction.
        disbursement.status = DisbursementStatus.APPROVED;
        allocation.reservedAmount -= amount;
        allocation.disbursedAmount += amount;
        donation.disbursedAmount += amount;

        if (donation.disbursedAmount >= donation.amount) {
            donation.status = DonationStatus.DISBURSED;
        }

        // Actual ERC-20 transfer to the beneficiary wallet.
        // If this fails, the entire transaction reverts.
        token.safeTransfer(recipient.wallet, amount);

        emit DisbursementApproved(
            disbursementId,
            recipient.wallet,
            amount
        );
    }

    // =========================================================
    // 9. AUDITOR REJECTION
    // =========================================================

    function rejectDisbursement(
        uint256 disbursementId,
        bytes32 reasonHash
    ) external onlyAuditor {
        Disbursement storage disbursement =
            disbursements[disbursementId];

        require(disbursement.exists, "Disbursement not found");
        require(
            disbursement.status == DisbursementStatus.PENDING,
            "Request is not pending"
        );
        require(reasonHash != bytes32(0), "Invalid reason hash");

        Allocation storage allocation =
            allocations[disbursement.allocationId];

        require(
            allocation.reservedAmount >= disbursement.amount,
            "Invalid reserved amount"
        );

        // Release the reservation; do not consume allocation balance.
        allocation.reservedAmount -= disbursement.amount;

        disbursement.status = DisbursementStatus.REJECTED;

        emit DisbursementRejected(
            disbursementId,
            msg.sender,
            reasonHash
        );
    }

    // =========================================================
    // 10. READ FUNCTIONS
    // =========================================================

    function getDonation(uint256 donationId)
        external
        view
        returns (Donation memory)
    {
        require(donations[donationId].exists, "Donation not found");
        return donations[donationId];
    }

    function getRecipient(bytes32 recipientHash)
        external
        view
        returns (Recipient memory)
    {
        require(recipients[recipientHash].exists, "Recipient not found");
        return recipients[recipientHash];
    }

    function getAllocation(uint256 allocationId)
        external
        view
        returns (Allocation memory)
    {
        require(allocations[allocationId].exists, "Allocation not found");
        return allocations[allocationId];
    }

    function getDisbursement(uint256 disbursementId)
        external
        view
        returns (Disbursement memory)
    {
        require(
            disbursements[disbursementId].exists,
            "Disbursement not found"
        );
        return disbursements[disbursementId];
    }

    // =========================================================
    // 11. AUDIT VIEW
    // =========================================================

    function getContractTokenBalance()
        external
        view
        onlyAuditorOrRegulator
        returns (uint256)
    {
        return token.balanceOf(address(this));
    }
}
