// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PeetopeeNaira} from "../PeetopeeNaira.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract PeetopeeNairaTest is Test {
    uint256 internal constant RATE = 1_500e6; // ₦1,500 per USDC
    uint256 internal constant SPREAD = 100; // 1%
    uint256 internal constant FAUCET = 20_000e6; // ₦20,000

    PeetopeeNaira internal ngn;
    MockERC20 internal usdc;
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        ngn = new PeetopeeNaira(address(usdc), admin, RATE, SPREAD, FAUCET);
        vm.warp(1_700_000_000);
    }

    function _buy(address who, uint256 usdcAmount) internal returns (uint256) {
        usdc.mint(who, usdcAmount);
        vm.startPrank(who);
        usdc.approve(address(ngn), usdcAmount);
        uint256 got = ngn.buyWithUsdc(usdcAmount);
        vm.stopPrank();
        return got;
    }

    function test_metadata() public view {
        assertEq(ngn.decimals(), 6);
        assertEq(ngn.symbol(), "tNGN");
        assertEq(ngn.admin(), admin);
    }

    function test_constructor_rejectsBadArgs() public {
        vm.expectRevert(PeetopeeNaira.ZeroAddress.selector);
        new PeetopeeNaira(address(0), admin, RATE, SPREAD, 0);
        vm.expectRevert(PeetopeeNaira.BadRate.selector);
        new PeetopeeNaira(address(usdc), admin, 0, SPREAD, 0);
        vm.expectRevert(PeetopeeNaira.BadRate.selector);
        new PeetopeeNaira(address(usdc), admin, RATE, 301, 0);
    }

    function test_buy_mintsAtRateMinusSpread() public {
        uint256 got = _buy(alice, 10e6); // 10 USDC
        assertEq(got, 14_850e6); // 10 * 1500 * 0.99
        assertEq(ngn.balanceOf(alice), got);
        assertEq(usdc.balanceOf(address(ngn)), 10e6);
    }

    function test_buy_zeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(PeetopeeNaira.ZeroAmount.selector);
        ngn.buyWithUsdc(0);
    }

    function test_sell_paysFromReserve() public {
        _buy(alice, 10e6);
        vm.prank(alice);
        uint256 out = ngn.sellForUsdc(1_515e6); // ₦1,515 at 1500*1.01 = 1 USDC
        assertEq(out, 1e6);
        assertEq(usdc.balanceOf(alice), 1e6);
        assertEq(ngn.balanceOf(alice), 14_850e6 - 1_515e6);
    }

    function test_sell_cannotExceedReserve() public {
        vm.prank(alice);
        ngn.faucet(); // unbacked test naira
        vm.prank(alice);
        vm.expectRevert(PeetopeeNaira.ReserveTooLow.selector);
        ngn.sellForUsdc(FAUCET);
    }

    function test_roundTrip_neverProfits(uint96 usdcIn) public {
        uint256 amount = bound(uint256(usdcIn), 1e6, 1_000_000e6);
        uint256 naira = _buy(alice, amount);
        vm.prank(alice);
        uint256 back = ngn.sellForUsdc(naira);
        assertLe(back, amount);
    }

    function test_transfer_byHandle() public {
        _buy(alice, 10e6);
        vm.prank(alice);
        ngn.transfer(bob, 5_000e6);
        assertEq(ngn.balanceOf(bob), 5_000e6);
    }

    function test_payout_burnsAndRecords() public {
        _buy(alice, 10e6);
        bytes32 ref = keccak256("Bank: OPay\nAccount number: 0123456789\nAccount name: Bob");
        vm.expectEmit(true, true, false, true);
        emit PeetopeeNaira.PayoutRequested(1, alice, 5_000e6, 0, ref);
        vm.prank(alice);
        uint256 id = ngn.requestPayout(5_000e6, 0, ref);
        assertEq(id, 1);
        assertEq(ngn.payoutCount(), 1);
        assertEq(ngn.balanceOf(alice), 9_850e6);
        (address from, uint256 amount, uint8 kind, bytes32 r, uint8 status, uint64 at) = ngn.getPayout(1);
        assertEq(from, alice);
        assertEq(amount, 5_000e6);
        assertEq(kind, 0);
        assertEq(r, ref);
        assertEq(status, 1);
        assertEq(at, block.timestamp);
    }

    function test_payout_validation() public {
        _buy(alice, 10e6);
        vm.startPrank(alice);
        vm.expectRevert(PeetopeeNaira.ZeroAmount.selector);
        ngn.requestPayout(0, 0, bytes32("x"));
        vm.expectRevert(PeetopeeNaira.BadKind.selector);
        ngn.requestPayout(1e6, 5, bytes32("x"));
        vm.expectRevert(PeetopeeNaira.BadRef.selector);
        ngn.requestPayout(1e6, 1, bytes32(0));
        vm.expectRevert(); // ERC20InsufficientBalance
        ngn.requestPayout(1_000_000e6, 1, bytes32("x"));
        vm.stopPrank();
    }

    function test_refund_onlyAdminOnce() public {
        _buy(alice, 10e6);
        vm.prank(alice);
        ngn.requestPayout(1_000e6, 2, bytes32("data"));

        vm.prank(alice);
        vm.expectRevert(PeetopeeNaira.NotAdmin.selector);
        ngn.refundPayout(1);

        vm.prank(admin);
        ngn.refundPayout(1);
        assertEq(ngn.balanceOf(alice), 14_850e6);
        (,,,, uint8 status,) = ngn.getPayout(1);
        assertEq(status, 2);

        vm.prank(admin);
        vm.expectRevert(PeetopeeNaira.NotRefundable.selector);
        ngn.refundPayout(1);
        vm.prank(admin);
        vm.expectRevert(PeetopeeNaira.UnknownPayout.selector);
        ngn.refundPayout(2);
    }

    function test_faucet_cooldownAndOff() public {
        vm.prank(alice);
        ngn.faucet();
        assertEq(ngn.balanceOf(alice), FAUCET);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PeetopeeNaira.FaucetCooldown.selector, block.timestamp + 1 days));
        ngn.faucet();
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        ngn.faucet();
        assertEq(ngn.balanceOf(alice), 2 * FAUCET);

        vm.prank(admin);
        ngn.setFaucetAmount(0);
        vm.prank(bob);
        vm.expectRevert(PeetopeeNaira.FaucetOff.selector);
        ngn.faucet();
    }

    function test_admin_setRateAndTransfer() public {
        vm.prank(alice);
        vm.expectRevert(PeetopeeNaira.NotAdmin.selector);
        ngn.setRate(1_600e6, 50);

        vm.prank(admin);
        ngn.setRate(1_600e6, 50);
        assertEq(ngn.rate(), 1_600e6);
        assertEq(ngn.spreadBps(), 50);

        vm.prank(admin);
        vm.expectRevert(PeetopeeNaira.BadRate.selector);
        ngn.setRate(1_600e6, 400);

        vm.prank(admin);
        ngn.transferAdmin(bob);
        assertEq(ngn.admin(), bob);
        vm.prank(admin);
        vm.expectRevert(PeetopeeNaira.NotAdmin.selector);
        ngn.setFaucetAmount(1);
    }

    /// The reserve always covers converting back every naira that was bought (faucet aside).
    function test_reserveCoversBoughtSupply(uint96 a, uint96 b) public {
        _buy(alice, bound(uint256(a), 1e6, 100_000e6));
        _buy(bob, bound(uint256(b), 1e6, 100_000e6));
        uint256 owed = ngn.quoteSell(ngn.totalSupply());
        assertLe(owed, usdc.balanceOf(address(ngn)));
    }
}
