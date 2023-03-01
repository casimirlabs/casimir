import minimist from 'minimist'
import { CommandArgs } from '../interfaces/CommandArgs'
import { camelCase } from '@casimir/string-helpers'
import { SSV } from './ssv'
import { CLIOutput } from '../interfaces/CLIOutput'


export class CLI {
    async run() {
        const { command, args } = this.getCommandArgs()

        if (!command || !Object.keys(this.commands).includes(command)) {
            throw new Error('No valid command provided')
        }

        return await this.commands[command](args) as CLIOutput
    }

    commands = {
        createValidator: async (args: CommandArgs) => {
            console.log('@casimir/keys CLI')
            console.log('Running keys create-validator')
            console.log('\tArgs:', args)

            const { dkgServiceUrl, operatorIds, withdrawalAddress } = args
            const ssv = new SSV({ dkgServiceUrl })
            const validator = await ssv.createValidator({ operatorIds, withdrawalAddress })
            return { status: 200, validator }
        },
        help: () => {
            console.log('@casimir/keys CLI')
            console.log('Usage: keys <command> [options]')
            console.log('Commands:')
            console.log('\tcreate-validator')
            console.log('\t\t--dkgServiceUrl')
            console.log('\t\t--operatorIds')
            console.log('\t\t--withdrawalAddress')

            console.log('\thelp')

            return { status: 200 }
        }
    }

    getCommandArgs() {
        const argv = minimist(process.argv.slice(2))
        const command = camelCase(argv._[0]) as keyof CLI['commands']
        const dkgServiceUrl = argv?.dkgServiceUrl || process.env.DKG_SERVICE_URL || 'http://0.0.0.0:8000'
        const operatorIds = argv?.operatorIds?.split(',').map((id: string) => parseInt(id)) || process.env.OPERATOR_IDS?.split(',').map(id => parseInt(id)) || [1, 2, 3, 4]
        const withdrawalAddress = argv?.withdrawalAddress || process.env.WITHDRAWAL_ADDRESS || '0x07e05700cb4e946ba50244e27f01805354cd8ef0'
        const args = { dkgServiceUrl, operatorIds, withdrawalAddress }
        return { command, args }
    }
}