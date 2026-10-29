// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PeetopeeNaira} from "../PeetopeeNaira.sol";

/// Deploy the testnet naira account token on Arc Testnet.
/// (The app can also deploy it itself from the #admin page → Naira.)
///   ADMIN        address that sets the rate and refunds failed payouts (your Peetopee Funds address)
///   RATE         naira per USDC scaled 1e6 (1500000000 = ₦1,500)
///   SPREAD_BPS   conversion spread (100 = 1%)
///   FAUCET       test naira per faucet claim, 6 decimals (20000000000 = ₦20,000); 0 = off
contract DeployNaira is Script {
    function run() external returns (PeetopeeNaira naira) {
        address admin = vm.envAddress("ADMIN");
        uint256 rate = vm.envOr("RATE", uint256(1_500e6));
        uint256 spread = vm.envOr("SPREAD_BPS", uint256(100));
        uint256 faucetAmount = vm.envOr("FAUCET", uint256(20_000e6));
        vm.startBroadcast();
        naira = new PeetopeeNaira(0x3600000000000000000000000000000000000000, admin, rate, spread, faucetAmount);
        vm.stopBroadcast();
        console2.log("PeetopeeNaira deployed at", address(naira));
    }
}
