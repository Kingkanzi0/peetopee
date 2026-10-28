// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PeetopeeEscrowV2
/// @notice P2P escrow: a seller locks USDC, a local trader pays local currency to the
///         seller's chosen bank account off-chain, and the USDC is released to the trader.
///
/// Changes from V1:
///  - Trader bonds: traders lock a USDC deposit (>= minTraderBond) before they can take
///    trades. When a dispute is decided for the seller, the admin can slash part of the
///    bond to the seller as compensation. Bonds can't be withdrawn below the minimum while
///    the trader has open trades.
///  - Confirm window: after the trader marks fiat sent, the seller has CONFIRM_WINDOW to
///    confirm or dispute. After that the trader can claim the USDC, so an honest trader
///    can't be left unpaid by a seller who goes silent.
///  - The platform fee is fixed when the trade is created (later fee changes don't apply).
///  - Changing country moves the trader out of the old country's list.
///  - Ratings are counted separately from completed trades, so averages are correct.
contract PeetopeeEscrowV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant TRADE_EXPIRY = 86_400; // trader has 24h to mark fiat sent
    uint256 public constant CONFIRM_WINDOW = 172_800; // seller has 48h after "fiat sent" to confirm or dispute
    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant MAX_MIN_BOND = 100_000e6; // admin can't set an absurd minimum bond
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    address public constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    enum TradeStatus {
        Created,
        FiatSent,
        Completed,
        Disputed,
        Cancelled,
        Resolved
    }

    struct TraderProfile {
        address traderAddr;
        string countryCode;
        string currencyCode;
        uint256 exchangeRate;
        uint256 minOrderUsdc;
        uint256 maxOrderUsdc;
        string paymentMethods;
        bool isActive;
        uint256 completedTrades;
        uint256 totalRatingPoints;
        uint256 ratingCount;
        uint256 bond;
        uint256 openTrades;
    }

    struct Trade {
        uint256 tradeId;
        address seller;
        address trader;
        uint256 usdcAmount;
        uint256 localAmount;
        string bankDetails; // keccak256 hash of the bank details (details themselves are off-chain)
        TradeStatus status;
        uint256 createdAt;
        uint256 fiatSentAt;
        uint256 disputedAt;
        bool sellerDisputed;
        bool traderDisputed;
        uint256 feeBps;
    }

    error ZeroAddress();
    error InvalidChainId(uint256 expected, uint256 actual);
    error InvalidUsdcAddress(address expected, address actual);
    error TraderAlreadyRegistered();
    error TraderNotRegistered();
    error TraderNotActive();
    error InsufficientBond(uint256 required, uint256 actual);
    error BondLocked();
    error InvalidRange();
    error InvalidExchangeRate();
    error InvalidAmount();
    error NotTrader();
    error NotSeller();
    error NotParticipant();
    error InvalidTradeStatus();
    error TradeExpired();
    error TradeNotExpired();
    error ConfirmWindowOpen();
    error AlreadyRated();
    error InvalidRating();
    error Unauthorized();
    error FeeTooHigh(uint256 maxFeeBps);
    error BondTooHigh(uint256 maxBond);
    error GlobalPauseEnabled();
    error SelfTrade();

    event TraderRegistered(address indexed trader, string countryCode, string currencyCode);
    event TraderUpdated(address indexed trader);
    event BondDeposited(address indexed trader, uint256 amount, uint256 newBond);
    event BondWithdrawn(address indexed trader, uint256 amount, uint256 newBond);
    event BondSlashed(uint256 indexed tradeId, address indexed trader, address indexed seller, uint256 amount);
    event TradeCreated(
        uint256 indexed tradeId,
        address indexed seller,
        address indexed trader,
        uint256 usdcAmount,
        uint256 localAmount
    );
    event FiatSent(uint256 indexed tradeId, address indexed trader);
    event TradeCompleted(
        uint256 indexed tradeId,
        address indexed seller,
        address indexed trader,
        uint256 usdcToTrader,
        uint256 fee
    );
    event TradeClaimed(uint256 indexed tradeId, address indexed trader);
    event DisputeOpened(uint256 indexed tradeId, address indexed openedBy);
    event DisputeResolved(uint256 indexed tradeId, bool releasedToTrader, uint256 slashed);
    event TradeCancelled(uint256 indexed tradeId, address indexed seller);
    event TraderRated(uint256 indexed tradeId, uint8 rating);
    event PlatformFeeUpdated(uint256 newFeeBps);
    event MinTraderBondUpdated(uint256 newMinBond);
    event TreasuryUpdated(address newTreasury);
    event GlobalPauseUpdated(bool isPaused);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    IERC20 public immutable usdc;
    address public admin;
    address public treasury;
    uint256 public platformFeeBps;
    uint256 public minTraderBond;
    bool public globalPause;

    uint256 private _nextTradeId = 1;

    mapping(address => TraderProfile) private _traderProfiles;
    mapping(uint256 => Trade) private _trades;
    mapping(uint256 => bool) private _tradeRated;

    mapping(string => address[]) private _countryToTraders;
    // 1-based index of a trader in _countryToTraders[country]; 0 = not listed
    mapping(string => mapping(address => uint256)) private _countryIndex;
    mapping(address => uint256[]) private _traderToTrades;
    mapping(address => uint256[]) private _sellerToTrades;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(address _usdc, address _admin, address _treasury, uint256 _initialFeeBps, uint256 _minTraderBond) {
        if (_usdc == address(0) || _admin == address(0) || _treasury == address(0)) revert ZeroAddress();
        if (block.chainid != ARC_TESTNET_CHAIN_ID) revert InvalidChainId(ARC_TESTNET_CHAIN_ID, block.chainid);
        if (_usdc != ARC_TESTNET_USDC) revert InvalidUsdcAddress(ARC_TESTNET_USDC, _usdc);
        if (_initialFeeBps > MAX_FEE_BPS) revert FeeTooHigh(MAX_FEE_BPS);
        if (_minTraderBond > MAX_MIN_BOND) revert BondTooHigh(MAX_MIN_BOND);

        usdc = IERC20(_usdc);
        admin = _admin;
        treasury = _treasury;
        platformFeeBps = _initialFeeBps;
        minTraderBond = _minTraderBond;
    }

    // ── traders ─────────────────────────────────────────────────────────────

    function registerTrader(
        string calldata countryCode,
        string calldata currencyCode,
        uint256 exchangeRate,
        uint256 minOrder,
        uint256 maxOrder,
        string calldata paymentMethods
    ) external {
        TraderProfile storage profile = _traderProfiles[msg.sender];
        if (profile.traderAddr != address(0)) revert TraderAlreadyRegistered();
        _validateTraderInputs(exchangeRate, minOrder, maxOrder);

        profile.traderAddr = msg.sender;
        profile.countryCode = countryCode;
        profile.currencyCode = currencyCode;
        profile.exchangeRate = exchangeRate;
        profile.minOrderUsdc = minOrder;
        profile.maxOrderUsdc = maxOrder;
        profile.paymentMethods = paymentMethods;
        profile.isActive = true;

        _addTraderToCountry(countryCode, msg.sender);

        emit TraderRegistered(msg.sender, countryCode, currencyCode);
    }

    function updateTraderProfile(
        string calldata countryCode,
        string calldata currencyCode,
        uint256 exchangeRate,
        uint256 minOrder,
        uint256 maxOrder,
        string calldata paymentMethods
    ) external {
        TraderProfile storage profile = _traderProfiles[msg.sender];
        if (profile.traderAddr == address(0)) revert TraderNotRegistered();
        _validateTraderInputs(exchangeRate, minOrder, maxOrder);

        if (keccak256(bytes(profile.countryCode)) != keccak256(bytes(countryCode))) {
            _removeTraderFromCountry(profile.countryCode, msg.sender);
            _addTraderToCountry(countryCode, msg.sender);
        }

        profile.countryCode = countryCode;
        profile.currencyCode = currencyCode;
        profile.exchangeRate = exchangeRate;
        profile.minOrderUsdc = minOrder;
        profile.maxOrderUsdc = maxOrder;
        profile.paymentMethods = paymentMethods;

        emit TraderUpdated(msg.sender);
    }

    function setTraderActive(bool isActive) external {
        TraderProfile storage profile = _traderProfiles[msg.sender];
        if (profile.traderAddr == address(0)) revert TraderNotRegistered();
        profile.isActive = isActive;
        emit TraderUpdated(msg.sender);
    }

    /// @notice Lock USDC as a trader bond. Requires a prior USDC approval.
    function depositBond(uint256 amount) external nonReentrant {
        TraderProfile storage profile = _traderProfiles[msg.sender];
        if (profile.traderAddr == address(0)) revert TraderNotRegistered();
        if (amount == 0) revert InvalidAmount();
        profile.bond += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit BondDeposited(msg.sender, amount, profile.bond);
    }

    /// @notice Withdraw bond. While trades are open the bond can't drop below minTraderBond.
    function withdrawBond(uint256 amount) external nonReentrant {
        TraderProfile storage profile = _traderProfiles[msg.sender];
        if (profile.traderAddr == address(0)) revert TraderNotRegistered();
        if (amount == 0 || amount > profile.bond) revert InvalidAmount();
        uint256 remaining = profile.bond - amount;
        if (profile.openTrades > 0 && remaining < minTraderBond) revert BondLocked();
        profile.bond = remaining;
        usdc.safeTransfer(msg.sender, amount);
        emit BondWithdrawn(msg.sender, amount, remaining);
    }

    // ── trades ──────────────────────────────────────────────────────────────

    function createTrade(
        address traderId,
        uint256 usdcAmount,
        uint256 localAmount,
        string calldata bankDetailsHash
    ) external nonReentrant returns (uint256 tradeId) {
        if (globalPause) revert GlobalPauseEnabled();
        if (usdcAmount == 0 || localAmount == 0) revert InvalidAmount();
        if (traderId == msg.sender) revert SelfTrade();

        TraderProfile storage profile = _traderProfiles[traderId];
        if (profile.traderAddr == address(0)) revert TraderNotRegistered();
        if (!profile.isActive) revert TraderNotActive();
        if (profile.bond < minTraderBond) revert InsufficientBond(minTraderBond, profile.bond);
        if (usdcAmount < profile.minOrderUsdc || usdcAmount > profile.maxOrderUsdc) revert InvalidAmount();

        tradeId = _nextTradeId;
        _nextTradeId = tradeId + 1;

        _trades[tradeId] = Trade({
            tradeId: tradeId,
            seller: msg.sender,
            trader: traderId,
            usdcAmount: usdcAmount,
            localAmount: localAmount,
            bankDetails: bankDetailsHash,
            status: TradeStatus.Created,
            createdAt: block.timestamp,
            fiatSentAt: 0,
            disputedAt: 0,
            sellerDisputed: false,
            traderDisputed: false,
            feeBps: platformFeeBps
        });

        profile.openTrades += 1;
        _traderToTrades[traderId].push(tradeId);
        _sellerToTrades[msg.sender].push(tradeId);

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        emit TradeCreated(tradeId, msg.sender, traderId, usdcAmount, localAmount);
    }

    function markFiatSent(uint256 tradeId) external {
        Trade storage trade = _getTrade(tradeId);
        if (msg.sender != trade.trader) revert NotTrader();
        if (trade.status != TradeStatus.Created) revert InvalidTradeStatus();
        if (block.timestamp > trade.createdAt + TRADE_EXPIRY) revert TradeExpired();

        trade.status = TradeStatus.FiatSent;
        trade.fiatSentAt = block.timestamp;

        emit FiatSent(tradeId, msg.sender);
    }

    function confirmReceived(uint256 tradeId) external nonReentrant {
        Trade storage trade = _getTrade(tradeId);
        if (msg.sender != trade.seller) revert NotSeller();
        if (trade.status != TradeStatus.FiatSent) revert InvalidTradeStatus();

        trade.status = TradeStatus.Completed;
        _payTrader(trade);
    }

    /// @notice The trader marked fiat sent, and the seller neither confirmed nor disputed
    ///         within CONFIRM_WINDOW: the trader can take the USDC.
    function claimAfterConfirmWindow(uint256 tradeId) external nonReentrant {
        Trade storage trade = _getTrade(tradeId);
        if (msg.sender != trade.trader) revert NotTrader();
        if (trade.status != TradeStatus.FiatSent) revert InvalidTradeStatus();
        if (block.timestamp <= trade.fiatSentAt + CONFIRM_WINDOW) revert ConfirmWindowOpen();

        trade.status = TradeStatus.Completed;
        emit TradeClaimed(tradeId, msg.sender);
        _payTrader(trade);
    }

    function rateTrader(uint256 tradeId, uint8 rating) external {
        if (rating < 1 || rating > 5) revert InvalidRating();
        Trade storage trade = _getTrade(tradeId);
        if (msg.sender != trade.seller) revert NotSeller();
        if (trade.status != TradeStatus.Completed) revert InvalidTradeStatus();
        if (_tradeRated[tradeId]) revert AlreadyRated();

        _tradeRated[tradeId] = true;
        TraderProfile storage profile = _traderProfiles[trade.trader];
        profile.totalRatingPoints += rating;
        profile.ratingCount += 1;

        emit TraderRated(tradeId, rating);
    }

    function openDispute(uint256 tradeId) external {
        Trade storage trade = _getTrade(tradeId);
        if (msg.sender != trade.seller && msg.sender != trade.trader) revert NotParticipant();
        if (trade.status != TradeStatus.Created && trade.status != TradeStatus.FiatSent) revert InvalidTradeStatus();

        trade.status = TradeStatus.Disputed;
        trade.disputedAt = block.timestamp;
        if (msg.sender == trade.seller) trade.sellerDisputed = true;
        else trade.traderDisputed = true;

        emit DisputeOpened(tradeId, msg.sender);
    }

    function cancelTrade(uint256 tradeId) external nonReentrant {
        Trade storage trade = _getTrade(tradeId);
        if (msg.sender != trade.seller) revert NotSeller();
        if (trade.status != TradeStatus.Created) revert InvalidTradeStatus();
        if (block.timestamp < trade.createdAt + TRADE_EXPIRY) revert TradeNotExpired();

        trade.status = TradeStatus.Cancelled;
        _traderProfiles[trade.trader].openTrades -= 1;
        usdc.safeTransfer(trade.seller, trade.usdcAmount);

        emit TradeCancelled(tradeId, trade.seller);
    }

    /// @param releaseToTrader true: the trader paid, release the USDC to them.
    ///                        false: refund the seller.
    /// @param slashAmount     only when refunding: USDC taken from the trader's bond and
    ///                        paid to the seller as compensation (capped at the bond).
    function resolveDispute(uint256 tradeId, bool releaseToTrader, uint256 slashAmount)
        external
        onlyAdmin
        nonReentrant
    {
        Trade storage trade = _getTrade(tradeId);
        if (trade.status != TradeStatus.Disputed) revert InvalidTradeStatus();
        if (releaseToTrader && slashAmount > 0) revert InvalidAmount();

        trade.status = TradeStatus.Resolved;

        uint256 slashed;
        if (releaseToTrader) {
            _payTrader(trade);
        } else {
            TraderProfile storage profile = _traderProfiles[trade.trader];
            profile.openTrades -= 1;
            slashed = slashAmount > profile.bond ? profile.bond : slashAmount;
            profile.bond -= slashed;
            usdc.safeTransfer(trade.seller, trade.usdcAmount + slashed);
            if (slashed > 0) emit BondSlashed(tradeId, trade.trader, trade.seller, slashed);
        }

        emit DisputeResolved(tradeId, releaseToTrader, slashed);
    }

    // ── admin ───────────────────────────────────────────────────────────────

    function setPlatformFee(uint256 newFeeBps) external onlyAdmin {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(MAX_FEE_BPS);
        platformFeeBps = newFeeBps;
        emit PlatformFeeUpdated(newFeeBps);
    }

    function setMinTraderBond(uint256 newMinBond) external onlyAdmin {
        if (newMinBond > MAX_MIN_BOND) revert BondTooHigh(MAX_MIN_BOND);
        minTraderBond = newMinBond;
        emit MinTraderBondUpdated(newMinBond);
    }

    function setTreasury(address newTreasury) external onlyAdmin {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setGlobalPause(bool isPaused) external onlyAdmin {
        globalPause = isPaused;
        emit GlobalPauseUpdated(isPaused);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminTransferred(oldAdmin, newAdmin);
    }

    // ── views ───────────────────────────────────────────────────────────────

    function getTraderProfile(address trader) external view returns (TraderProfile memory) {
        return _traderProfiles[trader];
    }

    function getTrade(uint256 tradeId) external view returns (Trade memory) {
        return _trades[tradeId];
    }

    function getTradersByCountry(string memory countryCode) external view returns (address[] memory) {
        return _countryToTraders[countryCode];
    }

    function getTradesByTrader(address trader) external view returns (uint256[] memory) {
        return _traderToTrades[trader];
    }

    function getTradesBySeller(address seller) external view returns (uint256[] memory) {
        return _sellerToTrades[seller];
    }

    function tradeCount() external view returns (uint256) {
        return _nextTradeId - 1;
    }

    // ── internal ────────────────────────────────────────────────────────────

    function _getTrade(uint256 tradeId) internal view returns (Trade storage trade) {
        trade = _trades[tradeId];
        if (trade.tradeId == 0) revert InvalidAmount();
    }

    /// Pays the trader (minus the fee fixed at creation) and closes their open-trade slot.
    function _payTrader(Trade storage trade) internal {
        uint256 fee = (trade.usdcAmount * trade.feeBps) / BPS_DENOMINATOR;
        uint256 usdcToTrader = trade.usdcAmount - fee;

        TraderProfile storage profile = _traderProfiles[trade.trader];
        profile.openTrades -= 1;
        profile.completedTrades += 1;

        if (fee > 0) usdc.safeTransfer(treasury, fee);
        usdc.safeTransfer(trade.trader, usdcToTrader);

        emit TradeCompleted(trade.tradeId, trade.seller, trade.trader, usdcToTrader, fee);
    }

    function _validateTraderInputs(uint256 exchangeRate, uint256 minOrder, uint256 maxOrder) internal pure {
        if (exchangeRate == 0) revert InvalidExchangeRate();
        if (minOrder == 0 || maxOrder == 0 || minOrder > maxOrder) revert InvalidRange();
    }

    function _addTraderToCountry(string memory countryCode, address trader) internal {
        if (_countryIndex[countryCode][trader] == 0) {
            _countryToTraders[countryCode].push(trader);
            _countryIndex[countryCode][trader] = _countryToTraders[countryCode].length;
        }
    }

    function _removeTraderFromCountry(string memory countryCode, address trader) internal {
        uint256 idx = _countryIndex[countryCode][trader];
        if (idx == 0) return;
        address[] storage list = _countryToTraders[countryCode];
        address last = list[list.length - 1];
        list[idx - 1] = last;
        _countryIndex[countryCode][last] = idx;
        list.pop();
        delete _countryIndex[countryCode][trader];
    }
}
