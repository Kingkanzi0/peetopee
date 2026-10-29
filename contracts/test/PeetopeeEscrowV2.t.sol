// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PeetopeeEscrowV2} from "../PeetopeeEscrowV2.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

abstract contract V2Base is Test {
    uint256 internal constant CHAIN_ID = 5_042_002;
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    uint256 internal constant FEE_BPS = 50; // 0.5%
    uint256 internal constant MIN_BOND = 50e6;
    uint256 internal constant RATE = 1580e6; // 1 USDC = 1580 NGN (scaled 1e6)

    PeetopeeEscrowV2 internal escrow;
    MockERC20 internal usdc;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal seller = makeAddr("seller");
    address internal trader = makeAddr("trader");
    address internal stranger = makeAddr("stranger");

    function _deploy() internal {
        vm.chainId(CHAIN_ID);
        MockERC20 tmp = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(tmp).code);
        usdc = MockERC20(USDC_ADDR);
        escrow = new PeetopeeEscrowV2(USDC_ADDR, admin, treasury, FEE_BPS, MIN_BOND);
    }

    function _register(address who, string memory country) internal {
        vm.prank(who);
        escrow.registerTrader(country, "NGN", RATE, 10e6, 1_000e6, "Bank Transfer");
    }

    function _bond(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(escrow), amount);
        escrow.depositBond(amount);
        vm.stopPrank();
    }

    function _trade(uint256 amount) internal returns (uint256 id) {
        usdc.mint(seller, amount);
        vm.startPrank(seller);
        usdc.approve(address(escrow), amount);
        id = escrow.createTrade(trader, amount, (amount * RATE) / 1e6, "0xhash");
        vm.stopPrank();
    }
}

