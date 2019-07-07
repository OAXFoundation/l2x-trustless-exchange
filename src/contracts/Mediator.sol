pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2; // solium-disable-line no-experimental

// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import "./openzeppelin/SafeMath.sol";
import "./openzeppelin/ECRecovery.sol";
import "./openzeppelin/IERC20.sol";


/**
 * @title Mediator
 */
contract Mediator {

    using SafeMath for uint256;

    //
    // Events
    //

    event TokenRegistered(
        address tokenAddress
    );

    event DepositCompleted(
        uint256 round,
        address indexed tokenAddress,
        address indexed clientAddress,
        uint256 amount
    );

    event WithdrawalInitiated(
        uint256 round,
        address indexed tokenAddress,
        address indexed clientAddress,
        uint256 amount
    );

    event WithdrawalConfirmed(
        uint256 round,
        address indexed tokenAddress,
        address indexed clientAddress,
        uint256 amount
    );

    event WithdrawalCancelled(
        uint256 round,
        address indexed tokenAddress,
        address indexed clientAddress,
        uint256 amount
    );

    event CommitCompleted(
        uint256 round,
        address indexed tokenAddress
    );

    event DisputeOpened(
        uint256 disputeId,
        uint256 round,
        address indexed clientAddress
    );

    event DisputeClosed(
        uint256 disputeId,
        uint256 round,
        address indexed clientAddress
    );

    event Halted(
        uint256 round,
        uint256 quarter
    );


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
        uint256 round;
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
        uint256 quarter;
        uint256 round;
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

    // Number of blocks inside a round.
    uint256 public roundSize;

    // Number of blocks inside a quarter.
    uint256 public quarterSize;

    // Block number of when the mediator contract was initially deployed.
    uint256 public blockNumberAtCreation;

    // Map of round => tokenAddress => clientAddress => deposit amount.
    mapping(uint256 => mapping(address => mapping(address => uint256))) public clientDeposits;

    // Map of round => tokenAddress => deposit amount.
    mapping(uint256 => mapping(address => uint256)) public totalDeposits;

    // Map of round => tokenAddress => amount.
    mapping(uint256 => mapping(address => uint256)) public openingBalances;

    // Map of round => tokenAddress => total requested withdrawal amount.
    mapping(uint256 => mapping (address => uint256)) public totalRequestedWithdrawals;

    // Map of round => tokenAddress => clientAddress => requested withdrawal amount.
    mapping(uint256 => mapping(address => mapping (address => WithdrawalRequest))) public clientRequestedWithdrawals;

    // Map of tokenAddress => clientAddress => round when withdrawal request was initiated.
    mapping(address => mapping(address => uint256)) public activeWithdrawalRounds;

    // Keeps count of the number of fully committed rounds. A round is fully
    // committed if all assets in the round have been successfully committed.
    uint256 public committedRounds;

    // Map of round => total number of commits.
    mapping(uint256 => uint256) public commitCounters;

    // Map of round => tokenAddress => commit root.
    mapping(uint256 => mapping(address => bytes32)) public commits;


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

    // Round number when the Mediator entered HALTED mode.
    uint256 public haltedRound;

    // Quarter number when the Mediator entered HALTED mode.
    uint256 public haltedQuarter;

    // Total number of disputes ever opened.
    uint256 public totalDisputes;

    // Map of round => number of open disputes.
    mapping(uint256 => uint256) public openDisputeCounters;

    // Map of clientAddress => dispute info.
    mapping(address => Dispute) public disputes;

    // Map disputeId => fillId => fill, used for active disputes.
    mapping(uint256 => mapping(uint256 => Fill)) public disputeFills;

    // Map disputeId => approvalId => bool, used to check approvals for duplicates.
    mapping(uint256 => mapping(uint256 => bool)) public disputeApprovals;

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
        updateHaltedState();
        require(halted == false);
        _;
    }


    //
    // Constructor
    //

    /**
     * Constructor for the Mediator smart contract.
     * @param _roundSize       Number of blocks corresponding to one round.
     * @param _operatorAddress Address of the operator.
     */
    constructor(
        uint256 _roundSize,
        address _operatorAddress
    )
    public
    {
        require(_roundSize > 0);
        require(_roundSize % 4 == 0);
        require(_operatorAddress != address(0));

        roundSize = _roundSize;
        quarterSize = roundSize / 4;
        operatorAddress = _operatorAddress;
        blockNumberAtCreation = getCurrentBlockNumber();

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

    /**
     * Enables the operator to register a token.
     * @dev   Make sure that the token has been properly audited and
     *        can be trusted before adding it.
     * @param tokenAddress Address of the token to be registered.
     */
    function registerToken(address tokenAddress)
    public
    notHalted()
    onlyBy(operatorAddress)
    returns (bool)
    {
        require(tokenAddress != address(0));
        require(tokenAddress != address(this));

        // It is only possible to register tokens during round 0, quarter 0
        require(getCurrentRound() == 0 && getCurrentQuarter() == 0);

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
     * @dev   The token must have been registered and must have approval for
     *        the specified amount before calling depositToken.
     * @param tokenAddress Address of the token.
     * @param amount       Amount of tokens to deposit.
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

        uint256 currentRound = getCurrentRound();
        clientDeposits[currentRound][tokenAddress][clientAddress] = clientDeposits[currentRound][tokenAddress][clientAddress].add(amount);
        totalDeposits[currentRound][tokenAddress] = totalDeposits[currentRound][tokenAddress].add(amount);

        emit DepositCompleted(
            currentRound,
            tokenAddress,
            clientAddress,
            amount
        );

        return true;
    }

    /**
    * Enables a client to initiate a withdrawal request.
    * @param proof  A balance proof for the current last committed round.
    * @param amount Amount the client wants to withdraw.
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

        // Make sure we are at round > 0 to initiate any withdrawal.
        uint256 currentRound = getCurrentRound();
        require(currentRound > 0);

        // Client can only initiate withdrawal for themselves.
        address clientAddress = proof.clientAddress;
        require(clientAddress == msg.sender);

        // Checks that the proof is valid and that the client has funds.
        // This also checks that the token address in the proof is ok.
        require(isProofValid(proof, currentRound - 1));

        address tokenAddress = proof.tokenAddress;
        require(activeWithdrawalRounds[tokenAddress][clientAddress] == 0);  // Check that there is no existing pending withdrawal.
        require(amount <= proof.clientOpeningBalance);                      // Withdrawal amount needs to be <= that the current openingBalance.

        WithdrawalRequest storage requested = clientRequestedWithdrawals[currentRound][tokenAddress][clientAddress];
        requested.amount = amount;
        requested.openingBalance = proof.clientOpeningBalance;

        totalRequestedWithdrawals[currentRound][tokenAddress] = totalRequestedWithdrawals[currentRound][tokenAddress].add(amount);
        activeWithdrawalRounds[tokenAddress][clientAddress] = currentRound;

        emit WithdrawalInitiated(
            currentRound,
            tokenAddress,
            clientAddress,
            amount
        );

        return true;
    }

    /**
     * Enables a client to confirm a withdrawal after enough time has passed since
     * the withdrawal request.
     * @param tokenAddress Address of the token to be withdrawn.
     */
    function confirmWithdrawal(address tokenAddress)
    public
    returns (bool)
    {
        // We need to check whether we are in HALTED mode or not.
        updateHaltedState();

        address clientAddress = msg.sender;
        uint256 roundOfRequest = activeWithdrawalRounds[tokenAddress][clientAddress];
        require(roundOfRequest > 0);

        uint256 currentRound = getCurrentRound();
        uint256 currentQuarter = getCurrentQuarter();

        uint256 lastConfirmedRoundForWithdrawals;
        if (currentQuarter == 0 || halted) {
            lastConfirmedRoundForWithdrawals = currentRound.sub(3);
        } else {
            lastConfirmedRoundForWithdrawals = currentRound.sub(2);
        }

        require(roundOfRequest <= lastConfirmedRoundForWithdrawals); // Too early to claim funds.
        activeWithdrawalRounds[tokenAddress][clientAddress] = 0;

        uint256 amount = clientRequestedWithdrawals[roundOfRequest][tokenAddress][clientAddress].amount;

        // Transfer the tokens back to the client.
        require(transferTokenToClient(tokenAddress, clientAddress, amount));

        emit WithdrawalConfirmed(
            currentRound,
            tokenAddress,
            clientAddress,
            amount
        );

        return true;
    }

    /**
     * Enables the operator to cancel a withdrawal.
     * @param approvals     Approvals to sell asset by client.
     * @param sigs          Signatures for the approvals.
     * @param tokenAddress  Address of the token corresponding to the withdrawal.
     * @param clientAddress Address of the client who made the withdrawal request.
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

        uint256 roundOfRequest = activeWithdrawalRounds[tokenAddress][clientAddress];
        require(roundOfRequest > 0);

        uint256 currentRound = getCurrentRound();
        require(canCancelWithdrawal(currentRound, roundOfRequest, tokenAddress));

        WithdrawalRequest memory withdrawal = clientRequestedWithdrawals[roundOfRequest][tokenAddress][clientAddress];

        if (approvals.length > 1) {
            for (uint256 i = 0; i < approvals.length - 1; i++) {
                require(approvals[i].approvalId < approvals[i + 1].approvalId);
            }
        }

        // Check that approvals are valid
        uint256 roundOfProof = roundOfRequest.sub(1);
        for (uint256 i = 0; i < approvals.length; i++) {
            // Check round
            require(approvals[i].round == roundOfProof || approvals[i].round == roundOfRequest);

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
        clientRequestedWithdrawals[roundOfRequest][tokenAddress][clientAddress].amount = 0;
        totalRequestedWithdrawals[roundOfRequest][tokenAddress] = totalRequestedWithdrawals[roundOfRequest][tokenAddress].sub(requested);

        activeWithdrawalRounds[tokenAddress][clientAddress] = 0;

        emit WithdrawalCancelled(
            currentRound,
            tokenAddress,
            clientAddress,
            requested
        );

        return true;
    }

    /**
     * Enables the operator to commit a new root for the current round.
     * @param rootInfo     Contains the root content before padding along with the height and width of the tree.
     * @param tokenAddress Address of the token for this commit.
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
        uint256 currentRound = getCurrentRound();
        require(currentRound > 0);                          // Committing a new root is not allowed at round 0.

        uint256 currentQuarter = getCurrentQuarter();
        require(currentQuarter == 0);                       // Committing is only allowed during quarter 0.

        require(registeredTokens[tokenAddress]);            // The token must be registered.
        require(commits[currentRound][tokenAddress] == ""); // Make sure nothing has been committed for this round.

        uint256 previousRound            = currentRound.sub(1);
        uint256 previousOpeningBalance   = openingBalances[previousRound][tokenAddress];
        uint256 previousTotalDeposits    = totalDeposits[previousRound][tokenAddress];
        uint256 previousTotalWithdrawals = totalRequestedWithdrawals[previousRound][tokenAddress];
        uint256 previousClosingBalance   = previousOpeningBalance.add(previousTotalDeposits).sub(previousTotalWithdrawals);

        bytes32 rootBeforePadding = keccak256(abi.encodePacked(rootInfo.content, previousClosingBalance));
        bytes32 root = keccak256(abi.encodePacked(rootBeforePadding, rootInfo.height, rootInfo.width));

        openingBalances[currentRound][tokenAddress] = previousClosingBalance;
        commits[currentRound][tokenAddress] = root;
        commitCounters[currentRound] = commitCounters[currentRound].add(1);

        if (commitCounters[currentRound] == tokenCount) {
            // Operator has satisfied all commit requirements for this round.
            committedRounds = committedRounds.add(1);
        }

        emit CommitCompleted(
            currentRound,
            tokenAddress
        );

        return true;
    }

    /**
     * Enables a client to open a dispute.
     * @param proofs Proofs for each asset.
     * @param fills  Array of fills.
     * @param sigs   Array containing the signatures of the fills.
     * @param authorizationMessage Signed message from the operator.
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

        uint256 currentRound = getCurrentRound();
        uint256 currentQuarter = getCurrentQuarter();

        require(currentRound > 0 /* The client must not be allowed to open a dispute during round 0 */);

        uint256[] memory openingBalancesClient = new uint256[](tokenCount);

        if (proofs.length > 0) {
            require(isProofArrayValid(proofs, clientAddress, currentRound - 1));

            for (uint256 i = 0; i < proofs.length; i++) {
                openingBalancesClient[i] = proofs[i].clientOpeningBalance;
            }
        } else {
            require(verifyAuthorizationMessage(clientAddress, authorizationMessage));
        }

        uint256 disputeId = totalDisputes.add(1);

        if (fills.length > 0) {
            for (uint256 i = 0; i < fills.length; i++) {
                require(fills[i].round == currentRound - 1);
                require(fills[i].clientAddress == clientAddress/*, "The fill must be assigned to the client."*/);

                checkFillSig(fills[i], sigs[i]);

                // Put the fill in storage as it will be needed by closeDispute.
                disputeFills[disputeId][fills[i].fillId] = fills[i];
            }

            // Check if all fills are ordered and unique.
            for (uint256 i = 0; i < fills.length - 1; i++) {
                require(fills[i].fillId < fills[i + 1].fillId);
            }
        }

        disputes[clientAddress] = Dispute(
            disputeId,
            currentQuarter,
            currentRound,
            openingBalancesClient,
            fills.length,
            true
        );

        totalDisputes = disputeId;

        openDisputeCounters[currentRound] = openDisputeCounters[currentRound].add(1);

        emit DisputeOpened(disputeId, currentRound, clientAddress);

        return true;
    }

    /**
     * Checks whether the dispute needs to be handled by the operator.
     * @dev                 This code was extracted from closeDispute to reduce compiler stack size.
     * @param dispute       Dispute object from storage.
     * @param currentRound  Current round.
     */
    function hasValidOpenDispute(Dispute memory dispute, uint256 currentRound) public view returns (bool) {
        require(dispute.open);

        // Check it is the right moment to close the dispute
        uint256 currentQuarter = getCurrentQuarter();
        uint256 elapsedQuarters = (4 * currentRound + currentQuarter) - (4 * dispute.round + dispute.quarter);
        require(elapsedQuarters <= 1/*, "Deadline to close dispute expired."*/);

        return true;
    }

    /**
     * Enables the operator to close a dispute.
     * @param proofs        Proofs of balances for each asset for the dispute round.
     * @param approvals     Array of approvals generated during the round previous to the dispute.
     * @param sigApprovals  Signatures on the approvals by the client.
     * @param fills         Fills produced by the operator based on the approvals.
     * @param sigFills      Signatures for the fills.
     * @param clientAddress Address of the client that opened the dispute.
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
        uint256 currentRound = getCurrentRound();
        Dispute storage dispute = disputes[clientAddress];

        require(hasValidOpenDispute(dispute, currentRound));

        // Check the proofs
        require(isProofArrayValid(proofs, clientAddress, dispute.round));

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
        uint256 disputedRound = dispute.round.sub(1);
        for (uint256 i = 0; i < approvals.length; i++) {
            checkApprovalSig(approvals[i], sigApprovals[i], clientAddress);
            require(approvals[i].round == disputedRound);
        }

        // Check that all the fills are valid
        for (uint256 i = 0; i < fills.length; i++) {
            checkFillSig(fills[i], sigFills[i]);
            require(fills[i].round == disputedRound);
            require(fills[i].clientAddress == clientAddress);
        }

        checkFillWithApproval(approvals, fills);

        checkDisputeAccounting(
            clientAddress,
            proofs,
            approvals,
            fills,
            dispute.disputeId,
            dispute.round
        );

        // Close the dispute
        dispute.open = false;
        openDisputeCounters[dispute.round] = openDisputeCounters[dispute.round].sub(1);

        emit DisputeClosed(
            dispute.disputeId,
            currentRound,
            clientAddress
        );
    }

    /**
     * Enables a client to recover all his funds using a proof from round r - 2.
     * Only works when the contract is halted.
     * @param proof Proof of the client balances for round r - 2.
     */
    function recoverAllFunds(Proof memory proof)
    public
    returns (bool)
    {
        updateHaltedState();
        require(halted);

        address clientAddress = msg.sender;
        address tokenAddress = proof.tokenAddress;

        require(proof.clientAddress == clientAddress);
        require(recovered[tokenAddress][clientAddress] == false);

        uint256 currentRound = getCurrentRound();
        require(isProofValid(proof, currentRound - 2));

        uint256 openingBalanceTwoRoundsAgo = proof.clientOpeningBalance;

        uint256 fundsToRecover = openingBalanceTwoRoundsAgo;
        fundsToRecover = fundsToRecover.add(clientDeposits[currentRound][tokenAddress][clientAddress]);
        fundsToRecover = fundsToRecover.add(clientDeposits[currentRound - 1][tokenAddress][clientAddress]);
        fundsToRecover = fundsToRecover.add(clientDeposits[currentRound - 2][tokenAddress][clientAddress]);

        recovered[tokenAddress][clientAddress] = true;

        require(transferTokenToClient(tokenAddress, clientAddress, fundsToRecover));

        return true;
    }

    /**
     * Enables a client to recover his funds on chain.
     * Only works when the contract is halted.
     * @param tokenAddress Address of the token to recover balance from.
     */
    function recoverOnChainFundsOnly(address tokenAddress)
    public
    returns (bool)
    {
        updateHaltedState();
        require(halted);

        address clientAddress = msg.sender;
        require(recovered[tokenAddress][clientAddress] == false);

        uint256 currentRound = getCurrentRound();

        uint256 fundsToRecover = clientDeposits[currentRound][tokenAddress][clientAddress];

        if (currentRound >= 1) {
            fundsToRecover = fundsToRecover.add(clientDeposits[currentRound - 1][tokenAddress][clientAddress]);
        }
        if (currentRound >= 2) {
            fundsToRecover = fundsToRecover.add(clientDeposits[currentRound - 2][tokenAddress][clientAddress]);
        }

        recovered[tokenAddress][clientAddress] = true;

        require(transferTokenToClient(tokenAddress, clientAddress, fundsToRecover));

        return true;
    }

    /**
     * Updates the halted state.
     */
    function updateHaltedState()
    public
    returns (bool)
    {
        if (halted) {
            return true;
        }

        uint256 currentRound = getCurrentRound();
        uint256 currentQuarter = getCurrentQuarter();

        // If in round 0, it's too early to update the halted state.
        if (currentRound == 0) {
            return false;
        }

        uint256 previousRound = currentRound.sub(1);

        bool isMissingCommits;
        bool hasOpenDisputes;

        if (currentQuarter == 0) {
            // Check for missing commits corresponding to r - 2 activity.
            isMissingCommits = (committedRounds < previousRound);

            // Check for open disputes during round r - 2
            if (previousRound > 0) {
                hasOpenDisputes = (openDisputeCounters[previousRound - 1] > 0);
            }
        } else {
            // Quarter in [ 1, 2, 3 ]. Check for round r - 1.
            isMissingCommits = (committedRounds < currentRound);
            hasOpenDisputes = (openDisputeCounters[currentRound - 1] > 0);
        }

        bool hasTokensRegistered = (tokenCount > 0);

        if (!hasTokensRegistered || isMissingCommits || hasOpenDisputes) {
            halted = true;
            haltedRound = currentRound;
            haltedQuarter = currentQuarter;

            emit Halted(haltedRound, haltedQuarter);

            return true;
        }

        return false;
    }

    //
    // Utility Functions
    //

    /**
     * Returns the current block number.
     */
    function getCurrentBlockNumber()
    public
    view
    returns (uint256)
    {
        return block.number;
    }

    /**
      * Returns the current round based on the block number.
      */
    function getCurrentRound()
    public
    view
    returns (uint256)
    {
        if (halted) {
            return haltedRound;
        } else {
            return ((getCurrentBlockNumber() - blockNumberAtCreation) / roundSize);
        }
    }

    /**
     * Returns the current quarter based on the block number.
     */
    function getCurrentQuarter()
    public
    view
    returns (uint256)
    {
        if (halted) {
            return haltedQuarter;
        } else {
            uint256 indexInRound = (getCurrentBlockNumber() - blockNumberAtCreation) % roundSize;

            return indexInRound / quarterSize;
        }
    }

    /**
     * Validates a merkle proof for a user, corresponding to the root of the given round.
     * @param proof Proof to check against the root of the tree.
     * @param round Round corresponding to the commit against which we want to verify the proof.
     */
    function isProofValid(
        Proof memory proof,
        uint256 round
    )
    public
    view
    returns (bool)
    {
        bytes32 root = commits[round][proof.tokenAddress];

        // The root must have been initialized.
        if (root == 0) {
            return false;
        }

        // The round must be correct
        if (proof.round != round) {
            return false;
        }

        // We need to check that the clientAddress and clientOpeningBalance correspond to the leaf
        // for which we want to validate a merkle path to the root.
        bytes32 leaf = keccak256(abi.encodePacked(proof.clientOpeningBalance, proof.clientAddress, proof.round));

        // Validate the proof against the current committed root.
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
     * @dev   The merkle proof part of the verification is based on:
     *        https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/cryptography/MerkleProof.sol
     * @param hashes Merkle proof containing sibling hashes on the branch from the leaf to the root of the Merkle tree.
     * @param root   Merkle root.
     * @param leaf   Leaf of Merkle tree.
     * @param sum    Balance for the leaf we want to check.
     * @param height Height of the tree.
     * @param width  Width of the tree.
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
                // Hash(current computed hash + current element of the proof).
                computedHash = keccak256(abi.encodePacked(computedSum, computedHash, proofElement));
            } else {
                // Hash(current element of the proof + current computed hash).
                computedHash = keccak256(abi.encodePacked(computedSum, proofElement, computedHash));
            }
        }

        computedHash = keccak256(abi.encodePacked(computedHash, computedSum));
        computedHash = keccak256(abi.encodePacked(computedHash, height, width));

        // Check if the computed hash (root) is equal to the provided root.
        return computedHash == root;
    }

    /**
     * Validates an authorization message.
     * @param clientAddress Address of the client.
     * @param authorization Signature of message clientAddress and round by the operator.
     */
    function verifyAuthorizationMessage(
        address clientAddress,
        AuthorizationMessage memory authorization
    )
    public
    view
    returns (bool)
    {
        uint256 currentRound = getCurrentRound();

        if (authorization.clientAddress != clientAddress) {
            return false;
        }

        if (authorization.round != currentRound - 1) {
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

    /**
     * Validates a signature on an approval and that the instance of the approval is correct.
     * @param approval      Approval signed by the Client.
     * @param sig           Signature on the approval.
     * @param clientAddress Address of the Client.
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

        require(signerAddress == clientAddress);

        return true;
    }

    /**
     * Validates a fill (signature and instance identifier).
     * @param fill Approval signed by the operator.
     * @param sig  Signature on the fill.
     */
    function checkFillSig(
        Fill memory fill,
        bytes memory sig
    )
    public
    view
    returns (bool)
    {
        require(fill.instanceId == address(this));

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
     * Check if it is a good time to cancel a withdrawal.
     * @param currentRound   Round when the function is called.
     * @param roundOfRequest Round when the withdrawal request was initiated.
     * @param tokenAddress   Address of the token corresponding to the withdrawal request.
     */
    function canCancelWithdrawal(uint256 currentRound, uint256 roundOfRequest, address tokenAddress)
    public
    view
    returns (bool)
    {
        return (currentRound == roundOfRequest) || ((currentRound == roundOfRequest + 1) && commits[currentRound][tokenAddress] == "");
    }

    /**
     * Checks if two fills contain the same values.
     * @param fill1 First fill.
     * @param fill2 Second fill.
     * @return true Iff both fills contain the same values.
     */
    function areFillsEqual(Fill memory fill1, Fill memory fill2)
    public
    pure
    returns (bool)
    {
        return (
            fill1.fillId == fill2.fillId &&
            fill1.approvalId == fill2.approvalId &&
            fill1.round == fill2.round &&
            fill1.buyAmount == fill2.buyAmount &&
            fill1.buyAsset == fill2.buyAsset &&
            fill1.sellAmount == fill2.sellAmount &&
            fill1.sellAsset == fill2.sellAsset &&
            fill1.clientAddress == fill2.clientAddress
        );
    }

    /**
     * @param fills     Array of fills.
     * @param approvals Array of approvals.
     */
    function checkFillWithApproval(
        Approval[] memory approvals,
        Fill[] memory fills
    )
    public
    pure
    returns (bool)
    {
        require(fills.length == approvals.length);

        // Check the relation between each approval and fill.
        for (uint256 i = 0; i < approvals.length; i++) {
            Approval memory approval = approvals[i];
            Fill memory fill = fills[i];

            require(fill.approvalId == approval.approvalId);
            require(fill.buyAsset   == approval.buyAsset);
            require(fill.sellAsset  == approval.sellAsset);

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

    /**
     * Checks that the token addresses of a proof array are listed in the
     * correct order and only once. Also that the client addresses and
     * the proofs themselves are valid.
     * @param proofs Array of proofs.
     */
    function isProofArrayValid(Proof[] memory proofs, address clientAddress, uint256 round)
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

            if (isProofValid(proofs[i], round) != true) {
                return false;
            }
        }

        return true;
    }

    //
    // Private Functions
    //

    /**
     * Verifies the accounting required in order to close a dispute.
     * @dev We do the dispute accounting as follow:
     * @dev 1. Take the initial balances (proofs provided when opening dispute)
     * @dev 2. Add deposits
     * @dev 3. Compute all approved buys and sells from approvals
     * @dev 4. Add/remove balances for actual fills
     * @dev 5. Substract withdrawals
     * @dev 6. Check that the resulting final balances matches the final proofs
     * @param proofs        Proofs of balances for each asset for the dispute round.
     * @param approvals     Array of approvals generated during the round previous to the dispute.
     * @param fills         Fills produced by the operator based on the approvals.
     * @param clientAddress Address of the client that opened the dispute.
     * @param disputeId     Id of the dispute object.
     * @param disputeRound  Round from the dispute object.
     */
    function checkDisputeAccounting(
        address clientAddress,
        Proof[] memory proofs,
        Approval[] memory approvals,
        Fill[] memory fills,
        uint256 disputeId,
        uint256 disputeRound
    )
    private returns (bool)
    {
        uint256 disputedRound = disputeRound.sub(1);

        // #1 - Initial Balances
        uint256[] memory balances = new uint256[](tokenCount);
        for (uint256 i = 0; i < disputes[clientAddress].openingBalances.length; i++) {
            balances[i] = disputes[clientAddress].openingBalances[i];
        }

        // #2 - Deposits
        for (uint256 i = 0; i < tokenCount; i++) {
            address token = registeredTokensAddresses[i];

            uint256 deposit = clientDeposits[disputedRound][token][clientAddress];
            if (deposit > 0) {
                balances[i] = balances[i].add(deposit);
            }
        }

        // #3 - Approvals
        uint256[] memory approvedBuys = new uint256[](tokenCount);
        uint256[] memory approvedSells = new uint256[](tokenCount);
        if (approvals.length > 0) {
            for (uint256 i = 0; i < approvals.length; i++) {
                Approval memory approval = approvals[i];

                if (disputeApprovals[disputeId][approval.approvalId] != true) {
                    uint256 buyAsset = registeredTokensIndex[approval.buyAsset];
                    uint256 sellAsset = registeredTokensIndex[approval.sellAsset];

                    if (approval.intent) {
                        approvedBuys[buyAsset] = approvedBuys[buyAsset].add(approval.buyAmount);
                    }

                    approvedSells[sellAsset] = approvedSells[sellAsset].add(approval.sellAmount);

                    disputeApprovals[disputeId][approval.approvalId] = true;
                }
            }
        }

        // #4 - Fills
        for (uint256 i = 0; i < fills.length; i++) {
            Fill memory fill = fills[i];
            Approval memory approval = approvals[i];

            uint256 buyAsset = registeredTokensIndex[fill.buyAsset];
            uint256 sellAsset = registeredTokensIndex[fill.sellAsset];

            if (approval.intent) {
                require(fill.buyAmount <= approval.buyAmount);
                // These will revert if < 0 since we are using checked arithmetic from SafeMath.
                approvedBuys[buyAsset] = approvedBuys[buyAsset].sub(fill.buyAmount);
            } else {
                require(fill.sellAmount <= approval.sellAmount);
            }

            // These will revert if < 0 since we are using checked arithmetic from SafeMath.
            approvedSells[sellAsset] = approvedSells[sellAsset].sub(fill.sellAmount);

            balances[buyAsset]  = balances[buyAsset].add(fill.buyAmount);
            balances[sellAsset] = balances[sellAsset].sub(fill.sellAmount);
        }

        // #5 - Withdrawals
        for (uint256 i = 0; i < tokenCount; i++) {
            address token = registeredTokensAddresses[i];

            uint256 withdrawal = clientRequestedWithdrawals[disputedRound][token][clientAddress].amount;
            if (withdrawal > 0) {
                balances[i] = balances[i].sub(withdrawal);
            }
        }

        // #6 - Final Balances
        for (uint256 i = 0; i < proofs.length; i++) {
            require(balances[i] == proofs[i].clientOpeningBalance);
        }

        return true;
    }

    /**
     * Transfer tokens from a client to this contract.
     * @param tokenAddress  Address of the token contract.
     * @param amount        Amount of tokens to be transferred.
     * @param clientAddress Address of the source (sender) of the transfer.
     */
    function transferTokenFromClient(address tokenAddress, address clientAddress, uint256 amount)
    private
    returns (bool)
    {
        return IERC20(tokenAddress).transferFrom(clientAddress, address(this), amount);
    }

    /**
     * Transfer tokens from this contract to a client.
     * @param tokenAddress  Address of the token contract.
     * @param amount        Amount of tokens to be transferred.
     * @param clientAddress Address of the destination (recipient) of the transfer.
     */
    function transferTokenToClient(address tokenAddress, address clientAddress, uint256 amount)
    private
    returns (bool)
    {
        return IERC20(tokenAddress).transfer(clientAddress, amount);
    }
}
