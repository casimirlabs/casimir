import minimist from 'minimist'
import { SSV } from './ssv'

export class CLI {
    async run() {
        const argv = minimist(process.argv.slice(2))
        const { operatorIds, validatorCount, withdrawalAddress } = argv
        const ssv = new SSV()
        const validators = await ssv.createValidators({ operatorIds, validatorCount, withdrawalAddress })
        console.log(validators)
    }
}