contract PeetopeeEscrowV2Test is V2Base {
    function setUp() public {
        _deploy();
        _register(trader, "NG");
        _bond(trader, MIN_BOND);
    }

    // ── deployment ──────────────────────────────────────────────────────────

    function test_constructor_setsConfig() public view {
        assertEq(escrow.admin(), admin);
        assertEq(escrow.treasury(), treasury);
        assertEq(escrow.platformFeeBps(), FEE_BPS);
        assertEq(escrow.minTraderBond(), MIN_BOND);
    }

    function test_constructor_rejectsAbsurdMinBond() public {
        vm.expectRevert(abi.encodeWithSelector(PeetopeeEscrowV2.BondTooHigh.selector, 100_000e6));
        new PeetopeeEscrowV2(USDC_ADDR, admin, treasury, FEE_BPS, 100_001e6);
    }

    // ── bonds ───────────────────────────────────────────────────────────────

    function test_bond_requiredToTakeTrades() public {
        _register(stranger, "NG");
        usdc.mint(seller, 100e6);
        vm.startPrank(seller);
        usdc.approve(address(escrow), 100e6);
        vm.expectRevert(abi.encodeWithSelector(PeetopeeEscrowV2.InsufficientBond.selector, MIN_BOND, 0));
        escrow.createTrade(stranger, 100e6, 158_000e6, "0xhash");
        vm.stopPrank();
    }

    function test_bond_depositIsHeldByEscrow() public view {
        assertEq(escrow.getTraderProfile(trader).bond, MIN_BOND);
        assertEq(usdc.balanceOf(address(escrow)), MIN_BOND);
    }

    function test_bond_onlyRegisteredTraders() public {
        usdc.mint(stranger, 10e6);
        vm.startPrank(stranger);
        usdc.approve(address(escrow), 10e6);
        vm.expectRevert(PeetopeeEscrowV2.TraderNotRegistered.selector);
        escrow.depositBond(10e6);
        vm.stopPrank();
    }

    function test_bond_cannotDropBelowMinimumWithOpenTrades() public {
        _bond(trader, 20e6); // bond = 70
        _trade(100e6);
        vm.prank(trader);
        vm.expectRevert(PeetopeeEscrowV2.BondLocked.selector);
        escrow.withdrawBond(21e6); // would leave 49 < 50
        vm.prank(trader);
        escrow.withdrawBond(20e6); // leaves exactly 50: ok
        assertEq(escrow.getTraderProfile(trader).bond, MIN_BOND);
    }

    function test_bond_fullWithdrawWhenNoOpenTrades() public {
        uint256 id = _trade(100e6);
        vm.prank(trader);
        escrow.markFiatSent(id);
        vm.prank(seller);
        escrow.confirmReceived(id);
        vm.prank(trader);
        escrow.withdrawBond(MIN_BOND);
        assertEq(escrow.getTraderProfile(trader).bond, 0);
        assertEq(usdc.balanceOf(trader), MIN_BOND + 100e6 - (100e6 * FEE_BPS) / 10_000);
    }

    function test_bond_cannotWithdrawMoreThanBond() public {
        vm.prank(trader);
        vm.expectRevert(PeetopeeEscrowV2.InvalidAmount.selector);
        escrow.withdrawBond(MIN_BOND + 1);
    }

    // ── happy path & fee snapshot ───────────────────────────────────────────

    function test_trade_completes_andPaysFeeFixedAtCreation() public {
        uint256 id = _trade(200e6);
        vm.prank(admin);
        escrow.setPlatformFee(500); // raised to 5% after the trade was created
        vm.prank(trader);
        escrow.markFiatSent(id);
        vm.prank(seller);
        escrow.confirmReceived(id);
        uint256 fee = (200e6 * FEE_BPS) / 10_000; // still 0.5%
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(usdc.balanceOf(trader), 200e6 - fee);
        PeetopeeEscrowV2.TraderProfile memory p = escrow.getTraderProfile(trader);
        assertEq(p.openTrades, 0);
        assertEq(p.completedTrades, 1);
    }

    function test_trade_cannotTradeWithYourself() public {
        _bond(trader, 0 + 1); // keep bonded
        usdc.mint(trader, 100e6);
        vm.startPrank(trader);
        usdc.approve(address(escrow), 100e6);
        vm.expectRevert(PeetopeeEscrowV2.SelfTrade.selector);
        escrow.createTrade(trader, 100e6, 158_000e6, "0xhash");
        vm.stopPrank();
    }

    // ── confirm window ──────────────────────────────────────────────────────

    function test_claim_afterSellerGoesSilent() public {
        uint256 id = _trade(100e6);
        vm.prank(trader);
        escrow.markFiatSent(id);

        vm.warp(block.timestamp + escrow.CONFIRM_WINDOW());
        vm.prank(trader);
        vm.expectRevert(PeetopeeEscrowV2.ConfirmWindowOpen.selector);
        escrow.claimAfterConfirmWindow(id);

        vm.warp(block.timestamp + 1);
        vm.prank(trader);
        escrow.claimAfterConfirmWindow(id);
        assertEq(uint8(escrow.getTrade(id).status), uint8(PeetopeeEscrowV2.TradeStatus.Completed));
        assertEq(usdc.balanceOf(trader), 100e6 - (100e6 * FEE_BPS) / 10_000);
    }

    function test_claim_blockedOnceSellerDisputes() public {
        uint256 id = _trade(100e6);
        vm.prank(trader);
        escrow.markFiatSent(id);
        vm.prank(seller);
        escrow.openDispute(id);
        vm.warp(block.timestamp + 3 days);
        vm.prank(trader);
        vm.expectRevert(PeetopeeEscrowV2.InvalidTradeStatus.selector);
        escrow.claimAfterConfirmWindow(id);
    }

    function test_claim_onlyTrader() public {
        uint256 id = _trade(100e6);
        vm.prank(trader);
        escrow.markFiatSent(id);
        vm.warp(block.timestamp + 3 days);
        vm.prank(stranger);
        vm.expectRevert(PeetopeeEscrowV2.NotTrader.selector);
        escrow.claimAfterConfirmWindow(id);
    }

    // ── disputes & slashing ─────────────────────────────────────────────────

    function test_dispute_refundWithSlashCompensatesSeller() public {
        _bond(trader, 50e6); // bond = 100
        uint256 id = _trade(100e6);
        vm.prank(trader);
        escrow.markFiatSent(id);
        vm.prank(seller);
        escrow.openDispute(id);

        vm.prank(admin);
        escrow.resolveDispute(id, false, 30e6);

        assertEq(usdc.balanceOf(seller), 130e6);
        PeetopeeEscrowV2.TraderProfile memory p = escrow.getTraderProfile(trader);
        assertEq(p.bond, 70e6);
        assertEq(p.openTrades, 0);
    }

    function test_dispute_slashIsCappedAtBond() public {
        uint256 id = _trade(100e6);
        vm.prank(seller);
        escrow.openDispute(id);
        vm.prank(admin);
        escrow.resolveDispute(id, false, 1_000e6);
        assertEq(usdc.balanceOf(seller), 100e6 + MIN_BOND);
        assertEq(escrow.getTraderProfile(trader).bond, 0);
    }

    function test_dispute_releaseToTrader_cannotSlash() public {
        uint256 id = _trade(100e6);
        vm.prank(trader);
        escrow.openDispute(id);
        vm.prank(admin);
        vm.expectRevert(PeetopeeEscrowV2.InvalidAmount.selector);
        escrow.resolveDispute(id, true, 1);
        vm.prank(admin);
        escrow.resolveDispute(id, true, 0);
        assertEq(usdc.balanceOf(trader), 100e6 - (100e6 * FEE_BPS) / 10_000);
    }

    function test_dispute_onlyAdminResolves() public {
        uint256 id = _trade(100e6);
        vm.prank(seller);
        escrow.openDispute(id);
        vm.prank(stranger);
        vm.expectRevert(PeetopeeEscrowV2.Unauthorized.selector);
        escrow.resolveDispute(id, false, 0);
    }

    function test_slashedTraderCannotTakeNewTradesUntilTopUp() public {
        uint256 id = _trade(100e6);
        vm.prank(seller);
        escrow.openDispute(id);
        vm.prank(admin);
        escrow.resolveDispute(id, false, 10e6);

        usdc.mint(seller, 100e6);
        vm.startPrank(seller);
        usdc.approve(address(escrow), 100e6);
        vm.expectRevert(abi.encodeWithSelector(PeetopeeEscrowV2.InsufficientBond.selector, MIN_BOND, 40e6));
        escrow.createTrade(trader, 100e6, 158_000e6, "0xhash");
        vm.stopPrank();

        _bond(trader, 10e6);
        _trade(100e6);
    }

    // ── cancel ──────────────────────────────────────────────────────────────

    function test_cancel_afterExpiry_refundsAndFreesSlot() public {
        uint256 id = _trade(100e6);
        vm.warp(block.timestamp + escrow.TRADE_EXPIRY());
        vm.prank(seller);
        escrow.cancelTrade(id);
        assertEq(usdc.balanceOf(seller), 100e6);
        assertEq(escrow.getTraderProfile(trader).openTrades, 0);
    }

    // ── ratings ─────────────────────────────────────────────────────────────

    function test_rating_countIsSeparateFromCompletedTrades() public {
        uint256 a = _trade(100e6);
        uint256 b = _trade(100e6);
        vm.startPrank(trader);
        escrow.markFiatSent(a);
        escrow.markFiatSent(b);
        vm.stopPrank();
        vm.startPrank(seller);
        escrow.confirmReceived(a);
        escrow.confirmReceived(b);
        escrow.rateTrader(a, 4);
        vm.stopPrank();
        PeetopeeEscrowV2.TraderProfile memory p = escrow.getTraderProfile(trader);
        assertEq(p.completedTrades, 2);
        assertEq(p.ratingCount, 1);
        assertEq(p.totalRatingPoints, 4);
    }

    // ── country lists ───────────────────────────────────────────────────────

    function test_changingCountry_movesTraderBetweenLists() public {
        _register(stranger, "NG");
        assertEq(escrow.getTradersByCountry("NG").length, 2);

        vm.prank(trader);
        escrow.updateTraderProfile("GH", "GHS", 15e6, 10e6, 1_000e6, "Mobile Money");

        address[] memory ng = escrow.getTradersByCountry("NG");
        address[] memory gh = escrow.getTradersByCountry("GH");
        assertEq(ng.length, 1);
        assertEq(ng[0], stranger);
        assertEq(gh.length, 1);
        assertEq(gh[0], trader);

        // moving back works too, and updating without a country change doesn't duplicate
        vm.startPrank(trader);
        escrow.updateTraderProfile("NG", "NGN", RATE, 10e6, 1_000e6, "Bank Transfer");
        escrow.updateTraderProfile("NG", "NGN", RATE + 1, 10e6, 1_000e6, "Bank Transfer");
        vm.stopPrank();
        assertEq(escrow.getTradersByCountry("NG").length, 2);
        assertEq(escrow.getTradersByCountry("GH").length, 0);
    }

    // ── admin ───────────────────────────────────────────────────────────────

    function test_admin_setMinBond() public {
        vm.prank(admin);
        escrow.setMinTraderBond(0);
        assertEq(escrow.minTraderBond(), 0);
        vm.prank(stranger);
        vm.expectRevert(PeetopeeEscrowV2.Unauthorized.selector);
        escrow.setMinTraderBond(1);
    }
}

