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
exports.fetchAllPoolPositions = fetchAllPoolPositions;
exports.getPositionStats = getPositionStats;
exports.analyzeOwnership = analyzeOwnership;
exports.displayPositionsSummary = displayPositionsSummary;
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = __importDefault(require("bn.js"));
const tickToPrice_1 = require("./tickToPrice");
// Personal Position State size based on discriminator(8) + structure
const PERSONAL_POSITION_STATE_SIZE = 281;
/**
 * Parse personal position state from account data
 */
function parsePersonalPosition(accountAddress, data) {
    let offset = 8; // Skip discriminator
    const bump = [data[offset]];
    offset += 1;
    const nftMint = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const poolId = new web3_js_1.PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const tickLowerIndex = data.readInt32LE(offset);
    offset += 4;
    const tickUpperIndex = data.readInt32LE(offset);
    offset += 4;
    const liquidity = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const feeGrowthInside0LastX64 = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const feeGrowthInside1LastX64 = new bn_js_1.default(data.slice(offset, offset + 16), "le");
    offset += 16;
    const tokenFeesOwed0 = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    const tokenFeesOwed1 = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    // Parse reward infos (3 rewards * 64 bytes each = 192 bytes)
    const rewardInfos = [];
    for (let i = 0; i < 3; i++) {
        const rewardGrowthInsideLastX64 = new bn_js_1.default(data.slice(offset, offset + 16), "le");
        offset += 16;
        const rewardAmountOwed = new bn_js_1.default(data.slice(offset, offset + 8), "le");
        offset += 8;
        // Skip padding (40 bytes per reward info)
        offset += 40;
        rewardInfos.push({
            rewardGrowthInsideLastX64,
            rewardAmountOwed
        });
    }
    const recentEpoch = new bn_js_1.default(data.slice(offset, offset + 8), "le");
    offset += 8;
    return {
        accountAddress,
        bump,
        nftMint,
        poolId,
        tickLowerIndex,
        tickUpperIndex,
        liquidity,
        feeGrowthInside0LastX64,
        feeGrowthInside1LastX64,
        tokenFeesOwed0,
        tokenFeesOwed1,
        rewardInfos,
        recentEpoch
    };
}
/**
 * Find NFT owner for a position
 */
function findNFTOwner(connection, nftMint) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Get the token accounts that hold this NFT
            // NFTs have supply of 1, so there should only be one holder
            const largestAccounts = yield connection.getTokenLargestAccounts(nftMint);
            if (largestAccounts.value.length === 0) {
                // console.log(`   No token accounts found for NFT ${nftMint.toBase58()}`);
                return null;
            }
            // Find the account with balance > 0
            for (const account of largestAccounts.value) {
                if (account.uiAmount && account.uiAmount > 0) {
                    try {
                        // Get the account info directly
                        const accountInfo = yield connection.getAccountInfo(account.address);
                        if (!accountInfo) {
                            continue;
                        }
                        // Check if it's a valid token account
                        // Token accounts are owned by the Token Program
                        const TOKEN_PROGRAM_ID = new web3_js_1.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
                        const TOKEN_2022_PROGRAM_ID = new web3_js_1.PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
                        if (!accountInfo.owner.equals(TOKEN_PROGRAM_ID) &&
                            !accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
                            continue;
                        }
                        // Parse the token account data manually
                        // Token account layout: mint (32) + owner (32) + amount (8) + ...
                        // We just need the owner which is at offset 32
                        if (accountInfo.data.length < 64) {
                            continue;
                        }
                        const owner = new web3_js_1.PublicKey(accountInfo.data.slice(32, 64));
                        return owner;
                    }
                    catch (innerError) {
                        // If there's an error with this specific account, try the next one
                        continue;
                    }
                }
            }
            return null;
        }
        catch (error) {
            // Silently fail for individual NFTs
            // console.error(`   Error finding owner for NFT ${nftMint.toBase58()}:`, error);
            return null;
        }
    });
}
/**
 * Batch fetch NFT owners for multiple positions
 */
function batchFetchNFTOwners(connection, positions) {
    return __awaiter(this, void 0, void 0, function* () {
        const ownerMap = new Map();
        const BATCH_SIZE = 10; // Process 10 at a time to avoid rate limits
        console.log(`\n🔍 Fetching position owners for ${positions.length} positions...`);
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < positions.length; i += BATCH_SIZE) {
            const batch = positions.slice(i, Math.min(i + BATCH_SIZE, positions.length));
            console.log(`   Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(positions.length / BATCH_SIZE)}...`);
            const ownerPromises = batch.map((pos) => __awaiter(this, void 0, void 0, function* () {
                const owner = yield findNFTOwner(connection, pos.nftMint);
                if (owner) {
                    successCount++;
                    return { nftMint: pos.nftMint.toBase58(), owner };
                }
                else {
                    failCount++;
                    return null;
                }
            }));
            const results = yield Promise.all(ownerPromises);
            results.forEach((result) => {
                if (result) {
                    ownerMap.set(result.nftMint, result.owner);
                }
            });
            // Add delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < positions.length) {
                yield new Promise((resolve) => setTimeout(resolve, 200));
            }
        }
        console.log(`   ✅ Successfully fetched ${successCount} position owners`);
        if (failCount > 0) {
            console.log(`   ⚠️ Failed to fetch ${failCount} position owners (may be burned or invalid NFTs)`);
        }
        return ownerMap;
    });
}
/**
 * Fetch all positions for a specific pool with pagination
 */
