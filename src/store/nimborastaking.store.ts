import CONSTANTS from '@/constants';
import { Category, PoolType } from './pools';
import { atom } from 'jotai';
import { PoolInfo, ProtocolAtoms } from './pools';
import { atomWithQuery } from 'jotai-tanstack-query';
import { StrategyLiveStatus } from '@/strategies/IStrategy';
import fetchWithRetry from '@/utils/fetchWithRetry';
import { IDapp } from './IDapp.store';

interface NimboraStakingDoc {
  name: string;
  realSymbol: string;
  symbol: string;
  incentiveKey: string;
  protocols: string[];
  points: [
    {
      protocol: string;
      multiplier: string;
      description: string;
    },
  ];
  description: string;
  token: string;
  liquid_staking: string;
  underlying: string;
  underlyingSymbol: string;
  chainlinkPriceFeedAddress: string;
  chainlinkPriceFeedDecimals: string;
  decimals: string;
  strkIncentivePer2Week: string;
  tvl: string;
  aprBreakdown: {
    base: string;
    boost: string;
    incentives: string;
  };
  underlyingPrice: string;
  apr: string;
  shareRatio: string;
  remainingDepositAvailable: string;
  totalAssets: string;
  limit: string;
  performanceFee: string;
  bucketsFullInfo: [
    {
      address: string;
      stakerName: string;
      totalAmount: string;
      allocationPercentage: number;
    },
  ];
}

export class NimboraStaking extends IDapp<NimboraStakingDoc> {
  name = 'Nimbora';
  link = 'https://app.nimbora.io/referral/?ref=u4j7y0c8';
  logo =
    'https://assets-global.website-files.com/64f0518cbb38bb59ddd7a331/64f1ea84a753c1ed93b2c920_faviconn.png';

  incentiveDataKey = 'isNimboraStaking';

  _computePoolsInfo(data: any) {
    try {
      if (!data) return [];
      const pools: PoolInfo[] = [];

      const poolData: NimboraStakingDoc = data;
      const category: Category[] = [];
      const riskFactor = 0.75;

      if (poolData.symbol === 'USDC') {
        category.push(Category.Stable);
      } else if (poolData.symbol === 'ETH') {
        category.push(Category.ETH);
      } else {
        category.push(Category.Others);
      }

      const logo =
        CONSTANTS.LOGOS[poolData.symbol as keyof typeof CONSTANTS.LOGOS];

      const baseApr = Number(poolData.aprBreakdown.base) / 100;
      const boostApr = Number(poolData.aprBreakdown.boost) / 100;
      const rewardApr = Number(poolData.aprBreakdown.incentives) / 100;

      const apr = baseApr + boostApr + rewardApr;

      const poolInfo: PoolInfo = {
        pool: {
          id: this.getPoolId(this.name, poolData.symbol),
          name: poolData.symbol,
          logos: [logo],
        },
        protocol: {
          name: this.name,
          link: this.link,
          logo: this.logo,
        },
        apr,
        tvl: Number(poolData.tvl),
        aprSplits: [
          {
            apr: baseApr ?? 0,
            title: 'Base APR',
            description: '',
          },
          {
            apr: boostApr ?? 0,
            title: 'Boost',
            description: '',
          },
          {
            apr: rewardApr ?? 0,
            title: 'STRK DeFi Spring rewards',
            description: '',
          },
        ],
        category,
        type: PoolType.Derivatives,
        lending: {
          collateralFactor: 0,
        },
        borrow: {
          borrowFactor: 0,
          apr: 0,
        },
        additional: {
          tags: [StrategyLiveStatus.ACTIVE],
          riskFactor,
          isAudited: false, // TODO: Update this
        },
      };
      pools.push(poolInfo);

      return pools;
    } catch (err) {
      console.error('Error fetching pools', err);
      throw err;
    }
  }

  commonVaultFilter(poolName: string) {
    const supportedPools = ['sSTRK'];
    return supportedPools.includes(poolName);
  }
}

export const nimboraStaking = new NimboraStaking();

export const NimboraStakingAtom = atomWithQuery((get) => ({
  queryKey: ['isNimboraStaking'],
  queryFn: async ({ queryKey }) => {
    const fetchPools = async (): Promise<NimboraStakingDoc[]> => {
      const res = await fetchWithRetry(
        CONSTANTS.NIMBORA.STAKING_APR_API,
        {},
        'Failed to fetch Nimbora Yield Dex data',
      );

      if (!res) {
        return [];
      }
      let data = await res.text();
      data = data.replaceAll('NaN', '0');
      return JSON.parse(data);
    };

    const pools = await fetchPools();
    // return pools.reduce<{ [key: string]: NimboraStakingDoc }>((acc, pool) => {
    //   acc[pool.underlyingSymbol] = pool;
    //   return acc;
    // }, {});
    return pools;
  },
}));

const NimboraStakingAtoms: ProtocolAtoms = {
  pools: atom((get) => {
    const poolsInfo = get(NimboraStakingAtom);
    console.log('nimbora', poolsInfo);
    return poolsInfo.data
      ? nimboraStaking._computePoolsInfo(poolsInfo.data)
      : [];
  }),
};

export default NimboraStakingAtoms;
