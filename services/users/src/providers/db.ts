import { Postgres } from '@casimir/data'
import { pascalCase } from '@casimir/helpers'
import { Account, RemoveAccountOptions, User, UserAddedSuccess } from '@casimir/types'

const postgres = new Postgres({
    // These will become environment variables
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres'
})

export default function useDB() {

    /** 
     * Add an account.
     * @param account - The account to add
     * @param createdAt - The account's creation date (optional)
     * @returns The new account
     */
    async function addAccount(account: Account, createdAt?: string) : Promise<Account> {
        if (!createdAt) createdAt = new Date().toISOString()
        const { address, currency, ownerAddress, walletProvider } = account
        const text = 'INSERT INTO accounts (address, currency, owner_address, wallet_provider, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *;'
        const params = [address, currency, ownerAddress, walletProvider, createdAt]
        const rows = await postgres.query(text, params)
        return rows[0] as Account
    }

    /**
     * Add a user.
     * @param user - The user to add
     * @param account - The user's accounts
     * @returns The new user
     */
    async function addUser(user: User, account: Account) : Promise<UserAddedSuccess | undefined> {
        const { address, createdAt, updatedAt } = user
        const text = 'INSERT INTO users (address, created_at, updated_at) VALUES ($1, $2, $3) RETURNING *;'
        const params = [address, createdAt, updatedAt]
        const rows = await postgres.query(text, params)
        const addedUser = rows[0]
        
        const accountAdded = await addAccount(account, createdAt)
        addedUser.accounts = [accountAdded]

        return formatResult(addedUser)
    }

    /**
     * Get a user by address.
     * @param address - The user's address
     * @returns The user if found, otherwise undefined
     */
    async function getUser(address: string) {
        const text = 'SELECT u.*, json_agg(a.*) AS accounts FROM users u JOIN accounts a ON u.address = a.owner_address WHERE u.address = $1 GROUP BY u.address'
        const params = [address]
        const rows = await postgres.query(text, params)
        const user = rows[0]
        return formatResult(user) as User
    }

    /**
     * Remove an account.
     * @param address - The account's address (pk)
     * @param ownerAddress - The account's owner address
     * @param walletProvider - The account's wallet provider
     * @param currency - The account's currency
     * @returns The removed account if found, otherwise undefined
     */
    async function removeAccount({ address, currency, ownerAddress, walletProvider } : RemoveAccountOptions) {
        const text = 'DELETE FROM accounts WHERE address = $1 AND owner_address = $2 AND wallet_provider = $3 AND currency = $4 RETURNING *;'
        const params = [address, ownerAddress, walletProvider, currency]
        const rows = await postgres.query(text, params)
        return rows[0] as Account
    }

    /**
     * Add or update nonce for an address.
     * @param address - The address
     * @returns A promise that resolves when the nonce is added or updated
     */
    async function upsertNonce(address: string): Promise<string | Error> {
        try {
            const nonce = generateNonce()
            const text = 'INSERT INTO nonces (address, nonce) VALUES ($1, $2) ON CONFLICT (address) DO UPDATE SET nonce = $2;'
            const params = [address, nonce]
            await postgres.query(text, params)
            return nonce
        } catch (error) {
            console.error('There was an error adding or updating the nonce in upsertNonce.', error)
            return error as Error
        }
    }

    /**
     * Format data from a database result (snake_case to PascalCase).
     * @param rows - The result date
     * @returns The formatted data
     */
    function formatResult(row: any) {
        if (row) {
            for (const key in row) {
                /** Convert snake_case to PascalCase */
                if (key.includes('_')) {
                    row[pascalCase(key)] = row[key]
                    delete row[key]
                } else {
                    row[key[0].toUpperCase() + key.slice(1)] = row[key]
                    delete row[key]
                }
            }
            return row
        }
    }

    return { addAccount, addUser, getUser, removeAccount, upsertNonce }
}

/**
 * Generate and return a nonce.
 * @returns string
 */
function generateNonce() {
    return (Math.floor(Math.random()
        * (Number.MAX_SAFE_INTEGER - 1)) + 1).toString()
}