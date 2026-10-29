// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PeetopeeEscrowV2} from "../PeetopeeEscrowV2.sol";

/// Deploy PeetopeeEscrowV2 on Arc Testnet.
///   ADMIN       address that resolves disputes (your Peetopee Funds address)
///   TREASURY    address that receives platform fees
///   FEE_BPS     platform fee in basis points (50 = 0.5%)
///   MIN_BOND    minimum trader bond in USDC base units (50000000 = 50 USDC)
contract DeployEscrowV2 is Script {
    function run() external returns (PeetopeeEscrowV2 escrow) {
        address admin = vm.envAddress("ADMIN");
        address treasury = vm.envAddress("TREASURY");
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(50));
        uint256 minBond = vm.envOr("MIN_BOND", uint256(50e6));
        vm.startBroadcast();
        escrow = new PeetopeeEscrowV2(0x3600000000000000000000000000000000000000, admin, treasury, feeBps, minBond);
        vm.stopBroadcast();
        console2.log("PeetopeeEscrowV2 deployed at", address(escrow));
    }
}