// ── invariant: escrow balance == open trades + bonds ──────────────────────────

contract V2Handler is Test {
    PeetopeeEscrowV2 internal escrow;
    MockERC20 internal usdc;
    address internal admin;
    address internal seller;
    address[] internal traders;

    uint256 public ghostOpen;      // USDC locked in Created/FiatSent/Disputed trades
    uint256[] internal open;

    constructor(PeetopeeEscrowV2 _e, MockERC20 _u, address _admin, address _seller, address[] memory _traders) {
        escrow = _e; usdc = _u; admin = _admin; seller = _seller; traders = _traders;
    }

    function _trader(uint256 s) internal view returns (address) { return traders[s % traders.length]; }

    function deposit(uint256 s, uint256 amt) external {
        address t = _trader(s);
        amt = bound(amt, 1, 500e6);
        usdc.mint(t, amt);
        vm.startPrank(t);
        usdc.approve(address(escrow), amt);
        escrow.depositBond(amt);
        vm.stopPrank();
    }

    function withdraw(uint256 s, uint256 amt) external {
        address t = _trader(s);
        uint256 bond = escrow.getTraderProfile(t).bond;
        if (bond == 0) return;
        amt = bound(amt, 1, bond);
        vm.prank(t);
        try escrow.withdrawBond(amt) {} catch {}
    }

    function create(uint256 s, uint256 amt) external {
        address t = _trader(s);
        amt = bound(amt, 10e6, 1_000e6);
        usdc.mint(seller, amt);
        vm.startPrank(seller);
        usdc.approve(address(escrow), amt);
        try escrow.createTrade(t, amt, amt, "0xhash") returns (uint256 id) {
            open.push(id);
            ghostOpen += amt;
        } catch {}
        vm.stopPrank();
    }

    function act(uint256 pick, uint8 action, uint256 slash) external {
        if (open.length == 0) return;
        uint256 i = pick % open.length;
        uint256 id = open[i];
        PeetopeeEscrowV2.Trade memory t = escrow.getTrade(id);
        bool closed;
        action = action % 6;
        if (action == 0) { vm.prank(t.trader); try escrow.markFiatSent(id) {} catch {} }
        else if (action == 1) { vm.prank(seller); try escrow.confirmReceived(id) { closed = true; } catch {} }
        else if (action == 2) { vm.prank(seller); try escrow.openDispute(id) {} catch {} }
        else if (action == 3) { vm.prank(admin); try escrow.resolveDispute(id, false, bound(slash, 0, 2_000e6)) { closed = true; } catch {} }
        else if (action == 4) { vm.prank(admin); try escrow.resolveDispute(id, true, 0) { closed = true; } catch {} }
        else { vm.warp(block.timestamp + 3 days); vm.prank(t.trader); try escrow.claimAfterConfirmWindow(id) { closed = true; } catch {
            vm.prank(seller); try escrow.cancelTrade(id) { closed = true; } catch {} } }
        if (closed) {
            ghostOpen -= t.usdcAmount;
            open[i] = open[open.length - 1];
            open.pop();
        }
    }

    function totalBonds() external view returns (uint256 sum) {
        for (uint256 i; i < traders.length; i++) sum += escrow.getTraderProfile(traders[i]).bond;
    }

    function openTradesFor(address t) external view returns (uint256 n) {
        for (uint256 i; i < open.length; i++) if (escrow.getTrade(open[i]).trader == t) n++;
    }

    function traderList() external view returns (address[] memory) { return traders; }
}

contract PeetopeeEscrowV2InvariantTest is V2Base {
    V2Handler internal handler;

    function setUp() public {
        _deploy();
        address[] memory ts = new address[](3);
        ts[0] = makeAddr("t0"); ts[1] = makeAddr("t1"); ts[2] = makeAddr("t2");
        for (uint256 i; i < ts.length; i++) { _register(ts[i], "NG"); _bond(ts[i], MIN_BOND); }
        handler = new V2Handler(escrow, usdc, admin, seller, ts);
        targetContract(address(handler));
    }

    /// Every USDC the escrow holds belongs to an open trade or a trader bond — no more, no less.
    function invariant_balanceEqualsOpenTradesPlusBonds() public view {
        assertEq(usdc.balanceOf(address(escrow)), handler.ghostOpen() + handler.totalBonds());
    }

    /// The contract's open-trade counters match reality.
    function invariant_openTradeCounters() public view {
        address[] memory ts = handler.traderList();
        for (uint256 i; i < ts.length; i++) {
            assertEq(escrow.getTraderProfile(ts[i]).openTrades, handler.openTradesFor(ts[i]));
        }
    }
}
