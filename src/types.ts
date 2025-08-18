import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { PersonalPosition } from "./fetchPositions";

export interface PoolState {
  bump: number[];
  ammConfig: PublicKey;
  owner: PublicKey;
  tokenMint0: PublicKey;
  tokenMint1: PublicKey;
  tokenVault0: PublicKey;
  tokenVault1: PublicKey;
  observationKey: PublicKey;
  mintDecimals0: number;
  mintDecimals1: number;
  tickSpacing: number;
  liquidity: BN;
  sqrtPriceX64: BN;
  tickCurrent: number;
  feeGrowthGlobal0X64: BN;
  feeGrowthGlobal1X64: BN;
  protocolFeesToken0: BN;
  protocolFeesToken1: BN;
  swapInAmountToken0: BN;
  swapOutAmountToken1: BN;
  swapInAmountToken1: BN;
  swapOutAmountToken0: BN;
  status: number;
  rewardInfos: any[];
  totalFeesToken0: BN;
  totalFeesClaimedToken0: BN;
  totalFeesToken1: BN;
  totalFeesClaimedToken1: BN;
  fundFeesToken0: BN;
  fundFeesToken1: BN;
  openTime: BN;
  recentEpoch: BN;
}

export interface PersonalPositionState {
  bump: number[];
  nftMint: PublicKey;
  poolId: PublicKey;
  tickLowerIndex: number;
  tickUpperIndex: number;
  liquidity: BN;
  feeGrowthInside0LastX64: BN;
  feeGrowthInside1LastX64: BN;
  tokenFeesOwed0: BN;
  tokenFeesOwed1: BN;
  rewardInfos: any[];
  recentEpoch: BN;
}

export interface LiquidityInfo {
  poolAddress: string;
  currentPrice: number;
  currentTick: number;
  tvl: number;
  totalLiquidity: string;
  token0: {
    mint: string;
    decimals: number;
    amount: BN;
  };
  token1: {
    mint: string;
    decimals: number;
    amount: BN;
  };
  personalPositions: any[]; // For wallet-specific positions
  allPoolPositions?: PersonalPosition[]; // All positions in the pool
}
