"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPoolInfo = fetchPoolInfo;
exports.displayPoolInfo = displayPoolInfo;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bn_js_1 = __importDefault(require("bn.js"));
const tickToPrice_1 = require("./tickToPrice");
const bnUtils_1 = require("./bnUtils");
// Pool State account size
const POOL_STATE_SIZE = 1544;
/**
 * Parse pool state from account data
 */
function parsePoolState(data) {
    let offset = 8; // Skip discriminator
    const bump = [data[offset]];
    offset += 1;
    const ammConfig = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const owner = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const tokenMint0 = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const tokenMint1 = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const tokenVault0 = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const tokenVault1 = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const observationKey = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const mintDecimals0 = data[offset];
    offset += 1;
    const mintDecimals1 = data[offset];
    offset += 1;
    const tickSpacing = data.readUInt16LE(offset);
    offset += 2;
    const liquidity = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const sqrtPriceX64 = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const tickCurrent = data.readInt32LE(offset);
    offset += 4;
    // Skip padding (4 bytes)
    offset += 4;
    const feeGrowthGlobal0X64 = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const feeGrowthGlobal1X64 = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const protocolFeesToken0 = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    const protocolFeesToken1 = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    const swapInAmountToken0 = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const swapOutAmountToken1 = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const swapInAmountToken1 = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const swapOutAmountToken0 = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const status = data[offset];
    offset += 1;
    // Skip padding (7 bytes)
    offset += 7;
    // Skip reward infos for now (3 * 184 bytes = 552 bytes)
    offset += 552;
    // Skip tick array bitmap (16 * 8 = 128 bytes)
    offset += 128;
    const totalFeesToken0 = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    const totalFeesClaimedToken0 = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    const totalFeesToken1 = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    const totalFeesClaimedToken1 = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    const fundFeesToken0 = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    const fundFeesToken1 = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    const openTime = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    const recentEpoch = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    return {
        bump,
        ammConfig,
        owner,
        tokenMint0,
        tokenMint1,
        tokenVault0,
        tokenVault1,
        observationKey,
        mintDecimals0,
        mintDecimals1,
        tickSpacing,
        liquidity,
        sqrtPriceX64,
        tickCurrent,
        feeGrowthGlobal0X64,
        feeGrowthGlobal1X64,
        protocolFeesToken0,
        protocolFeesToken1,
        swapInAmountToken0,
        swapOutAmountToken1,
        swapInAmountToken1,
        swapOutAmountToken0,
        status,
        rewardInfos: [],
        totalFeesToken0,
        totalFeesClaimedToken0,
        totalFeesToken1,
        totalFeesClaimedToken1,
        fundFeesToken0,
        fundFeesToken1,
        openTime,
        recentEpoch
    };
}
/**
 * Format BN with decimals - REMOVED (use from bnUtils instead)
 */
// Removed - now imported from bnUtils
/**
 * Fetch pool information
 */
function fetchPoolInfo(connection, poolId) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("🔍 Fetching pool information...");
        console.log(`   Pool ID: ${poolId.toBase58()}`);
        // Fetch pool state account
        const poolAccount = yield connection.getAccountInfo(poolId);
        if (!poolAccount) {
            throw new Error("Pool account not found");
        }
        // Parse pool state
        const poolState = parsePoolState(poolAccount.data);
        // Fetch token vault balances
        const [vault0Account, vault1Account] = yield Promise.all([
            (0, spl_token_1.getAccount)(connection, poolState.tokenVault0),
            (0, spl_token_1.getAccount)(connection, poolState.tokenVault1)
        ]);
        const amount0 = new bn_js_1.default(vault0Account.amount.toString());
        const amount1 = new bn_js_1.default(vault1Account.amount.toString());
        // Calculate current price (returns string)
        const currentPrice = (0, tickToPrice_1.sqrtPriceX64ToPrice)(poolState.sqrtPriceX64, poolState.mintDecimals0, poolState.mintDecimals1);
        // Calculate TVL using BN throughout
        // Assuming 1 SOL = $100 for TVL calculation (you should use real price oracle)
        const SOL_PRICE_USD = new bn_js_1.default(100);
        const PRECISION = new bn_js_1.default(1e9); // 9 decimals precision
        // Convert amounts to human-readable values (considering 9 decimals)
        const amount0InSOL = amount0; // Already in lamports
        const amount1InTokens = amount1; // Already in smallest unit
        // Calculate token1 value in SOL
        const currentPriceBN = new bn_js_1.default(parseFloat(currentPrice) * 1e9); // Convert price to BN with 9 decimals
        const amount1InSOL = amount1InTokens.mul(PRECISION).div(currentPriceBN);
        // Total value in SOL
        const totalSOL = amount0InSOL.add(amount1InSOL);
        // Convert to USD (multiply by SOL price)
        const tvlInLamports = totalSOL.mul(SOL_PRICE_USD);
        const tvl = (0, bnUtils_1.addDecimalPoint)(tvlInLamports, 9); // 9 decimals for lamports
        return {
            poolAddress: poolId.toBase58(),
            poolState,
            currentPrice,
            currentTick: poolState.tickCurrent,
            tvl,
            totalLiquidity: poolState.liquidity.toString(),
            token0: {
                mint: poolState.tokenMint0.toBase58(),
                decimals: poolState.mintDecimals0,
                amount: amount0,
                vault: poolState.tokenVault0.toBase58()
            },
            token1: {
                mint: poolState.tokenMint1.toBase58(),
                decimals: poolState.mintDecimals1,
                amount: amount1,
                vault: poolState.tokenVault1.toBase58()
            },
            fees: {
                totalToken0: poolState.totalFeesToken0,
                claimedToken0: poolState.totalFeesClaimedToken0,
                totalToken1: poolState.totalFeesToken1,
                claimedToken1: poolState.totalFeesClaimedToken1,
                protocolToken0: poolState.protocolFeesToken0,
                protocolToken1: poolState.protocolFeesToken1
            },
            volume: {
                swapInToken0: poolState.swapInAmountToken0,
                swapOutToken0: poolState.swapOutAmountToken0,
                swapInToken1: poolState.swapInAmountToken1,
                swapOutToken1: poolState.swapOutAmountToken1
            }
        };
    });
}
/**
 * Display pool information
 */