function fetchAllPoolPositions(connection_1, programId_1, poolId_1) {
    return __awaiter(this, arguments, void 0, function* (connection, programId, poolId, options = {}) {
        const { batchSize = 10, maxPositions = Number.MAX_SAFE_INTEGER, fetchOwners = true } = options;
        console.log(`\n🔍 Fetching positions for pool: ${poolId.toBase58()}`);
        console.log(`   Batch size: ${batchSize}, Max positions: ${maxPositions}`);
        console.log(`   Fetch owners: ${fetchOwners}`);
        const allPositions = [];
        let lastSignature;
        let totalFetched = 0;
        let batchNumber = 0;
        try {
            while (totalFetched < maxPositions) {
                batchNumber++;
                console.log(`\n📦 Fetching batch #${batchNumber}...`);
                // Prepare filters with correct offset and poolId bytes
                const filters = [
                    { dataSize: PERSONAL_POSITION_STATE_SIZE },
                    {
                        memcmp: {
                            offset: 41, // After discriminator (8) + bump (1) + nft_mint (32)
                            bytes: poolId.toBase58() // Pool ID as base58 string
                        }
                    }
                ];
                // Fetch accounts with proper filter
                const accounts = yield connection.getProgramAccounts(programId, {
                    dataSlice: undefined, // Get full data
                    filters
                });
                console.log(`   Positions fetched for pool: ${accounts.length}`);
                // Parse positions in this batch
                const batchPositions = accounts
                    .slice(0, Math.min(batchSize, maxPositions - totalFetched))
                    .map((account) => parsePersonalPosition(account.pubkey, account.account.data));
                if (batchPositions.length === 0) {
                    console.log("   No more positions found");
                    break;
                }
                allPositions.push(...batchPositions);
                totalFetched += batchPositions.length;
                console.log(`   Batch positions parsed: ${batchPositions.length}`);
                console.log(`   Total positions so far: ${totalFetched}`);
                // If we got fewer positions than requested, we've reached the end
                if (accounts.length < batchSize) {
                    console.log("✅ All positions fetched");
                    break;
                }
                // Add delay between batches to avoid rate limiting
                if (totalFetched < maxPositions && accounts.length >= batchSize) {
                    console.log("   Waiting 500ms before next batch...");
                    yield new Promise((resolve) => setTimeout(resolve, 500));
                }
                // For simplicity, we're fetching all at once and then slicing
                // In production, you might want to implement proper pagination
                break; // Remove this to enable multi-batch fetching
            }
            // Fetch owners for all positions if requested
            if (fetchOwners && allPositions.length > 0) {
                const ownerMap = yield batchFetchNFTOwners(connection, allPositions);
                // Add owner information to positions
                allPositions.forEach((pos) => {
                    const owner = ownerMap.get(pos.nftMint.toBase58());
                    if (owner) {
                        pos.positionOwner = owner;
                        pos.positionOwnerAddress = owner.toBase58();
                    }
                });
            }
            console.log(`\n✅ Successfully fetched ${allPositions.length} positions`);
            return allPositions;
        }
        catch (error) {
            console.error("❌ Error fetching positions:", error);
            throw error;
        }
    });
}
/**
 * Get position statistics
 */
function getPositionStats(positions, currentTick) {
    let activeCount = 0;
    let inactiveCount = 0;
    let totalLiquidity = new bn_js_1.default(0);
    positions.forEach((pos) => {
        const isActive = currentTick >= pos.tickLowerIndex && currentTick < pos.tickUpperIndex;
        if (isActive) {
            activeCount++;
        }
        else {
            inactiveCount++;
        }
        totalLiquidity = totalLiquidity.add(pos.liquidity);
    });
    return {
        total: positions.length,
        active: activeCount,
        inactive: inactiveCount,
        totalLiquidity: totalLiquidity.toString()
    };
}
/**
 * Analyze position ownership
 */
function analyzeOwnership(positions) {
    const ownerMap = new Map();
    // Aggregate by owner
    positions.forEach((pos) => {
        if (pos.positionOwnerAddress) {
            const existing = ownerMap.get(pos.positionOwnerAddress);
            if (existing) {
                existing.count++;
                existing.liquidity = existing.liquidity.add(pos.liquidity);
            }
            else {
                ownerMap.set(pos.positionOwnerAddress, {
                    count: 1,
                    liquidity: new bn_js_1.default(pos.liquidity)
                });
            }
        }
    });
    // Sort by liquidity
    const topOwners = Array.from(ownerMap.entries())
        .map(([owner, data]) => ({
        owner,
        positionCount: data.count,
        totalLiquidity: data.liquidity,
        liquidityString: data.liquidity.toString()
    }))
        .sort((a, b) => b.totalLiquidity.cmp(a.totalLiquidity))
        .slice(0, 10);
    // Create distribution map
    const ownerDistribution = new Map();
    ownerMap.forEach((data, owner) => {
        ownerDistribution.set(owner, data.count);
    });
    return {
        totalOwners: ownerMap.size,
        topOwners,
        ownerDistribution
    };
}
/**
 * Display positions summary with price ranges
 */
