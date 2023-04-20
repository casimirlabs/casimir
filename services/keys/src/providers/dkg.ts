import { KeyGenerationInput } from '../interfaces/KeyGenerationInput'
import { Share } from '../interfaces/Share'
import { DepositData } from '../interfaces/DepositData'
import { DKGOptions } from '../interfaces/DKGOptions'
import { ReshareInput } from '../interfaces/ReshareInput'
import { retry, run } from '@casimir/helpers'

export class DKG {
    /** Key generation service URL */
    serviceUrl: string

    constructor(options: DKGOptions) {
        this.serviceUrl = options.serviceUrl
    }

    /**
     * Start a new key generation ceremony
     * @param {KeyGenerationInput} input - Key generation input
     * @returns {Promise<string>} Ceremony ID
     * @example
     * const id = await startKeyGeneration({
     *    operators: {
     *       "1": "http://host.docker.internal:8081",
     *       "2": "http://host.docker.internal:8082",
     *       "3": "http://host.docker.internal:8083",
     *       "4": "http://host.docker.internal:8084"
     *    },
     *    withdrawalAddress: '0x07e05700cb4e946ba50244e27f01805354cd8ef0'
     * })
     * console.log(id) 
     * // => "b7e8b0e0-5c1a-4b1e-9b1e-8c1c1c1c1c1c"
     */
    async startKeyGeneration(input: KeyGenerationInput): Promise<string> {
        const { operators, withdrawalAddress } = input
        const withdrawalCredentials = `01${'0'.repeat(22)}${withdrawalAddress.split('0x')[1]}`
        const startKeyGeneration = await retry(`${this.serviceUrl}/keygen`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operators,
                threshold: Object.keys(operators).length - 1,
                withdrawal_credentials: withdrawalCredentials,
                fork_version: 'prater'
            })
        })
        const { request_id: ceremonyId } = await startKeyGeneration.json()
        return ceremonyId
    }

    /**
     * Start a resharing ceremony
     * @param {ReshareInput} input - Reshare input
     * @returns {Promise<string>} Ceremony ID
     * @example
     * const id = await startReshare({
     *   operators: {
     *      "2": "http://host.docker.internal:8082",
     *      "3": "http://host.docker.internal:8083",
     *      "4": "http://host.docker.internal:8084",
     *      "5": "http://host.docker.internal:8085"
     *   },
     *   validatorPublicKey: '0x8eb0f05adc697cdcbdf8848f7f1e8c2277f4fc7b0efc97ceb87ce75286e4328db7259fc0c1b39ced0c594855a30d415c',
     *   oldOperators: {
     *     "2": "http://host.docker.internal:8082",
     *     "3": "http://host.docker.internal:8083",
     *     "4": "http://host.docker.internal:8084"
     *   }
     * })
     * console.log(id)
     * // => "b7e8b0e0-5c1a-4b1e-9b1e-8c1c1c1c1c1c"
     */
    async startReshare(input: ReshareInput): Promise<string> {
        const { operators, validatorPublicKey, oldOperators } = input
        const startReshare = await retry(`${this.serviceUrl}/keygen`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operators,
                threshold: Object.keys(operators).length - 1,
                validator_pk: validatorPublicKey.split('0x')[1],
                operators_old: oldOperators
            })
        })
        const { request_id: ceremonyId } = await startReshare.json()
        return ceremonyId
    }

    /**
     * Get key generation shares and public keys
     * @param {string} ceremonyId - Ceremony ID
     * @returns {Promise<KeyShares[]>} Array of shares and public keys
     * @example
     * const shares = await getShares('b7e8b0e0-5c1a-4b1e-9b1e-8c1c1c1c1c1c')
     * console.log(shares)
     * // => [
     * //     {
     * //         encryptedShare: "0x000000...",
     * //         publicKey: "0x000000..."
     * //     },
     * //     ...
     * // ]
     */
    async getShares(ceremonyId: string): Promise<Share[]> {
        const getKeyData = await retry(`${this.serviceUrl}/data/${ceremonyId}`)
        const { output: keyData } = await getKeyData.json()
        const shares = []
        for (const id in keyData) {
            const { Data: shareData } = keyData[id]
            const { EncryptedShare: encryptedShare, SharePubKey: sharePublicKey } = shareData
            shares.push({
                encryptedShare: `0x${encryptedShare}`,
                publicKey: `0x${sharePublicKey}`
            })
        }
        return shares
    }

    /**
     * Get key generation deposit data
     * @param {string} ceremonyId - Ceremony ID
     * @returns {Promise<DepositData>} Deposit data
     * @example
     * const depositData = await getDepositData('b7e8b0e0-5c1a-4b1e-9b1e-8c1c1c1c1c1c')
     * console.log(depositData)
     * // => {
     * //     depositDataRoot: "0x000000...",
     * //     publicKey: "0x000000...",
     * //     signature: "0x000000...",
     * //     withdrawalCredentials: "0x000000..."
     * // }
     */
    async getDepositData(ceremonyId: string): Promise<DepositData> {
        const getDepositData = await retry(`${this.serviceUrl}/deposit_data/${ceremonyId}`)
        const [depositData] = await getDepositData.json()
        const {
            deposit_data_root: depositDataRoot,
            pubkey: publicKey,
            signature,
            withdrawal_credentials: withdrawalCredentials
        } = depositData
        return {
            depositDataRoot: `0x${depositDataRoot}`,
            publicKey: `0x${publicKey}`,
            signature: `0x${signature}`,
            withdrawalCredentials: `0x${withdrawalCredentials}`
        }
    }

    /**
     * Start the local key generation API service
     * @returns {Promise<boolean>}
     */
    async start(): Promise<void> {

        run('cd scripts/resources/dkg && docker compose up -d')

        /** Wait for the success */
        let pong = false
        while (!pong) {
            pong = await this.ping()
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }

    /**
     * Stop the local key generation API service
     * @returns {Promise<void>}
     */
    async stop(): Promise<void> {

        run('cd scripts/resources/dkg && docker compose down')

        /** Wait for the failure */
        let pong = true
        while (pong) {
            pong = await this.ping()
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }

    /**
     * Ping the key generation service for a pong
     * @returns {Promise<boolean>}
     */
    async ping(): Promise<boolean> {
        try {
            const ping = await retry(`${this.serviceUrl}/ping`)
            const { message } = await ping.json()
            return message === 'pong'
        } catch (error) {
            return false
        }
    }
}