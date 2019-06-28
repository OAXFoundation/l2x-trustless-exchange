// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
export const mainnet = {
  chainId: 1,
  assets: {
    OAX: {
      name: 'OpenANX',
      address: '0x701C244b988a513c945973dEFA05de933b23Fe1D',
      decimals: 18
    },
    WETH: {
      name: 'Wrapped Ether',
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18
    }
  }
}

export default {
  mainnet: mainnet.assets,
  [mainnet.chainId]: mainnet.assets
}