function displayPositionsSummary(positions, currentTick, currentSqrtPriceX64, decimals0, decimals1) {
    console.log("\n📊 === Pool Positions Summary ===");
    const stats = getPositionStats(positions, currentTick);
    console.log(`\n📈 Statistics:`);
    console.log(`   Total Positions: ${stats.total}`);
    console.log(`   Active (In Range): ${stats.active} ✅`);
    console.log(`   Inactive (Out of Range): ${stats.inactive} ❌`);
    console.log(`   Combined Liquidity: ${stats.totalLiquidity}`);
    // Analyze ownership if available
    const positionsWithOwners = positions.filter((p) => p.positionOwnerAddress);
    if (positionsWithOwners.length > 0) {
        const ownership = analyzeOwnership(positions);
        console.log(`\n👥 Ownership Analysis:`);
        console.log(`   Unique Owners: ${ownership.totalOwners}`);
        console.log(`   Avg Positions per Owner: ${(positions.length / ownership.totalOwners).toFixed(2)}`);
        if (ownership.topOwners.length > 0) {
            console.log(`\n   Top Owners by Total Liquidity:`);
            ownership.topOwners.slice(0, 5).forEach((owner, index) => {
                console.log(`   ${index + 1}. ${owner.owner}`);
                console.log(`      Positions: ${owner.positionCount}`);
                console.log(`      Total Liquidity: ${owner.liquidityString}`);
            });
        }
    }
    // Analyze liquidity distribution
    const distribution = (0, tickToPrice_1.analyzeLiquidityDistribution)(positions.map((p) => ({
        tickLowerIndex: p.tickLowerIndex,
        tickUpperIndex: p.tickUpperIndex,
        liquidity: p.liquidity
    })), decimals0, decimals1, currentTick, currentSqrtPriceX64);
    console.log(`\n💧 Liquidity Distribution:`);
    console.log(`   Active Liquidity: ${distribution.activeLiquidityString} (${distribution.activePercentage}%)`);
    console.log(`   Inactive Liquidity: ${distribution.inactiveLiquidityString} (${distribution.inactivePercentage}%)`);
    // Show top 5 positions by liquidity with price ranges
    const topPositions = [...positions]
        .sort((a, b) => b.liquidity.cmp(a.liquidity))
        .slice(0, 5);
    console.log(`\n🏆 Top 5 Positions by Liquidity:`);
    topPositions.forEach((pos, index) => {
        const priceRange = (0, tickToPrice_1.tickRangeToPriceRange)(pos.tickLowerIndex, pos.tickUpperIndex, decimals0, decimals1, currentTick, currentSqrtPriceX64);
        console.log(`\n   ${index + 1}. NFT: ${pos.nftMint.toBase58().slice(0, 8)}...`);
        if (pos.positionOwnerAddress) {
            console.log(`      Owner: ${pos.positionOwnerAddress}`);
        }
        console.log(`      Liquidity: ${pos.liquidity.toString()}`);
        console.log(`      Tick Range: [${pos.tickLowerIndex}, ${pos.tickUpperIndex}]`);
        console.log(`      Price Range: [${(0, tickToPrice_1.formatPrice)(priceRange.priceLower)}, ${(0, tickToPrice_1.formatPrice)(priceRange.priceUpper)}] FRAGME/SOL`);
        console.log(`      Status: ${priceRange.isActive ? "Active ✅" : "Inactive ❌"}`);
        if (pos.tokenFeesOwed0.gt(new bn_js_1.default(0)) || pos.tokenFeesOwed1.gt(new bn_js_1.default(0))) {
            console.log(`      Unclaimed Fees: Token0=${pos.tokenFeesOwed0.toString()}, Token1=${pos.tokenFeesOwed1.toString()}`);
        }
    });
    // Show price range distribution
    console.log(`\n📊 Price Range Distribution (Top 10 by liquidity):`);
    distribution.distributions.slice(0, 10).forEach((dist, index) => {
        console.log(`\n   ${index + 1}. Range: [${(0, tickToPrice_1.formatPrice)(dist.priceRange.priceLower)}, ${(0, tickToPrice_1.formatPrice)(dist.priceRange.priceUpper)}]`);
        console.log(`      Liquidity: ${dist.liquidityString} (${dist.percentage}%)`);
        console.log(`      Status: ${dist.priceRange.isActive ? "Active" : "Inactive"}`);
    });
}
