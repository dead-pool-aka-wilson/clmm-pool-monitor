import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getMint } from "@solana/spl-token";
import * as dotenv from "dotenv";
import BN from "bn.js";
import { PoolState, PersonalPositionState, LiquidityInfo } from "./types";

dotenv.config();

const RPC_ENDPOINT =
  process.env.RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "REALQqNEomY6cQGZJUGwywTBD2UmDT32rZcNnfxQ5N2"
);
const POOL_ID = new PublicKey(
  process.env.POOL_ID || "FSmViworLwK7sTqiKf3WBtBowCQhSvVFaTt427XDevHi"
);

// Pool State account size based on IDL
const POOL_STATE_SIZE = 1544;

class ByrealLiquidityFetcher {
  private connection: Connection;

  constructor(rpcEndpoint: string) {
    this.connection = new Connection(rpcEndpoint, "confirmed");
  }

  /**
   * Format BN number with decimal places
   */
  private formatBNWithDecimals(bn: BN, decimals: number): string {
    const str = bn.toString();
    if (str.length <= decimals) {
      return "0." + str.padStart(decimals, "0");
    } else {
      return str.slice(0, -decimals) + "." + str.slice(-decimals);
    }
  }

  /**
   * Parse pool state from account data
   */
  private parsePoolState(data: Buffer): PoolState {
    let offset = 8;

    // Parse according to the PoolState structure from IDL
    const bump = [data[offset]];
    offset += 1;

    const ammConfig = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const owner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const tokenMint0 = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const tokenMint1 = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const tokenVault0 = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const tokenVault1 = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const observationKey = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const mintDecimals0 = data[offset];
    offset += 1;

    const mintDecimals1 = data[offset];
    offset += 1;

    const tickSpacing = data.readUInt16LE(offset);
    offset += 2;

    const liquidity = new BN(data.slice(offset, offset + 16), "le");
    offset += 16;

    const sqrtPriceX64 = new BN(data.slice(offset, offset + 16), "le");
    offset += 16;

    const tickCurrent = data.readInt32LE(offset);
    offset += 4;

    // Skip padding
    offset += 4;

    const feeGrowthGlobal0X64 = new BN(data.slice(offset, offset + 16), "le");
    offset += 16;

    const feeGrowthGlobal1X64 = new BN(data.slice(offset, offset + 16), "le");
    offset += 16;

    const protocolFeesToken0 = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const protocolFeesToken1 = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const swapInAmountToken0 = new BN(data.slice(offset, offset + 16), "le");
    offset += 16;

    const swapOutAmountToken1 = new BN(data.slice(offset, offset + 16), "le");
    offset += 16;

    const swapInAmountToken1 = new BN(data.slice(offset, offset + 16), "le");
    offset += 16;

    const swapOutAmountToken0 = new BN(data.slice(offset, offset + 16), "le");
    offset += 16;

    const status = data[offset];
    offset += 1;

    // Skip padding
    offset += 7;

    // For simplicity, we'll skip parsing reward infos for now
    // You can add detailed parsing if needed

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
      totalFeesToken0: new BN(0),
      totalFeesClaimedToken0: new BN(0),
      totalFeesToken1: new BN(0),
      totalFeesClaimedToken1: new BN(0),
      fundFeesToken0: new BN(0),
      fundFeesToken1: new BN(0),
      openTime: new BN(0),
      recentEpoch: new BN(0)
    };
  }

  /**
   * Calculate price from sqrt price X64
   */
  private sqrtPriceX64ToPrice(
    sqrtPriceX64: BN,
    decimals0: number,
    decimals1: number
  ): number {
    // Use BN arithmetic for precision
    const X64 = new BN(2).pow(new BN(64));
    const sqrtPrice = sqrtPriceX64.mul(new BN(10).pow(new BN(18))).div(X64);
    const price = sqrtPrice.mul(sqrtPrice).div(new BN(10).pow(new BN(18)));

    // Adjust for decimals
    const decimalAdjustment = new BN(10).pow(
      new BN(Math.abs(decimals1 - decimals0))
    );
    const adjustedPrice =
      decimals1 > decimals0
        ? price.mul(decimalAdjustment)
        : price.div(decimalAdjustment);

    return parseFloat(adjustedPrice.toString()) / 1e18;
  }

  /**
   * Calculate tick from sqrt price
   */
  private sqrtPriceToTick(sqrtPriceX64: BN): number {
    const sqrtPrice = sqrtPriceX64.toNumber() / 2 ** 64;
    const tick = Math.floor(Math.log(sqrtPrice ** 2) / Math.log(1.0001));
    return tick;
  }

  /**
   * Fetch personal positions for a wallet
   */
  async fetchPersonalPositions(
    walletAddress: PublicKey
  ): Promise<PersonalPositionState[]> {
    try {
      // Find all personal position accounts for this wallet
      const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { dataSize: 384 }, // PersonalPositionState size
          {
            memcmp: {
              offset: 33, // After bump (1) + nft_mint (32)
              bytes: POOL_ID.toBase58()
            }
          }
        ]
      });

      const positions: PersonalPositionState[] = [];

      for (const account of accounts) {
        // Parse personal position data
        const data = account.account.data;
        let offset = 0;

        const bump = [data[offset]];
        offset += 1;

        const nftMint = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;

        const poolId = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;

        const tickLowerIndex = data.readInt32LE(offset);
        offset += 4;

        const tickUpperIndex = data.readInt32LE(offset);
        offset += 4;

        const liquidity = new BN(data.slice(offset, offset + 16), "le");
        offset += 16;

        positions.push({
          bump,
          nftMint,
          poolId,
          tickLowerIndex,
          tickUpperIndex,
          liquidity,
          feeGrowthInside0LastX64: new BN(0),
          feeGrowthInside1LastX64: new BN(0),
          tokenFeesOwed0: new BN(0),
          tokenFeesOwed1: new BN(0),
          rewardInfos: [],
          recentEpoch: new BN(0)
        });
      }

      return positions;
    } catch (error) {
      console.error("Error fetching personal positions:", error);
      return [];
    }
  }

  /**
   * Check if a position is active (in range)
   */
  private isPositionActive(
    tickLower: number,
    tickUpper: number,
    currentTick: number
  ): boolean {
    return currentTick >= tickLower && currentTick < tickUpper;
  }

  /**
   * Fetch pool liquidity information
   */
  async fetchPoolLiquidity(): Promise<LiquidityInfo> {
    try {
      console.log("🔍 Fetching Byreal CLMM pool info...");
      console.log(`Pool ID: ${POOL_ID.toBase58()}`);

      // Fetch pool state account
      const poolAccount = await this.connection.getAccountInfo(POOL_ID);

      if (!poolAccount) {
        throw new Error("Pool account not found");
      }

      // Parse pool state
      const poolState = this.parsePoolState(poolAccount.data);
      console.log(poolState);

      // Fetch token vault accounts
      const [vault0Account, vault1Account] = await Promise.all([
        getAccount(this.connection, poolState.tokenVault0),
        getAccount(this.connection, poolState.tokenVault1)
      ]);

      // Calculate amounts
      const amount0 = new BN(vault0Account.amount.toString());
      const amount1 = new BN(vault1Account.amount.toString());

      // Calculate price
      const currentPrice = this.sqrtPriceX64ToPrice(
        poolState.sqrtPriceX64,
        poolState.mintDecimals0,
        poolState.mintDecimals1
      );

      // Calculate TVL using BN arithmetic
      const decimals0BN = new BN(10).pow(new BN(poolState.mintDecimals0));
      const decimals1BN = new BN(10).pow(new BN(poolState.mintDecimals1));
      const priceBN = new BN(Math.floor(currentPrice * 1e6));

      const amount0Normalized = amount0.mul(new BN(1e6)).div(decimals0BN);
      const amount1Normalized = amount1.mul(new BN(1e6)).div(decimals1BN);
      const amount1Value = amount1Normalized.mul(priceBN).div(new BN(1e6));

      const tvlBN = amount0Normalized.add(amount1Value);
      const tvl = parseFloat(tvlBN.toString()) / 1e6;

      // Get personal positions if wallet is configured
      let personalPositions: any[] = [];
      if (process.env.WALLET_PRIVATE_KEY) {
        // Parse wallet and fetch positions
        // Note: In production, handle private key more securely
        console.log("Fetching personal positions...");
        // Implementation would go here
      }

      const result: LiquidityInfo = {
        poolAddress: POOL_ID.toBase58(),
        currentPrice,
        currentTick: poolState.tickCurrent,
        tvl,
        totalLiquidity: poolState.liquidity.toString(),
        token0: {
          mint: poolState.tokenMint0.toBase58(),
          decimals: poolState.mintDecimals0,
          amount: amount0
        },
        token1: {
          mint: poolState.tokenMint1.toBase58(),
          decimals: poolState.mintDecimals1,
          amount: amount1
        },
        personalPositions
      };

      return result;
    } catch (error) {
      console.error("Error fetching pool liquidity:", error);
      throw error;
    }
  }

  /**
   * Display pool information
   */
  displayPoolInfo(info: LiquidityInfo): void {
    console.log("\n📊 === Byreal CLMM Pool Information ===\n");
    console.log(`🏊 Pool Address: ${info.poolAddress}`);
    console.log(`💰 Current Price: ${info.currentPrice.toFixed(6)}`);
    console.log(`📍 Current Tick: ${info.currentTick}`);
    console.log(`💎 TVL: $${info.tvl.toFixed(2)}`);
    console.log(`💧 Total Liquidity: ${info.totalLiquidity}`);

    console.log("\n🪙 Token 0:");
    console.log(`  Mint: ${info.token0.mint}`);
    console.log(
      `  Amount: ${this.formatBNWithDecimals(info.token0.amount, 9)}`
    );
    console.log(`  Decimals: ${info.token0.decimals}`);

    console.log("\n🪙 Token 1:");
    console.log(`  Mint: ${info.token1.mint}`);
    console.log(
      `  Amount: ${this.formatBNWithDecimals(info.token1.amount, 9)}`
    );
    console.log(`  Decimals: ${info.token1.decimals}`);

    if (info.personalPositions && info.personalPositions.length > 0) {
      console.log("\n👤 Personal Positions:");
      info.personalPositions.forEach((pos: any, index: number) => {
        console.log(`  Position #${index + 1}:`);
        console.log(`    Liquidity: ${pos.liquidity}`);
        console.log(`    Range: [${pos.tickLower}, ${pos.tickUpper}]`);
        console.log(`    Active: ${pos.isActive ? "✅" : "❌"}`);
      });
    }
  }
}

// Main execution
async function main() {
  try {
    const fetcher = new ByrealLiquidityFetcher(RPC_ENDPOINT);

    // Fetch pool liquidity information
    const poolInfo = await fetcher.fetchPoolLiquidity();

    // Display the information
    fetcher.displayPoolInfo(poolInfo);
  } catch (error) {
    console.error("Error in main:", error);
    process.exit(1);
  }
}

// Run the program
main();
