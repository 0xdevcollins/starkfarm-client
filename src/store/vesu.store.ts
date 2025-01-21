import { atom } from 'jotai';
import {
  APRSplit,
  getCategoriesFromName,
  PoolInfo,
  PoolMetadata,
  PoolType,
  ProtocolAtoms2,
  StrkLendingIncentivesAtom,
} from './pools';
import { AtomWithQueryResult } from 'jotai-tanstack-query';
import { IDapp } from './IDapp.store';
import { getPrice, getTokenInfoFromName } from '@/utils';
import { customAtomWithQuery } from '@/utils/customAtomWithQuery';
import MyNumber from '@/utils/MyNumber';
import { StrategyLiveStatus } from '@/strategies/IStrategy';
import fetchWithRetry from '@/utils/fetchWithRetry';

export interface VesuPool {
  id: string;
  name: string; // e.g. Genesis, Re7 xSTRK
  isVerified: boolean;
  assets: VesuAsset[];
}

interface VesuAsset {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  stats: {
    totalSupplied: {
      value: string;
      decimals: number;
    };
    totalDebt: {
      value: string;
      decimals: number;
    };
    supplyApy: {
      value: string;
      decimals: number;
    };
    borrowApr: {
      value: string;
      decimals: number;
    };
  };
}

function bitIntToNumber(info: { value: string; decimals: number }) {
  return Number(
    new MyNumber(info.value, info.decimals).toEtherToFixedDecimals(6),
  );
}

async function getVesuPoolInfo(pool: VesuPool, asset: VesuAsset) {
  try {
    const tokenInfo = getTokenInfoFromName(asset.symbol);
    const price = await getPrice(tokenInfo);
    const tvlInToken = bitIntToNumber(asset.stats.totalSupplied);
    console.log('Vesu pool', pool, asset, price, tvlInToken);
    const myPool: PoolInfo = {
      pool: {
        id: `${vesu.name}_${pool.id}_${asset.symbol}`,
        name: `${asset.symbol} (${pool.name})`,
        logos: [tokenInfo.logo],
      },
      protocol: {
        name: vesu.name,
        link: vesu.link,
        logo: vesu.logo,
      },
      apr: bitIntToNumber(asset.stats.supplyApy),
      tvl: tvlInToken * price,
      aprSplits: [
        {
          apr: bitIntToNumber(asset.stats.supplyApy),
          title: 'Supply APY',
          description: '',
        },
      ],
      category: getCategoriesFromName(asset.symbol),
      type: PoolType.Lending,
      borrow: {
        apr: bitIntToNumber(asset.stats.borrowApr),
        borrowFactor: 0,
      },
      lending: {
        collateralFactor: 0,
      },
      additional: {
        tags: [StrategyLiveStatus.ACTIVE],
        isAudited: false,
        riskFactor: 0.5,
      },
    };
    return myPool;
  } catch (e) {
    console.warn('Error parsing Vesu pool', pool.name, asset.name, e);
    return null;
  }
}

export class Vesu extends IDapp<VesuPool[]> {
  name = 'Vesu';
  link = 'https://www.vesu.xyz/markets';
  logo = `https://static-assets-8zct.onrender.com/integrations/vesu/logo.png`;
  incentiveDataKey = 'Vesu';

  handleDefiSpring(pools: PoolInfo[], data: any) {
    const myData = data[this.incentiveDataKey];
    if (!myData) return [];

    return pools.map((p) => {
      // cause names are like "STRK (Genesis)"
      const symbol = p.pool.name.split(' (')[0];
      const arr = myData[symbol];
      if (arr.length === 0) return p;

      const aprSplit: APRSplit = {
        apr: arr[arr.length - 1].strk_grant_apr_nrs,
        title: 'STRK rewards',
        description: 'Starknet DeFi Spring incentives',
      };
      p.aprSplits.push(aprSplit);
      if (aprSplit.apr != 'Err') p.apr += aprSplit.apr;

      return p;
    });
  }

  getBaseAPY(
    p: PoolInfo,
    data: AtomWithQueryResult<VesuPool[], Error>,
  ): {
    baseAPY: number | 'Err';
    splitApr: APRSplit | null;
    metadata: PoolMetadata | null;
  } {
    return {
      baseAPY: 'Err',
      splitApr: null,
      metadata: null,
    };
  }

  async getBaseAPYs(): Promise<PoolInfo[]> {
    console.log('Fetching Vesu base APYs');
    const result = await fetchWithRetry('/vesu/pools').then((res) =>
      res ? res.json() : null,
    );
    if (!result) return [];
    const poolsData: VesuPool[] = result.data;

    const pools: Promise<PoolInfo | null>[] = [];
    for (let i = 0; i < poolsData.length; i++) {
      if (!poolsData[i].isVerified) continue;
      for (let j = 0; j < poolsData[i].assets.length; j++) {
        pools.push(getVesuPoolInfo(poolsData[i], poolsData[i].assets[j]));
      }
    }

    const output = await Promise.all(pools);
    console.log('Vesu pools', output);
    return output.filter((p) => p !== null);
  }
}

export const vesu = new Vesu();

const VesuAtoms: ProtocolAtoms2 = {
  baseAPRs: customAtomWithQuery({
    queryFn: async () => {
      return vesu.getBaseAPYs();
    },
    queryKey: 'vesu_base_aprs',
  }),
  pools: atom((get) => {
    const poolsInfo = get(StrkLendingIncentivesAtom);
    const empty: PoolInfo[] = [];

    if (!VesuAtoms.baseAPRs) return empty;

    const baseInfo = get(VesuAtoms.baseAPRs);

    if (baseInfo.data) {
      if (poolsInfo.data)
        return vesu.handleDefiSpring(baseInfo.data, poolsInfo.data);

      return baseInfo.data;
    }
    return empty;
  }),
};

export default VesuAtoms;
