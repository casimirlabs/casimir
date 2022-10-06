import { ethers } from 'ethers'
import { EventTableSchema } from '@casimir/data'
import { Chain, Provider } from '../index'

const BeaconDepositContract = {
	'0x00000000219ab540356cBB839Cbe05303d7705Fa': {
		abi: ['event DepositEvent (bytes pubkey, bytes withdrawal_credentials, bytes amount, bytes signature, bytes index)']
	}
}

export type EthereumServiceOptions = {
	url: string
	network?: string
	chainId?: number
}

export class EthereumService {
	chain: Chain
	network: string
    provider: ethers.providers.JsonRpcProvider
	constructor(opt: EthereumServiceOptions) {
		this.chain = Chain.Ethereum
		this.network = opt.network || 'mainnet'
		this.provider = new ethers.providers.JsonRpcProvider({
			url: opt.url,
		})
	}

	parseLog(log: ethers.providers.Log): Record<any, string> {
		const abi = BeaconDepositContract[log.address as keyof typeof BeaconDepositContract].abi
		const contractInterface = new ethers.utils.Interface(abi)
		const parsedLog = contractInterface.parseLog(log)
		const args = parsedLog.args.slice(-1 * parsedLog.eventFragment.inputs.length)

		const input: Record<string, string> = {}

		parsedLog.eventFragment.inputs.forEach((key, index) => {
			console.log('Key', key.name)
			input[key.name] = args[index]
		})
		return input
	}

	async getEvents(height: number): Promise<{ blockHash: string, events: EventTableSchema[] }> {
		const events: EventTableSchema[] = []

		const block = await this.provider.getBlockWithTransactions(height)

		events.push({
			chain: this.chain,
			network: this.network,
			provider: Provider.Casimir,
			type: 'block',
			block: block.hash,
			transaction: "",
			created_at: new Date(block.timestamp * 1000).toISOString().replace('T', ' ').replace('Z', ''),
			address: block.miner,
			height: block.number,
			to_address: "",
			validator: '',
			duration: 0,
			validator_list: [],
			amount: '0',
			auto_stake: false
		})

		if (block.transactions.length === 0) {
			return { blockHash: block.hash, events }
		}

		for await (const tx of block.transactions) {
			events.push({
				chain: this.chain,
				network: this.network,
				provider: Provider.Casimir,
				type: 'transaction',
				block: block.hash,
				transaction: tx.hash,
				created_at: new Date(block.timestamp * 1000).toISOString().replace('T', ' ').replace('Z', ''),
				address: tx.from,
				to_address: tx.to || '',
				height: block.number,
				validator: '',
				validator_list: [],
				duration: 0,
				amount: tx.value.toString(),
				auto_stake: false
			})

			const receipts = await this.provider.getTransactionReceipt(tx.hash)

			if (receipts.logs.length === 0) {
				continue
			}

			for (const log of receipts.logs) {
				if (log.address in BeaconDepositContract) {
					const parsedLog = this.parseLog(log)
					console.log(parsedLog)
					const logEvent: EventTableSchema = {
						chain: this.chain,
						network: this.network,
						provider: Provider.Casimir,
						type: 'deposit',
						block: block.hash,
						transaction: tx.hash,
						created_at: new Date(block.timestamp * 1000).toISOString().replace('T', ' ').replace('Z', ''),
						address: log.address,
						height: block.number,
						to_address: '',
						validator: '',
						duration: 0,
						validator_list: [],
						amount: parsedLog.amount.toString(),
						auto_stake: false
					}
					events.push(logEvent)
				}
			}
		}
		return {
			blockHash: block.hash,
			events,
		}
	}
	async getCurrentBlock(): Promise<ethers.providers.Block> {
		const height = await this.provider.getBlockNumber()
		return await this.provider.getBlock(height)
	}

    async getBlockWithTx(num: number): Promise<any> {
		return await this.provider.getBlockWithTransactions(num)
    }

	on(event:string, cb: (block: ethers.providers.Block) => void): void {
		this.provider.on('block', async (blockNumber: number) => {
			const block = await this.getBlockWithTx(blockNumber)
			cb(block)
		})
    }
}

export function newEthereumService (opt: EthereumServiceOptions): EthereumService {
	return new EthereumService(opt)
}