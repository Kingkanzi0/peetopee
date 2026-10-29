// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PeetopeeNaira (tNGN) — TESTNET naira account token for Peetopee
/// @notice A naira balance held in the user's own wallet, sent by @handle like any token,
///         and paid out to Nigerian banks or bills without going through P2P traders.
///
/// How it works:
///  - Convert: USDC -> tNGN (buyWithUsdc) and tNGN -> USDC (sellForUsdc) at the admin-set
///    rate, minus a small spread. The USDC paid in stays in this contract as the reserve.
///  - Send: ordinary ERC-20 transfer to another Peetopee user's wallet.
///  - Pay out: requestPayout burns the naira and records a payout (bank transfer, airtime,
///    data, electricity, TV). The payout details (account number, phone, meter…) are kept
///    off-chain by the Peetopee server; only their keccak256 hash (`ref`) is stored here.
///    A payment partner pays the naira out. If a payout fails, the admin refunds it, which
///    re-mints the naira to the sender.
///
/// IMPORTANT: this is a testnet stand-in. In production the naira balance must be a
/// licensed, fully-backed naira stablecoin (e.g. cNGN) or held by a licensed partner, and
/// payouts go through that partner. The faucet exists only for testing and mints unbacked
/// test naira; set faucetAmount to 0 to turn it off.
contract PeetopeeNaira is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_SPREAD_BPS = 300; // 3%
    uint256 public constant BPS = 10_000;
    uint256 public constant FAUCET_COOLDOWN = 1 days;
    uint8 public constant MAX_KIND = 4;

    enum PayoutKind { Bank, Airtime, Data, Electricity, Tv }
    enum PayoutStatus { None, Requested, Refunded }

    struct Payout {
        address from;
        uint256 amount;
        uint8 kind;
        bytes32 ref;
        uint8 status;
        uint64 createdAt;
    }

    IERC20 public immutable usdc;
    address public admin;
    /// @notice Naira per 1 USDC, scaled by 1e6 (e.g. 1_550e6 = ₦1,550 per USDC).
    uint256 public rate;
    uint256 public spreadBps;
    uint256 public faucetAmount;
    mapping(address => uint256) public lastFaucetAt;

    Payout[] private _payouts;

    event Converted(address indexed account, bool toNaira, uint256 usdcAmount, uint256 nairaAmount);
    event PayoutRequested(uint256 indexed payoutId, address indexed from, uint256 amount, uint8 kind, bytes32 ref);
    event PayoutRefunded(uint256 indexed payoutId, address indexed to, uint256 amount);
    event RateUpdated(uint256 rate, uint256 spreadBps);
    event FaucetUpdated(uint256 amount);
    event FaucetUsed(address indexed account, uint256 amount);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    error NotAdmin();
    error ZeroAmount();
    error ZeroAddress();
    error BadRate();
    error BadKind();
    error BadRef();
    error ReserveTooLow();
    error FaucetOff();
    error FaucetCooldown(uint256 availableAt);
    error UnknownPayout();
    error NotRefundable();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address usdc_, address admin_, uint256 rate_, uint256 spreadBps_, uint256 faucetAmount_)
        ERC20("Peetopee Naira (test)", "tNGN")
    {
        if (usdc_ == address(0) || admin_ == address(0)) revert ZeroAddress();
        if (rate_ == 0 || spreadBps_ > MAX_SPREAD_BPS) revert BadRate();
        usdc = IERC20(usdc_);
        admin = admin_;
        rate = rate_;
        spreadBps = spreadBps_;
        faucetAmount = faucetAmount_;
        emit AdminTransferred(address(0), admin_);
        emit RateUpdated(rate_, spreadBps_);
        emit FaucetUpdated(faucetAmount_);
    }

    /// @dev Same 6 decimals as USDC: 1_000_000 units = ₦1.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // ── convert ──────────────────────────────────────────────────────────────

    /// @notice Naira you get for `usdcAmount` USDC.
    function quoteBuy(uint256 usdcAmount) public view returns (uint256) {
        return (usdcAmount * rate * (BPS - spreadBps)) / (1e6 * BPS);
    }

    /// @notice USDC you get for `nairaAmount` naira.
    function quoteSell(uint256 nairaAmount) public view returns (uint256) {
        return (nairaAmount * 1e6 * BPS) / (rate * (BPS + spreadBps));
    }

    /// @notice Pay USDC, receive naira. Approve this contract for `usdcAmount` first.
    function buyWithUsdc(uint256 usdcAmount) external nonReentrant returns (uint256 naira) {
        naira = quoteBuy(usdcAmount);
        if (naira == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        _mint(msg.sender, naira);
        emit Converted(msg.sender, true, usdcAmount, naira);
    }

    /// @notice Give back naira, receive USDC from the reserve.
    function sellForUsdc(uint256 nairaAmount) external nonReentrant returns (uint256 usdcOut) {
        usdcOut = quoteSell(nairaAmount);
        if (usdcOut == 0) revert ZeroAmount();
        if (usdcOut > usdc.balanceOf(address(this))) revert ReserveTooLow();
        _burn(msg.sender, nairaAmount);
        usdc.safeTransfer(msg.sender, usdcOut);
        emit Converted(msg.sender, false, usdcOut, nairaAmount);
    }

    // ── payouts (bank, airtime, data, electricity, TV) ───────────────────────

    /// @notice Burn `amount` naira to be paid out off-chain. `ref` = keccak256 of the payout details.
    function requestPayout(uint256 amount, uint8 kind, bytes32 ref) external nonReentrant returns (uint256 payoutId) {
        if (amount == 0) revert ZeroAmount();
        if (kind > MAX_KIND) revert BadKind();
        if (ref == bytes32(0)) revert BadRef();
        _burn(msg.sender, amount);
        payoutId = _payouts.length + 1; // ids start at 1
        _payouts.push(Payout({
            from: msg.sender,
            amount: amount,
            kind: kind,
            ref: ref,
            status: uint8(PayoutStatus.Requested),
            createdAt: uint64(block.timestamp)
        }));
        emit PayoutRequested(payoutId, msg.sender, amount, kind, ref);
    }

    /// @notice The payout partner couldn't pay it: give the naira back to the sender.
    function refundPayout(uint256 payoutId) external onlyAdmin nonReentrant {
        if (payoutId == 0 || payoutId > _payouts.length) revert UnknownPayout();
        Payout storage p = _payouts[payoutId - 1];
        if (p.status != uint8(PayoutStatus.Requested)) revert NotRefundable();
        p.status = uint8(PayoutStatus.Refunded);
        _mint(p.from, p.amount);
        emit PayoutRefunded(payoutId, p.from, p.amount);
    }

    function getPayout(uint256 payoutId)
        external
        view
        returns (address from, uint256 amount, uint8 kind, bytes32 ref, uint8 status, uint64 createdAt)
    {
        if (payoutId == 0 || payoutId > _payouts.length) revert UnknownPayout();
        Payout storage p = _payouts[payoutId - 1];
        return (p.from, p.amount, p.kind, p.ref, p.status, p.createdAt);
    }

    function payoutCount() external view returns (uint256) {
        return _payouts.length;
    }

    // ── testnet faucet ───────────────────────────────────────────────────────

    function faucet() external {
        uint256 amount = faucetAmount;
        if (amount == 0) revert FaucetOff();
        uint256 next = lastFaucetAt[msg.sender] + FAUCET_COOLDOWN;
        if (lastFaucetAt[msg.sender] != 0 && block.timestamp < next) revert FaucetCooldown(next);
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, amount);
        emit FaucetUsed(msg.sender, amount);
    }

    // ── admin ────────────────────────────────────────────────────────────────

    function setRate(uint256 rate_, uint256 spreadBps_) external onlyAdmin {
        if (rate_ == 0 || spreadBps_ > MAX_SPREAD_BPS) revert BadRate();
        rate = rate_;
        spreadBps = spreadBps_;
        emit RateUpdated(rate_, spreadBps_);
    }

    function setFaucetAmount(uint256 amount) external onlyAdmin {
        faucetAmount = amount;
        emit FaucetUpdated(amount);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }
}
