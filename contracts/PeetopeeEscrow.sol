// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PeetopeeEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant TRADE_EXPIRY = 86_400;
    uint256 public constant MAX_FEE_BPS = 500;
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
    }

    struct Trade {
        uint256 tradeId;
        address seller;
        address trader;
        uint256 usdcAmount;
        uint256 localAmount;
        string bankDetails;
        TradeStatus status;
        uint256 createdAt;
        uint256 fiatSentAt;
        uint256 disputedAt;
        bool sellerDisputed;
        bool traderDisputed;
    }

    error ZeroAddress();
    error InvalidChainId(uint256 expected, uint256 actual);
    error InvalidUsdcAddress(address expected, address actual);
    error TraderAlreadyRegistered();
    error TraderNotRegistered();
    error TraderNotActive();
    error InvalidRange();
    error InvalidExchangeRate();
    error InvalidAmount();
    error NotTrader();
    error NotSeller();
    error NotParticipant();
    error InvalidTradeStatus();
    error TradeExpired();
    error TradeNotExpired();
    error AlreadyRated();
    error InvalidRating();
    error Unauthorized();
    error FeeTooHigh(uint256 maxFeeBps);
    error GlobalPauseEnabled();

    event TraderRegistered(address indexed trader, string countryCode, string currencyCode);
    event TraderUpdated(address indexed trader);
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
    event DisputeOpened(uint256 indexed tradeId, address indexed openedBy);
    event DisputeResolved(uint256 indexed tradeId, bool releasedToTrader);
    event TradeCancelled(uint256 indexed tradeId, address indexed seller);
    event TraderRated(uint256 indexed tradeId, uint8 rating);
    event PlatformFeeUpdated(uint256 newFeeBps);
    event TreasuryUpdated(address newTreasury);
    event GlobalPauseUpdated(bool isPaused);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    IERC20 public immutable usdc;
    address public admin;
    address public treasury;
    uint256 public platformFeeBps;
    bool public globalPause;

    uint256 private _nextTradeId = 1;

    mapping(address => TraderProfile) private _traderProfiles;
    mapping(uint256 => Trade) private _trades;
    mapping(uint256 => bool) private _tradeRated;

    mapping(string => address[]) private _countryToTraders;
    mapping(string => mapping(address => bool)) private _countryTraderExists;
    mapping(address => uint256[]) private _traderToTrades;
    mapping(address => uint256[]) private _sellerToTrades;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(address _usdc, address _admin, address _treasury, uint256 _initialFeeBps) {
        if (_usdc == address(0) || _admin == address(0) || _treasury == address(0)) revert ZeroAddress();
        if (block.chainid != ARC_TESTNET_CHAIN_ID) {
            revert InvalidChainId(ARC_TESTNET_CHAIN_ID, block.chainid);
        }
        if (_usdc != ARC_TESTNET_USDC) revert InvalidUsdcAddress(ARC_TESTNET_USDC, _usdc);
        if (_initialFeeBps > MAX_FEE_BPS) revert FeeTooHigh(MAX_FEE_BPS);

        usdc = IERC20(_usdc);
        admin = _admin;
        treasury = _treasury;
        platformFeeBps = _initialFeeBps;
    }

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

        profile.countryCode = countryCode;
        profile.currencyCode = currencyCode;
        profile.exchangeRate = exchangeRate;
        profile.minOrderUsdc = minOrder;
        profile.maxOrderUsdc = maxOrder;
        profile.paymentMethods = paymentMethods;

        _addTraderToCountry(countryCode, msg.sender);

        emit TraderUpdated(msg.sender);
    }

    function setTraderActive(bool isActive) external {
        TraderProfile storage profile = _traderProfiles[msg.sender];
        if (profile.traderAddr == address(0)) revert TraderNotRegistered();

        profile.isActive = isActive;

        emit TraderUpdated(msg.sender);
    }

    function createTrade(
        address traderId,
        uint256 usdcAmount,
        uint256 localAmount,
        string calldata bankDetailsHash
    ) external nonReentrant returns (uint256 tradeId) {
        if (globalPause) revert GlobalPauseEnabled();
        if (usdcAmount == 0 || localAmount == 0) revert InvalidAmount();

        TraderProfile storage profile = _traderProfiles[traderId];
        if (profile.traderAddr == address(0)) revert TraderNotRegistered();
        if (!profile.isActive) revert TraderNotActive();
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
            traderDisputed: false
        });

        _traderToTrades[traderId].push(tradeId);
        _sellerToTrades[msg.sender].push(tradeId);

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        emit TradeCreated(tradeId, msg.sender, traderId, usdcAmount, localAmount);
    }

    function markFiatSent(uint256 tradeId) external {
        Trade storage trade = _trades[tradeId];
        if (trade.tradeId == 0) revert InvalidAmount();
        if (msg.sender != trade.trader) revert NotTrader();
        if (trade.status != TradeStatus.Created) revert InvalidTradeStatus();
        if (block.timestamp > trade.createdAt + TRADE_EXPIRY) revert TradeExpired();

        trade.status = TradeStatus.FiatSent;
        trade.fiatSentAt = block.timestamp;

        emit FiatSent(tradeId, msg.sender);
    }

    function confirmReceived(uint256 tradeId) external nonReentrant {
        Trade storage trade = _trades[tradeId];
        if (trade.tradeId == 0) revert InvalidAmount();
        if (msg.sender != trade.seller) revert NotSeller();
        if (trade.status != TradeStatus.FiatSent) revert InvalidTradeStatus();

        trade.status = TradeStatus.Completed;

        uint256 fee = (trade.usdcAmount * platformFeeBps) / BPS_DENOMINATOR;
        uint256 usdcToTrader = trade.usdcAmount - fee;

        if (fee > 0) {
            usdc.safeTransfer(treasury, fee);
        }
        usdc.safeTransfer(trade.trader, usdcToTrader);

        _traderProfiles[trade.trader].completedTrades += 1;

        emit TradeCompleted(tradeId, trade.seller, trade.trader, usdcToTrader, fee);
    }

    function rateTrader(uint256 tradeId, uint8 rating) external {
        if (rating < 1 || rating > 5) revert InvalidRating();

        Trade storage trade = _trades[tradeId];
        if (trade.tradeId == 0) revert InvalidAmount();
        if (msg.sender != trade.seller) revert NotSeller();
        if (trade.status != TradeStatus.Completed) revert InvalidTradeStatus();
        if (_tradeRated[tradeId]) revert AlreadyRated();

        _tradeRated[tradeId] = true;
        _traderProfiles[trade.trader].totalRatingPoints += rating;

        emit TraderRated(tradeId, rating);
    }

    function openDispute(uint256 tradeId) external {
        Trade storage trade = _trades[tradeId];
        if (trade.tradeId == 0) revert InvalidAmount();
        if (msg.sender != trade.seller && msg.sender != trade.trader) revert NotParticipant();
        if (trade.status != TradeStatus.Created && trade.status != TradeStatus.FiatSent) {
            revert InvalidTradeStatus();
        }

        trade.status = TradeStatus.Disputed;
        trade.disputedAt = block.timestamp;

        if (msg.sender == trade.seller) {
            trade.sellerDisputed = true;
        } else {
            trade.traderDisputed = true;
        }

        emit DisputeOpened(tradeId, msg.sender);
    }

    function cancelTrade(uint256 tradeId) external nonReentrant {
        Trade storage trade = _trades[tradeId];
        if (trade.tradeId == 0) revert InvalidAmount();
        if (msg.sender != trade.seller) revert NotSeller();
        if (trade.status != TradeStatus.Created) revert InvalidTradeStatus();
        if (block.timestamp < trade.createdAt + TRADE_EXPIRY) revert TradeNotExpired();

        trade.status = TradeStatus.Cancelled;

        usdc.safeTransfer(trade.seller, trade.usdcAmount);

        emit TradeCancelled(tradeId, trade.seller);
    }

    function resolveDispute(uint256 tradeId, bool releaseToTrader) external onlyAdmin nonReentrant {
        Trade storage trade = _trades[tradeId];
        if (trade.tradeId == 0) revert InvalidAmount();
        if (trade.status != TradeStatus.Disputed) revert InvalidTradeStatus();

        trade.status = TradeStatus.Resolved;

        if (releaseToTrader) {
            uint256 fee = (trade.usdcAmount * platformFeeBps) / BPS_DENOMINATOR;
            uint256 usdcToTrader = trade.usdcAmount - fee;

            if (fee > 0) {
                usdc.safeTransfer(treasury, fee);
            }
            usdc.safeTransfer(trade.trader, usdcToTrader);
            _traderProfiles[trade.trader].completedTrades += 1;
        } else {
            usdc.safeTransfer(trade.seller, trade.usdcAmount);
        }

        emit DisputeResolved(tradeId, releaseToTrader);
    }

    function setPlatformFee(uint256 newFeeBps) external onlyAdmin {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(MAX_FEE_BPS);
        platformFeeBps = newFeeBps;

        emit PlatformFeeUpdated(newFeeBps);
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

    function _validateTraderInputs(uint256 exchangeRate, uint256 minOrder, uint256 maxOrder) internal pure {
        if (exchangeRate == 0) revert InvalidExchangeRate();
        if (minOrder == 0 || maxOrder == 0 || minOrder > maxOrder) revert InvalidRange();
    }

    function _addTraderToCountry(string memory countryCode, address trader) internal {
        if (!_countryTraderExists[countryCode][trader]) {
            _countryTraderExists[countryCode][trader] = true;
            _countryToTraders[countryCode].push(trader);
        }
    }
}