function displayPoolInfo(info) {
    console.log("\n📊 === Pool Information ===");
    console.log(`\n🏊 Pool Address: ${info.poolAddress}`);
    console.log(`📈 Current Price: ${(0, tickToPrice_1.formatPrice)(info.currentPrice)} FRAGME/SOL`);
    console.log(`📍 Current Tick: ${info.currentTick}`);
    console.log(`💎 TVL: ${(0, tickToPrice_1.formatPrice)(info.tvl)}`);
    console.log(`💧 Total Liquidity: ${info.totalLiquidity}`);
    console.log(`⚙️ Status: ${info.poolState.status === 0 ? "Active" : "Paused"}`);
    console.log(`🎯 Tick Spacing: ${info.poolState.tickSpacing}`);
    console.log("\n🪙 Token 0 (SOL):");
    console.log(`   Mint: ${info.token0.mint}`);
    console.log(`   Vault: ${info.token0.vault}`);
    console.log(`   Amount: ${(0, bnUtils_1.addDecimalPoint)(info.token0.amount, info.token0.decimals)}`);
    console.log(`   Decimals: ${info.token0.decimals}`);
    console.log("\n🪙 Token 1 (FRAGME):");
    console.log(`   Mint: ${info.token1.mint}`);
    console.log(`   Vault: ${info.token1.vault}`);
    console.log(`   Amount: ${(0, bnUtils_1.addDecimalPoint)(info.token1.amount, info.token1.decimals)}`);
    console.log(`   Decimals: ${info.token1.decimals}`);
    console.log("\n💰 Fees:");
    console.log(`   Total Token0: ${(0, bnUtils_1.addDecimalPoint)(info.fees.totalToken0, info.token0.decimals)}`);
    console.log(`   Claimed Token0: ${(0, bnUtils_1.addDecimalPoint)(info.fees.claimedToken0, info.token0.decimals)}`);
    console.log(`   Total Token1: ${(0, bnUtils_1.addDecimalPoint)(info.fees.totalToken1, info.token1.decimals)}`);
    console.log(`   Claimed Token1: ${(0, bnUtils_1.addDecimalPoint)(info.fees.claimedToken1, info.token1.decimals)}`);
    console.log(`   Protocol Token0: ${(0, bnUtils_1.addDecimalPoint)(info.fees.protocolToken0, info.token0.decimals)}`);
    console.log(`   Protocol Token1: ${(0, bnUtils_1.addDecimalPoint)(info.fees.protocolToken1, info.token1.decimals)}`);
    console.log("\n📈 Volume:");
    console.log(`   Swap In Token0: ${(0, bnUtils_1.addDecimalPoint)(info.volume.swapInToken0, info.token0.decimals)}`);
    console.log(`   Swap Out Token0: ${(0, bnUtils_1.addDecimalPoint)(info.volume.swapOutToken0, info.token0.decimals)}`);
    console.log(`   Swap In Token1: ${(0, bnUtils_1.addDecimalPoint)(info.volume.swapInToken1, info.token1.decimals)}`);
    console.log(`   Swap Out Token1: ${(0, bnUtils_1.addDecimalPoint)(info.volume.swapOutToken1, info.token1.decimals)}`);
}
