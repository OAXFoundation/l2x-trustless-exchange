pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2; // solium-disable-line no-experimental

// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// ----------------------------------------------------------------------------

import "./openzeppelin/SafeMath.sol";
import "./openzeppelin/ECRecovery.sol";
import "./openzeppelin/IERC20.sol";


/**
 * @title Mediator
 */
contract MediatorMockNoTime {

    using SafeMath for uint256;

    //
    // Events
    //

    event TokenRegistered(
        address indexed tokenAddress
    );

    event DepositCompleted(
        address indexed tokenAddress,
        address indexed clientAddress,
        uint256 amount
    );

    event WithdrawalInitiated(
        address indexed tokenAddress,
        address indexed clientAddress,
        uint256 amount
    );

    event WithdrawalConfirmed(
        address indexed tokenAddress,
        address indexed clientAddress,
        uint256 amount
    );

    event WithdrawalCancelled(
        address indexed tokenAddress,
        address indexed clientAddress,
        uint256 amount
    );

    event CommitCompleted(
        address indexed tokenAddress
    );

    event DisputeOpened(
        uint256 disputeId,
        address indexed clientAddress
    );

    event DisputeClosed(
        uint256 disputeId,
        address indexed clientAddress
    );

    event Halted();


    //
    // Structures
    //

    struct RootInfo {
        bytes32 content;
        uint256 height;
        uint256 width;
    }

    struct Proof {
        uint256 clientOpeningBalance;
        address tokenAddress;
        address clientAddress;
        bytes32[] hashes;
        uint256[] sums;
        uint256 height;
        uint256 width;
    }

    struct Approval {
        uint256 approvalId;
        uint256 round;
        uint256 buyAmount;
        address buyAsset;
        uint256 sellAmount;
        address sellAsset;
        bool intent; // true: buy, false: sell
        address instanceId;
    }

    struct Fill {
        uint256 fillId;
        uint256 approvalId;
        uint256 round;
        uint256 buyAmount;
        address buyAsset;
        uint256 sellAmount;
        address sellAsset;
        address clientAddress;
        address instanceId;
    }

    struct WithdrawalRequest {
        uint256 amount;
        uint256 openingBalance;
    }

    struct Dispute {
        uint256 disputeId;
        uint256[] openingBalances;
        uint256 fillCount;
        bool open;
    }

    struct AuthorizationMessage {
        uint256 round;
        address clientAddress;
        bytes sig;
    }


    //
    // Fields - General
    //

    // Address of the operator.
    address public operatorAddress;

    // Map of tokenAddress => clientAddress => deposit amount.
    mapping(address => mapping(address => uint256)) public clientDeposits;

    // Map of tokenAddress => deposit amount.
    mapping(address => uint256) public totalDeposits;

    // Map of tokenAddress => amount.
    mapping(address => uint256) public openingBalances;

    // Map of tokenAddress => total requested withdrawal amount.
    mapping(address => uint256) public totalRequestedWithdrawals;

    // Map of tokenAddress => clientAddress => requested withdrawal amount.
    mapping(address => mapping(address => WithdrawalRequest)) public clientRequestedWithdrawals;

    // Map of tokenAddress => clientAddress if withdrawal request was initiated.
    mapping(address => mapping(address => bool)) public activeWithdrawals;

    // Total number of commits.
    uint256 public commitCounter;

    // Map tokenAddress => commit root.
    mapping(address => bytes32) public commits;


    //
    // Fields - Tokens
    //

    // Number of tokens that have been registered.
    uint256 public tokenCount;

    // Map of tokens that have been registered.
    mapping(address => bool) public registeredTokens;

    // Map of tokenAddress => arrayIndex for array computations.
    mapping(address => uint256) public registeredTokensIndex;

    // Map of arrayIndex => tokenAddress.
    mapping(uint256 => address) public registeredTokensAddresses;


    //
    // Fields - Disputes
    //

    // Whether the contract is in HALTED mode or not.
    bool public halted;

    // Total number of disputes ever opened.
    uint256 public totalDisputes;

    // Number of open disputes.
    uint256 public openDisputeCounter;

    // Map of clientAddress => dispute info.
    mapping(address => Dispute) public disputes;

    // Map disputeId => fillId => fill, used for active disputes.
    mapping(uint256 => mapping(uint256 => Fill)) public disputeFills;

    // Map of tokenAddress => clientAddress => whether funds have been recovered.
    mapping(address => mapping(address => bool)) public recovered;


    //
    // Modifiers
    //

    modifier onlyBy(address _account)
    {
        require(msg.sender == _account);
        _;
    }

    modifier notHalted()
    {
        require(halted == false);
        _;
    }


    //
    // Constructor
    //

    /**
     * Constructor for the Mediator smart contract.
     * @param _operatorAddress address of the operator.
     */
    constructor(
        address _operatorAddress
    )
    public
    {
        require(_operatorAddress != address(0));

        operatorAddress = _operatorAddress;

        halted = false;
    }

    //
    // Public Functions
    //

    /**
     * Direct deposit of ether is not supported.
     * In order to deposit it is required to invoke depositTokens.
     */
    function()
    external
    payable
    {
        revert("Not supported");
    }

    function getDisputeOpeningBalance(address clientAddress) public view returns(uint256[] memory) {
        return disputes[clientAddress].openingBalances;
    }

    /**
     * Enables the operator to register a token.
     * @param tokenAddress address of the token to be registered.
     */
    function registerToken(address tokenAddress)
    public
    notHalted()
    onlyBy(operatorAddress)
    returns (bool)
    {
        require(tokenAddress != address(0));
        require(tokenAddress != address(this));

        if (registeredTokens[tokenAddress]) {
            return false;
        }

        registeredTokens[tokenAddress] = true;
        registeredTokensIndex[tokenAddress] = tokenCount;
        registeredTokensAddresses[tokenCount] = tokenAddress;

        tokenCount = tokenCount.add(1);

        emit TokenRegistered(tokenAddress);

        return true;
    }

    /**
     * Enables a client to deposit tokens.
     */
    function depositTokens(address tokenAddress, uint256 amount)
    public
    notHalted()
    returns (bool)
    {
        require(registeredTokens[tokenAddress]);
        require(amount > 0);

        address clientAddress = msg.sender;

        require(transferTokenFromClient(tokenAddress, clientAddress, amount));

        clientDeposits[tokenAddress][clientAddress] = clientDeposits[tokenAddress][clientAddress].add(amount);
        totalDeposits[tokenAddress] = totalDeposits[tokenAddress].add(amount);

        emit DepositCompleted(
            tokenAddress,
            clientAddress,
            amount
        );

        return true;
    }

    /**
    * Enables a client to initiate a withdrawal request.
    *  @param proof proof details.
    *  @param amount the amount the client wants to withdraw.
    */
    function initiateWithdrawal(
        Proof memory proof,
        uint256 amount
    )
    public
    notHalted()
    returns (bool)
    {
        require(amount > 0);

        // Client can only initiate withdrawal for themselves.
        address clientAddress = proof.clientAddress;
        require(clientAddress == msg.sender);

        // Checks that the proof is valid and that the client has funds.
        // This also checks that the token address in the proof is ok.
        require(isProofValid(proof));

        address tokenAddress = proof.tokenAddress;
        require(activeWithdrawals[tokenAddress][clientAddress] == false);  // Check that there is no existing pending withdrawal.
        require(amount <= proof.clientOpeningBalance);                     // Withdrawal amount needs to be <= that the current openingBalance.

        WithdrawalRequest storage requested = clientRequestedWithdrawals[tokenAddress][clientAddress];
        requested.amount = amount;
        requested.openingBalance = proof.clientOpeningBalance;

        totalRequestedWithdrawals[tokenAddress] = totalRequestedWithdrawals[tokenAddress].add(amount);
        activeWithdrawals[tokenAddress][clientAddress] = true;

        emit WithdrawalInitiated(
            tokenAddress,
            clientAddress,
            amount
        );

        return true;
    }

    /**
     * Enables a client to confirm a withdrawal after enough time has passed since
     * the withdrawal request.
     * @param tokenAddress the address of the token that needs to be withdrawn
     */
    function confirmWithdrawal(address tokenAddress)
    public
    returns (bool)
    {
        address clientAddress = msg.sender;

        activeWithdrawals[tokenAddress][clientAddress] = false;

        uint256 amount = clientRequestedWithdrawals[tokenAddress][clientAddress].amount;

        // Transfer the tokens back to the client.
        require(transferTokenToClient(tokenAddress, clientAddress, amount));

        emit WithdrawalConfirmed(
            tokenAddress,
            clientAddress,
            amount
        );

        return true;
    }

    /**
     * Enables the operator to cancel a withdrawal
     * @param approvals     approvals to sell asset by client
     * @param sigs          signatures of the approvals
     * @param tokenAddress  address of the token corresponding to the withdrawal
     * @param clientAddress address of the client who made the withdrawal request
     */
    function cancelWithdrawal(
        Approval[] memory approvals,
        bytes[] memory sigs,
        address tokenAddress,
        address clientAddress
    )
    public
    onlyBy(operatorAddress)
    notHalted()
    returns (bool)
    {
        require(approvals.length == sigs.length);

        WithdrawalRequest memory withdrawal = clientRequestedWithdrawals[tokenAddress][clientAddress];

        checkApprovalsAreUnique(approvals);

        // Check that approvals are valid
        for (uint256 i = 0; i < approvals.length; i++) {
            // Check single approval
            checkApprovalSig(approvals[i], sigs[i], clientAddress);
        }

        uint256 reserved = 0;
        for (uint256 i = 0; i < approvals.length; i++) {
            Approval memory approval = approvals[i];
            if (approval.sellAsset == tokenAddress) {
                reserved = reserved.add(approval.sellAmount);
            }
        }
        uint256 requested = withdrawal.amount;
        uint256 available = withdrawal.openingBalance.sub(reserved);

        require(requested > available); // Not overwithdrawing so abort cancelWithdrawal.

        // Cancel the withdrawal
        clientRequestedWithdrawals[tokenAddress][clientAddress].amount = 0;
        totalRequestedWithdrawals[tokenAddress] = totalRequestedWithdrawals[tokenAddress].sub(requested);

        activeWithdrawals[tokenAddress][clientAddress] = false;

        emit WithdrawalCancelled(
            tokenAddress,
            clientAddress,
            requested
        );

        return true;
    }

    /**
     * Enables the operator to commit a new root for the current round
     * @param rootInfo contains the root content before padding, the height and width of the tree
     * @param tokenAddress type of token used
     */
    function commit(
        RootInfo memory rootInfo,
        address tokenAddress
    )
    public
    onlyBy(operatorAddress)
    notHalted()
    returns (bool)
    {
        require(registeredTokens[tokenAddress]);            // The token must be registered.

        uint256 openingBalance   = openingBalances[tokenAddress];
        uint256 deposits         = totalDeposits[tokenAddress];
        uint256 withdrawals      = totalRequestedWithdrawals[tokenAddress];
        uint256 closingBalance   = openingBalance.add(deposits).sub(withdrawals);

        bytes32 rootBeforePadding = keccak256(abi.encodePacked(rootInfo.content, closingBalance));
        bytes32 root = keccak256(abi.encodePacked(rootBeforePadding, rootInfo.height, rootInfo.width));

        openingBalances[tokenAddress] = closingBalance;
        commits[tokenAddress] = root;
        commitCounter = commitCounter.add(1);

        emit CommitCompleted(
            tokenAddress
        );

        return true;
    }

    /**
     * Enables a client to open a dispute
     * @param proofs proofs for each asset
     * @param fills  array of fills
     * @param sigs   array containing the signatures of the fills
     * @param authorizationMessage signed messaged by the OperatorBlockchain
     */
    function openDispute(
        Proof[] memory proofs,
        Fill[] memory fills,
        bytes[] memory sigs,
        AuthorizationMessage memory authorizationMessage
    )
    public
    notHalted()
    returns (bool)
    {
        require(fills.length == sigs.length);

        address clientAddress = msg.sender;

        if (disputes[clientAddress].open) {
            return false;
        }

        uint256[] memory openingBalancesClient = new uint256[](tokenCount);

        if (proofs.length > 0) {
            require(isProofArrayValid(proofs, clientAddress));

            for (uint256 i = 0; i < proofs.length; i++) {
                openingBalancesClient[i] = proofs[i].clientOpeningBalance;
            }
        } else {
            require(verifyAuthorizationMessage(clientAddress, authorizationMessage));
        }

        uint256 disputeId = totalDisputes.add(1);

        if (fills.length > 0) {
            for (uint256 i = 0; i < fills.length; i++) {
                require(fills[i].clientAddress == clientAddress/*, "The fill must be assigned to the client."*/);

                checkFillSig(fills[i], sigs[i]);

                // Put the fill in storage
                disputeFills[disputeId][fills[i].fillId] = fills[i];
            }

            // Check if all fills are ordered and unique.
            for (uint256 i = 0; i < fills.length - 1; i++) {
                require(fills[i].fillId < fills[i + 1].fillId);
            }
        }

        disputes[clientAddress] = Dispute(
            disputeId,
            openingBalancesClient,
            fills.length,
            true
        );

        totalDisputes = disputeId;

        openDisputeCounter = openDisputeCounter.add(1);

        emit DisputeOpened(disputeId, clientAddress);

        return true;
    }

    /**
     * Enables the OperatorBlockchain to close a dispute.
     * @param proofs        proofs of balances for each asset for the dispute round.
     * @param approvals     list of approvals generated during the round previous to the dispute.
     * @param sigApprovals  signatures on the approvals by the Client.
     * @param fills         fills produced by the OperatorBlockchain based on the approvals
     * @param sigFills      signatures of the fills
     * @param clientAddress address of the Client
     */
    function closeDispute(
        Proof[] memory proofs,
        Approval[] memory approvals,
        bytes[] memory sigApprovals,
        Fill[] memory fills,
        bytes[] memory sigFills,
        address clientAddress
    )
    public
    notHalted()
    onlyBy(operatorAddress)
    {
        Dispute storage dispute = disputes[clientAddress];

        require(dispute.open);

        // Check the proofs
        require(isProofArrayValid(proofs, clientAddress));

        // Check that all fills are unique.
        if (fills.length > 1) {
            for (uint256 i = 0; i < fills.length - 1; i++) {
                require(fills[i].fillId < fills[i + 1].fillId);
            }
        }

        // Check all the fills of dispute are included.
        uint256 fillCount = 0;
        for (uint256 i = 0; i < fills.length; i++) {
            if (areFillsEqual(fills[i], disputeFills[dispute.disputeId][fills[i].fillId])) {
                fillCount += 1;
            }
        }
        require(fillCount == dispute.fillCount);

        // Check that all the approvals are valid.
        for (uint256 i = 0; i < approvals.length; i++) {
            checkApprovalSig(approvals[i], sigApprovals[i], clientAddress);
        }

        // Check that all the fills are valid
        for (uint256 i = 0; i < fills.length; i++) {
            checkFillSig(fills[i], sigFills[i]);
            require(fills[i].clientAddress == clientAddress);
        }

        checkFillWithApproval(approvals, fills);

        uint256[] memory changes = computeBalanceChangePerApproval(approvals, fills);
        checkAllFillsCovered(approvals, changes);

        compareBalancesDispute(
            fills,
            clientAddress,
            proofs
        );

        // Close the dispute
        dispute.open = false;
        openDisputeCounter = openDisputeCounter.sub(1);

        emit DisputeClosed(
            dispute.disputeId,
            clientAddress
        );
    }

    /**
     * Enables a client to recover all his funds using a proof from round r-2.
     * Only works when the contract is halted.
     * @param proof proof of the client for round r-2
     */
    function recoverAllFunds(Proof memory proof)
    public
    returns (bool)
    {
        require(halted/*, "The contract must be halted."*/);
        address clientAddress = msg.sender;
        address tokenAddress = proof.tokenAddress;

        require(proof.clientAddress == clientAddress/*, "The proof does not belongs to the client."*/);

        require(!(recovered[tokenAddress][clientAddress])/*, "The client has already recovered her funds."*/);

        bool proofOk = isProofValid(proof);

        require(proofOk);

        uint256 fundsToRecover = clientDeposits[tokenAddress][clientAddress];

        recovered[tokenAddress][clientAddress] = true;

        require(transferTokenToClient(tokenAddress, clientAddress, fundsToRecover));

        return true;
    }

    /**
     * Enables a client to recover his funds on chain
     * @param tokenAddress address of the token corresponding to the recovery
     */
    function recoverOnChainFundsOnly(address tokenAddress)
    public
    returns (bool)
    {
        require(halted/*, "The contract must be halted."*/);
        address clientAddress = msg.sender;

        require(!(recovered[tokenAddress][clientAddress])/*, "The client has already recovered her funds."*/);

        uint256 fundsToRecover = clientDeposits[tokenAddress][clientAddress];

        recovered[tokenAddress][clientAddress] = true;

        require(transferTokenToClient(tokenAddress, clientAddress, fundsToRecover));

        return true;
    }

    /**
     * Updates the halted state
     */
    function setHaltedState(bool value)
    public
    returns (bool)
    {
        halted = value;
        emit Halted();
    }

    /**
     * Updates the halted state
     */
    function updateHaltedState()
    public
    returns (bool)
    {
        if (halted) {
            return false;
        }

        bool hasOpenDisputes = openDisputeCounter > 0;
        bool hasTokensRegistered = (tokenCount > 0);

        if (!hasTokensRegistered || hasOpenDisputes) {
            halted = true;

            emit Halted();

            return true;
        }

        return false;
    }

    //
    // Utility Functions
    //


    function isProofValidBatch(
        Proof[] memory proofs
    )
    public
    view
    returns (bool)
    {
        for (uint256 i = 0; i < proofs.length; i++) {
            require(isProofValid(proofs[i]));
        }

        return true;
    }

    /**
     * Validates a merkle proof for a user corresponding to the root
     *  committed during the current round
     * @param proof proof to check against the root of the tree
     */
    function isProofValid(
        Proof memory proof
    )
    public
    view
    returns (bool)
    {
        bytes32 root = commits[proof.tokenAddress];

        // The root must have been initialized
        if (root == 0) {
            return false;
        }

        // We need to check that the clientAddress and clientOpeningBalance correspond to the leaf
        // for which we want to validate a merkle path to the root
        bytes32 leaf = keccak256(abi.encodePacked(proof.clientOpeningBalance, proof.clientAddress));

        // Validate the proof against the current committed root
        return isMerkleProofValid(
            proof.hashes,
            proof.sums,
            root,
            leaf,
            proof.clientOpeningBalance,
            proof.height,
            proof.width
        );
    }

    /**
     * Verifies a Merkle proof proving the existence of a leaf in a Merkle tree. Assumes that each pair of leaves
     * and each pair of pre-images are sorted.
       * The merkle proof part of the verification is based on
       *  https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/cryptography/MerkleProof.sol
       * @param hashes Merkle proof containing sibling hashes on the branch from the leaf to the root of the Merkle tree
       * @param root Merkle root
       * @param leaf Leaf of Merkle tree
       * @param sum balance for the leaf we want to check
       * @param height height of the tree
       * @param width width of the tree
     */
    function isMerkleProofValid(
        bytes32[] memory hashes,
        uint256[] memory sums,
        bytes32 root,
        bytes32 leaf,
        uint256 sum,
        uint256 height,
        uint256 width
    )
    public
    pure
    returns (bool)
    {
        bytes32 computedHash = leaf;
        uint256 computedSum = sum;

        for (uint256 i = 0; i < hashes.length; i++) {
            bytes32 proofElement = hashes[i];
            computedSum = computedSum.add(sums[i]);

            if (computedHash < proofElement) {
                // Hash(current computed hash + current element of the proof)
                computedHash = keccak256(abi.encodePacked(computedSum, computedHash, proofElement));
            } else {
                // Hash(current element of the proof + current computed hash)
                computedHash = keccak256(abi.encodePacked(computedSum, proofElement, computedHash));
            }
        }

        computedHash = keccak256(abi.encodePacked(computedHash, computedSum));
        computedHash = keccak256(abi.encodePacked(computedHash, height, width));

        // Check if the computed hash (root) is equal to the provided root
        return computedHash == root;
    }

    /**
     * Validates an authorization message
     * @param clientAddress address of the client
     * @param authorization signature of message "clientAddress" by OperatorBlockchain
     */
    function verifyAuthorizationMessage(
        address clientAddress,
        AuthorizationMessage memory authorization
    )
    public
    view
    returns (bool)
    {
        if (authorization.clientAddress != clientAddress) {
            return false;
        }

        bytes32 hash = keccak256(
            abi.encodePacked(
                authorization.clientAddress,
                authorization.round
            )
        );

        bytes32 normalizedHash = ECRecovery.toEthSignedMessageHash(hash);

        address signerAddress = ECRecovery.recover(normalizedHash, authorization.sig);

        return (signerAddress == operatorAddress);
    }

    function checkApprovalSigBatch(
        Approval[] memory approvals,
        bytes[] memory sigs,
        address[] memory clientAddresses
    )
    public
    view
    returns (bool)
    {
        for (uint256 i = 0; i < approvals.length; i++) {
            require(checkApprovalSig(approvals[i], sigs[i], clientAddresses[i]));
        }

        return true;
    }

    /**
     * Validates a signature on an approval and that
     * the instance of the approval is correct
     * @param approval the approval signed by the Client
     * @param sig the signature on the approval
     * @param clientAddress the address of the Client
     */
    function checkApprovalSig(
        Approval memory approval,
        bytes memory sig,
        address clientAddress
    )
    public
    view
    returns (bool)
    {
        // InstanceId should match the mediator contract address.
        require(approval.instanceId == address(this));

        // Check the signature
        bytes32 hash = keccak256(
            abi.encodePacked(
                approval.approvalId,
                approval.round,
                approval.buyAmount,
                approval.buyAsset,
                approval.sellAmount,
                approval.sellAsset,
                approval.intent,
                approval.instanceId
            )
        );

        bytes32 normalizedHash = ECRecovery.toEthSignedMessageHash(hash);
        address signerAddress = ECRecovery.recover(normalizedHash, sig);

        // Check that we recovered the correct address from the signature.
        require(signerAddress == clientAddress);

        return true;
    }

    function checkFillSigBatch(
        Fill[] memory fills,
        bytes[] memory sigs
    )
    public
    view
    returns (bool)
    {
        for (uint256 i = 0; i < fills.length; i++) {
            require(checkFillSig(fills[i], sigs[i]));
        }

        return true;
    }

    /**
     * Validates a fill (signature and instance identifier)
     * @param fill the approval signed by the OperatorBlockchain
     * @param sig the signature on the fill
     */
    function checkFillSig(
        Fill memory fill,
        bytes memory sig
    )
    public
    view
    returns (bool)
    {
        // Instance identifier
        require(fill.instanceId == address(this)/*, "Fill instance identifier is invalid."*/);

        // Signature
        bytes32 hash = keccak256(
            abi.encodePacked(
                fill.fillId,
                fill.approvalId,
                fill.round,
                fill.buyAmount,
                fill.buyAsset,
                fill.sellAmount,
                fill.sellAsset,
                fill.clientAddress,
                fill.instanceId
            )
        );

        bytes32 normalizedHash = ECRecovery.toEthSignedMessageHash(hash);

        address signerAddress = ECRecovery.recover(normalizedHash, sig);

        require(signerAddress == operatorAddress);

        return true;
    }

    /**
    * Computes the balances induced by the fills.
    * @param fills list of fills
    * @return array of balances
    */
    function computeBalancesInducedByFills(Fill[] memory fills)
    public
    view
    returns (int256[] memory)
    {
        int256[] memory balances = new int256[](tokenCount);

        for (uint256 i = 0; i < fills.length ; i++) {
            balances[registeredTokensIndex[fills[i].buyAsset]] += int256(fills[i].buyAmount);
            balances[registeredTokensIndex[fills[i].sellAsset]] -= int256(fills[i].sellAmount);
        }

        return balances;
    }

    /**
     * Check that the expected balances from the dispute match the current balances
     */
    function compareBalancesDispute(
        Fill[] memory fills,
        address clientAddress,
        Proof[] memory proofs
    )
    public
    view
    returns (bool)
    {
        int256[] memory fillsInducedBalances = computeBalancesInducedByFills(fills);
        uint256[] memory openingBalancesBeforeDispute = disputes[clientAddress].openingBalances;

        for (uint256 i = 0; i < tokenCount; i++) {
            address tokenAddress = registeredTokensAddresses[i];

            // Check if there is a withdrawal
            uint256 withdrawalAmount = 0;
            if (activeWithdrawals[tokenAddress][clientAddress]) {
                withdrawalAmount = clientRequestedWithdrawals[tokenAddress][clientAddress].amount;
            }

            uint256 depositAmount = clientDeposits[tokenAddress][clientAddress];

            uint256 expectedBalance;

            // Need to make the conversion from int256 to uint256 before adding/subtracting
            if (fillsInducedBalances[i] >= 0) {
                expectedBalance = openingBalancesBeforeDispute[i].add(uint256(fillsInducedBalances[i]));
            } else {
                expectedBalance = openingBalancesBeforeDispute[i].sub(uint256(-fillsInducedBalances[i]));
            }

            expectedBalance = expectedBalance.sub(withdrawalAmount);
            expectedBalance = expectedBalance.add(depositAmount);

            //uint256 newOpeningBalance = proofs[i].clientOpeningBalance;
            //require(newOpeningBalance == expectedBalance/*, "New and expected opening balances differs."*/);
        }

        return true;
    }

    /**
     * Checks if a proof array contains proofs.
     * @param proofs the proof vector to be tested.
     */
    function containsProofs(Proof[] memory proofs)
    public
    pure
    returns (bool)
    {
        address nullAddress = address(0);

        for (uint256 i = 0; i < proofs.length; i++) {
            Proof memory proof = proofs[i];

            if (
                proof.clientOpeningBalance != 0 ||
                proof.tokenAddress != nullAddress ||
                proof.clientAddress != nullAddress
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Checks if two fills contain the same values
     * @param fill1 first fill
     * @param fill2 second fill
     * @return true iff both fills contain the same values
     */
    function areFillsEqual(Fill memory fill1, Fill memory fill2)
    public
    pure
    returns (bool)
    {
        return (
            fill1.fillId == fill2.fillId &&
            fill1.approvalId == fill2.approvalId &&
            fill1.buyAmount == fill2.buyAmount &&
            fill1.buyAsset == fill2.buyAsset &&
            fill1.sellAmount == fill2.sellAmount &&
            fill1.sellAsset == fill2.sellAsset &&
            fill1.clientAddress == fill2.clientAddress
        );
    }

    /**
     * Check that all the approvals in the list are unique
     * by comparing the Ids.
     * @param approvals list of approvals
     */
    function checkApprovalsAreUnique(Approval[] memory approvals)
    public
    pure
    returns (bool)
    {
        if (approvals.length <= 1) {
            return true;
        }

        for (uint256 i = 0; i < approvals.length - 1; i++) {
            require(approvals[i].approvalId < approvals[i + 1].approvalId);
        }

        return true;
    }

    /**
     * @param fills list of approvals
     * @param approvals list of approvals
     * Note: must have same length.
     */
    function checkFillWithApproval(
        Approval[] memory approvals,
        Fill[] memory fills
    )
    public
    pure
    returns (bool)
    {
        require(fills.length == approvals.length/*, "Number of items in arrays differs."*/);

        // Check the relation between each approval and fill
        for (uint256 i = 0; i < approvals.length; i++) {
            Approval memory approval = approvals[i];
            Fill memory fill = fills[i];

            require(fill.approvalId == approval.approvalId/*, "Approval Ids differ."*/);
            require(fill.buyAsset == approval.buyAsset/*, "Assets for buying do not match."*/);
            require(fill.sellAsset == approval.sellAsset/*, "Assets for selling do not match."*/);

            // Avoid division by zero if buyAmount == 0 which could be a legitimate value,
            // for instance if the approval is used to pay a fee.

            // No price restriction.
            if (approval.buyAmount == 0) {
                continue;
            }

            // If the approval buyAmount is non-zero the fill buyAmount must be non-zero too.
            require(fill.buyAmount > 0/*, "Approval does not allow zero buy amount."*/);

            // Safe to divide now. Make sure fill price does not exceed approval price.
            require((fill.sellAmount * approval.buyAmount) <= (approval.sellAmount * (fill.buyAmount)));
        }

        return true;
    }

    /* Note the approvals and fills need to be sorted in approvalId  */
    function computeBalanceChangePerApproval(
        Approval[] memory approvals,
        Fill[] memory fills
    )
    public
    pure
    returns (uint256[] memory)
    {
        // Find the number of distinct approvals so that we can allocate the 'changes' array.
        uint256 nApprovals = 0;
        if (approvals.length <= 1) {
            nApprovals = approvals.length;
        } else {
            nApprovals = 1;
            for (uint256 i = 1; i < approvals.length; i++) {
                if (approvals[i - 1].approvalId != approvals[i].approvalId) {
                    nApprovals += 1;
                }
            }
        }

        uint256[] memory changes = new uint256[](nApprovals);

        if (fills.length == 0) {
            return changes;
        }

        uint256 lastId = approvals[0].approvalId;
        uint256 changeIndex = 0;

        for (uint256 i = 0; i < fills.length; i++) {
            Approval memory approval = approvals[i];

            // Go to the next approval in the changes array.
            if (approval.approvalId != lastId) {
                changeIndex += 1;
                lastId = approval.approvalId;
            }

            uint256 amount = approval.intent ? fills[i].buyAmount : fills[i].sellAmount;
            changes[changeIndex] = changes[changeIndex].add(amount);
        }

        return changes;
    }

    /* Note the approvals and changes need to be sorted in approvalId  */
    function checkAllFillsCovered(
        Approval[] memory approvals,
        uint256[] memory changes
    )
    public
    pure
    returns (bool)
    {
        if (approvals.length == 0) {
            return false;
        }

        uint256 checkId = approvals[0].approvalId;
        uint256 changeIndex = 0;

        for (uint256 i = 0; i < approvals.length; i++) {
            Approval memory approval = approvals[i];

            // Go to the next approval in the changes array.
            if (approval.approvalId != checkId) {
                changeIndex += 1;
                checkId = approval.approvalId;
            }

            uint256 change = changes[changeIndex];

            if (approval.intent) {
                require(change <= approval.buyAmount/*, "Bought more than approved amount."*/);
            } else {
                require(change <= approval.sellAmount/*, "Sold more than approved amount."*/);
            }
        }

        return true;
    }

    /**
     * Checks that the token addresses of a proof array are listed in the
     * correct order and only once. Also that the client addresses and
     * the proofs themselves are valid.
     * @param proofs Array of proofs.
     */
    function isProofArrayValid(Proof[] memory proofs, address clientAddress)
    public
    view
    returns (bool)
    {
        if (proofs.length != tokenCount) {
            return false;
        }

        for (uint256 i = 0; i < proofs.length; i++) {
            if (proofs[i].tokenAddress != registeredTokensAddresses[i]) {
                return false;
            }

            if (proofs[i].clientAddress != clientAddress) {
                return false;
            }

            if (isProofValid(proofs[i]) != true) {
                return false;
            }
        }

        return true;
    }

    //
    // Private Functions
    //

    /**
     * Transfer tokens from the client's address to this contract
     * @param tokenAddress the type of token to use
     * @param amount the amount to be transferred
     * @param clientAddress the address of the recipient of the transfer
     */
    function transferTokenFromClient(address tokenAddress, address clientAddress, uint256 amount)
    private
    returns (bool)
    {
        return IERC20(tokenAddress).transferFrom(clientAddress, address(this), amount);
    }

    /**
     * Send tokens from this contract to a client
     * @param tokenAddress the type of token to use
     * @param amount the amount to be transferred
     * @param clientAddress the address of the recipient of the transfer
     */
    function transferTokenToClient(address tokenAddress, address clientAddress, uint256 amount)
    private
    returns (bool)
    {
        return IERC20(tokenAddress).transfer(clientAddress, amount);
    }
}
