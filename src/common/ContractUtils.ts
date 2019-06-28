// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import R from 'ramda'
import { readFileSync } from 'fs'
import { Contract, ContractFactory, Signer, providers } from 'ethers'
import { Log } from 'ethers/providers'
import { BigNumber } from 'bignumber.js'
import { BigNumber as EthersBigNumber } from 'ethers/utils'
import fs from 'fs'
import path from 'path'
import { Amount, Address, Signature, SignatureSol } from './types/BasicTypes'
import { utils } from 'ethers'
import { D, toEthersBn } from './BigNumberUtils'
import { ERC20 } from '../contracts/wrappers/ERC20'

import { arrayify, hexlify } from 'ethers/utils'

export function contractBuildRoot() {
  let packagePath = path.join(__dirname, '.contract_build_root')
  let { dir, root, base } = path.parse(packagePath)

  while (!fs.existsSync(path.join(dir, base)) && dir !== root) {
    dir = path.dirname(dir)
  }

  return dir
}

// This should be used instead of getContractFactory in client code
export function getContractAbi(name: string): string[] {
  const abi = readFileSync(
    path.join(contractBuildRoot(), `build/contracts/${name}.abi`)
  ).toString()

  return JSON.parse(abi)
}

/**
 * Connect to a deployed contract
 *
 * @param contractAddress
 * @param contractName
 * @param signer
 */
export function getContract(
  contractAddress: Address,
  contractName: string,
  signer: Signer
): Contract {
  const abi = getContractAbi(contractName)
  return new Contract(contractAddress, abi, signer)
}

/**
 * Get a contract factory to deploy a contract
 * @param name
 * @param signer
 */
export function getContractFactory(
  name: string,
  signer: Signer
): ContractFactory {
  const abi = readFileSync(
    path.join(contractBuildRoot(), `build/contracts/${name}.abi`)
  ).toString()
  const bin = readFileSync(
    path.join(contractBuildRoot(), `build/contracts/${name}.bin`)
  ).toString()
  return new ContractFactory(abi, bin, signer)
}

/**
 * Traverse any plain object or array and produce a copy of the same object or
 * array with instance of the argument `type` transformed by the `transform`
 * function
 * @param obj The object to transform
 * @param isTargetType The type of the instances to be transform
 * @param transform The transformation function
 */
function traverseAndConvert(
  obj: any,
  isTargetType: (x: any) => boolean,
  transform: (...args: any[]) => any
): any {
  let result

  if (isTargetType(obj)) {
    result = transform(obj)
  } else if (obj instanceof Array) {
    result = obj.map(x => traverseAndConvert(x, isTargetType, transform))
  } else if (
    !R.isNil(obj) &&
    typeof obj === 'object' &&
    Reflect.getPrototypeOf(obj) === Object.prototype
  ) {
    const clonedObj = { ...obj }
    for (const key of Reflect.ownKeys(clonedObj)) {
      const prop = Reflect.get(clonedObj, key)
      const convertedProp = traverseAndConvert(prop, isTargetType, transform)
      Reflect.set(clonedObj, key, convertedProp)
    }
    result = clonedObj
  } else {
    result = obj
  }

  return result
}

export function safeBigNumberToString(obj: any): any {
  const isBigNumber = (x: any) => BigNumber.isBigNumber(x)

  return traverseAndConvert(obj, isBigNumber, (o: BigNumber) => o.toString(10))
}

/**
 * Convert any instance of Ether's BigNumber instance contained in the argument
 * to BigNumber.js
 * @param obj
 */
export function ethersBNToBigNumber(obj: any): any {
  const isEhtersBN = (x: any) => x instanceof EthersBigNumber
  return traverseAndConvert(obj, isEhtersBN, (o: EthersBigNumber) =>
    D(o.toString())
  )
}

export async function waitForMining(
  txPromise: Promise<providers.TransactionResponse>
): Promise<providers.TransactionReceipt> {
  const tx = await txPromise
  return tx.wait()
}

export function normalizeAddress(rawAddress: Address) {
  return utils.getAddress(rawAddress)
}

export function convertSigToSigSol(rawSig: Signature): SignatureSol {
  const sigAsBytes = [...arrayify(rawSig)].map(hexlify)
  return sigAsBytes
}

export async function fundToken(
  asset: Address,
  address: Address,
  amount: Amount,
  signer: Signer
): Promise<void> {
  const erc20 = getContract(asset, 'ERC20', signer) as ERC20
  const tx = await erc20.functions.transfer(address, amount.toString(10))
  await tx.wait()
}

export async function fundWETH(
  asset: Address,
  amount: Amount,
  signer: Signer
): Promise<void> {
  const tx = await signer.sendTransaction({
    to: asset,
    value: toEthersBn(amount)
  })
  await tx.wait()
}

export async function fundEther(
  address: Address,
  amount: Amount,
  signer: Signer
): Promise<void> {
  const tx = await signer.sendTransaction({
    to: address,
    value: toEthersBn(amount)
  })
  await tx.wait()
}

export function filterLogs(
  mediator: Contract,
  eventName: string,
  logs: Log[]
): Log[] {
  const eventTopics = mediator.filters[eventName]().topics || []

  return logs.filter(l => R.difference(eventTopics, l.topics).length === 0)
}
