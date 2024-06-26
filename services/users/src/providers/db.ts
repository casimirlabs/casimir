import { Postgres } from "./postgres"
import { camelCase } from "@casimir/format"
import { Account, OperatorAddedSuccess, User, UserAddedSuccess, UserWithAccountsAndOperators } from "@casimir/types"
import useEthers from "./ethers"

const { generateNonce } = useEthers()

const postgres = new Postgres({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT as string) || 5432,
    database: process.env.DB_NAME || "users",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "password"
})

interface AddOperatorOptions {
    userId: number
    accountId: number
    nodeUrl: string
}

export default function useDB() {

    /** 
     * Add an account.
     * @param account - The account to add
     * @param createdAt - The account's creation date (optional)
     * @returns The new account
     */
    async function addAccount(account: Account, createdAt?: string) : Promise<Account> {
        try {
            if (!createdAt) createdAt = new Date().toISOString()
            const { address, currency, pathIndex, userId, walletProvider } = account
    
            // Check if the account already exists for the user
            const checkText = "SELECT * FROM accounts WHERE user_id = $1 AND address = $2;"
            const checkParams = [userId, address]
            const checkResultRows = await postgres.query(checkText, checkParams)
    
            if (checkResultRows[0]) {
                // Account with this address already exists for the user
                throw new Error("Account with this address already exists for the user")
            }
    
            // Proceed to add the account
            let text = "INSERT INTO accounts (address, currency, user_id, wallet_provider, created_at"
            const params = [address, currency, userId, walletProvider, createdAt]
            console.log("pathIndex :>> ", pathIndex)
            if (pathIndex !== undefined) {
                text += ", path_index"
                params.push(pathIndex.toString())
            }
    
            text += ") VALUES ("
            text += params.map((_, index) => `$${index + 1}`).join(", ") // This will generate $1, $2, ..., $N based on the parameters
            text += ") RETURNING *;"
    
            const rows = await postgres.query(text, params)
            const accountAdded = rows[0]
            const accountId = accountAdded.id
            await addUserAccount(parseInt(userId), accountId)
            return accountAdded as Account
        } catch (error: any) {
            throw new Error("There was an error adding the account to the database: " + error.message)
        }
    }
      

    /**
     * Adds operator to operator table
     * @param userId
     * @param accountId
     * @returns Promise<OperatorAddedSuccess | undefined>
     */
    // TODO: Need some check to make sure operator is properly registered
    async function addOperator(
        { userId, accountId, nodeUrl }: AddOperatorOptions
    ) : Promise<OperatorAddedSuccess | undefined> {
        try {
            const created_at = new Date().toISOString()
            const text = "INSERT INTO operators (user_id, account_id, node_url, created_at, updated_at) VALUES ($1, $2, $3, $4, $5) RETURNING *;"
            const params = [userId,
                accountId,
                nodeUrl,
                created_at,
                created_at]
            const rows = await postgres.query(text, params)
            const addedOperator = rows[0]
            return formatResult(addedOperator)
        } catch (error) {
            console.error(`There was an error in addOperator in useDB.ts: ${error}`)
            throw new Error("There was an error adding the operator to the database")
        }
    }

    /**
     * Add a user.
     * @param user - The user to add
     * @param account - The user's accounts
     * @returns The new user
     */
    async function addUser(user: User, account: Account) : Promise<UserAddedSuccess | undefined> {
        const { address, createdAt, updatedAt, walletProvider } = user
        const text = "INSERT INTO users (address, created_at, updated_at, wallet_provider) VALUES ($1, $2, $3, $4) RETURNING *;"
        const params = [address,
            createdAt,
            updatedAt,
            walletProvider]
        const rows = await postgres.query(text, params)
        const addedUser = rows[0]
        account.userId = addedUser.id
        
        const accountAdded = await addAccount(account, createdAt)
        addedUser.accounts = [accountAdded]
        
        return formatResult(addedUser)
    }

    /**
     * Add a user account.
     * @param user_id - The user's id
     * @param account_id - The account's id
     * @returns The new user account
     */
    async function addUserAccount(user_id: number, account_id: number) {
        const createdAt = new Date().toISOString()
        const text = "INSERT INTO user_accounts (user_id, account_id, created_at) VALUES ($1, $2, $3) RETURNING *;"
        const params = [user_id,
            account_id,
            createdAt]
        const rows = await postgres.query(text, params)
        return rows[0]
    }

    /**
     * Get accounts by address.
     * @param address - The account's address
     * @returns The account if found, otherwise undefined
     */
    async function getAccounts(address: string): Promise<Account[]> {
        try {
            const text = "SELECT * FROM accounts WHERE address = $1;"
            const params = [address.toLowerCase()]
            const rows = await postgres.query(text, params)
            return formatResult(rows) as Account[]
        } catch (error) {
            throw new Error("There was an error getting accounts from the database")
        }
    }

    /**
     * Get nonce by address.
     * @param address - The address user is using to sign in with ethereum
     * @returns - The nonce if address is a pk on the table or undefined
     */
    async function getNonce(address:string) {
        try {
            const text = "SELECT nonce FROM nonces WHERE address = $1;"
            const params = [address]
            const rows = await postgres.query(text, params)
            const { nonce } = rows[0]
            return formatResult(nonce)
        } catch (error) {
            throw new Error("There was an error getting nonce from the database")
        }
    }

    /**
     * Get a user by address.
     * @param address - The user's address
     * @returns The user if found, otherwise undefined
     */
    async function getUserByAddress(address: string): Promise<UserWithAccountsAndOperators | undefined> {
        try {
            const text = `
                SELECT 
                    u.*, 
                    json_agg(
                        json_build_object(
                            'id', a.id,
                            'address', a.address,
                            'balance', a.balance,
                            'currency', a.currency,
                            'created_at', a.created_at,
                            'path_index', a.path_index,
                            'updated_at', a.updated_at,
                            'user_id', a.user_id,
                            'wallet_provider', a.wallet_provider,
                            'operators', COALESCE(
                                (SELECT json_agg(o.*) FROM operators o WHERE a.id = o.account_id), 
                                '[]'::json
                            )
                        )
                    ) AS accounts,
                    COALESCE(
                        (SELECT json_agg(o.*) FROM operators o WHERE u.id = o.user_id), 
                        '[]'::json
                    ) AS operators
                FROM 
                    users u 
                LEFT JOIN 
                    user_accounts ua ON u.id = ua.user_id 
                LEFT JOIN 
                    accounts a ON ua.account_id = a.id 
                WHERE 
                    u.address = $1 
                GROUP BY 
                    u.id
            `
            const params = [address]
            const rows = await postgres.query(text, params)
            const user = rows[0]
            return formatResult(user) as UserWithAccountsAndOperators
        } catch (error) {
            console.log("ERROR in DB")
            throw new Error("There was an error getting user from the database")
        }
    }
    
    /**
     * Get a user by id.
     * @param id - The user's id
     * @returns The user if found, otherwise undefined
     * @throws Error if the user is not found
     */
    async function getUserById(id: string): Promise<UserWithAccountsAndOperators | undefined> {
        try {
            const text = `
                SELECT 
                    u.*, 
                    json_agg(
                        json_build_object(
                            'id', a.id,
                            'address', a.address,
                            'balance', a.balance,
                            'currency', a.currency,
                            'created_at', a.created_at,
                            'path_index', a.path_index,
                            'updated_at', a.updated_at,
                            'user_id', a.user_id,
                            'wallet_provider', a.wallet_provider,
                            'operators', COALESCE(
                                (SELECT json_agg(o.*) FROM operators o WHERE a.id = o.account_id), 
                                '[]'::json
                            )
                        )
                    ) AS accounts,
                    COALESCE(
                        (SELECT json_agg(o.*) FROM operators o WHERE u.id = o.user_id), 
                        '[]'::json
                    ) AS operators
                FROM 
                    users u 
                LEFT JOIN 
                    user_accounts ua ON u.id = ua.user_id 
                LEFT JOIN 
                    accounts a ON ua.account_id = a.id 
                WHERE 
                    u.id = $1 
                GROUP BY 
                    u.id
            `
            const params = [id]
            const rows = await postgres.query(text, params)
            const user = rows[0]
            return formatResult(user) as UserWithAccountsAndOperators
        } catch (err) {
            throw new Error("There was an error getting user by id from the database")
        }
    }
    
    // TODO: Delete any operator associated with the address associated with this account?
    /**
     * Remove an account.
     * @param accountId - The account's id
     * @param userId - The user's id
     * @returns A promise that resolves when the account is removed
     */
    async function removeAccount(accountId: number, userId: number) {
        try {
            await postgres.query("BEGIN")
    
            const deleteUserAccountLink = "DELETE FROM user_accounts WHERE account_id = $1 AND user_id = $2;"
            const params = [accountId, userId]
            const userAccountResult = await postgres.query(deleteUserAccountLink, params)
    
            if (userAccountResult) {
                const deleteAccount = "DELETE FROM accounts WHERE id = $1;"
                const accountParams = [accountId]
                const accountResult = await postgres.query(deleteAccount, accountParams)
    
                await postgres.query("COMMIT")
                return accountResult
            } else {
                await postgres.query("ROLLBACK")
                console.log("No link found in user_accounts for the given accountId and userId.")
                return null
            }
        } catch (err) {
            await postgres.query("ROLLBACK")
            console.log("Error in removeAccount:", err)
            throw new Error("There was an error removing the account from the database")
        }
    }
    
    /**
     * Update user's address based on userId.
     * @param userId - The user's id
     * @param address - The user's new address
     * @returns A promise that resolves when the user's address is updated
     * @throws Error if the user is not found
     * @throws Error if the user's address is not updated
     */
    async function updateUserAddress(userId: number, address: string): Promise<User> {
        try {
            const updated_at = new Date().toISOString()
            const text = "UPDATE users SET address = $1, updated_at = $2 WHERE id = $3 RETURNING *;"
            const params = [address,
                updated_at,
                userId]
            const rows = await postgres.query(text, params)
            const user = rows[0]
            if (!user) throw new Error("User not found.")
            if (user.address !== address) throw new Error("User address not updated.")
            return user
        } catch (error) {
            console.error("There was an error updating the user address in updateUserAddress.", error)
            throw error
        }
    }

    /**
     * Update user's agreedToTermsOfService based on userId.
     * @param userId - The user's id
     * @param agreedToTermsOfService - The user's new agreedToTermsOfService
     * @returns A promise that resolves when the user's agreedToTermsOfService is updated
     * @throws Error if the user is not found
     * 
     */
    async function updateUserAgreedToTermsOfService(userId: number, agreedToTermsOfService: boolean): Promise<User> {
        try {
            const updated_at = new Date().toISOString()
            const text = "UPDATE users SET agreed_to_terms_of_service = $1, updated_at = $2 WHERE id = $3 RETURNING *;"
            const params = [agreedToTermsOfService,
                updated_at,
                userId]
            const rows = await postgres.query(text, params)
            const user = rows[0]
            if (!user) throw new Error("User not found.")
            return user
        } catch (error) {
            console.error("There was an error updating the user agreedToTermsOfService in updateUserAgreedToTermsOfService.", error)
            throw error
        }
    }

    /**
     * Add or update nonce for an address.
     * @param address - The address
     * @returns A promise that resolves when the nonce is added or updated
     */
    async function upsertNonce(address: string): Promise<string | Error> {
        try {
            const nonce = generateNonce()
            const text = "INSERT INTO nonces (address, nonce) VALUES ($1, $2) ON CONFLICT (address) DO UPDATE SET nonce = $2;"
            const params = [address, nonce]
            await postgres.query(text, params)
            return nonce
        } catch (error) {
            throw new Error("There was an error upserting nonce in the database")
        }
    }

    /**
     * Format data from a database result object (convert to camelCase).
     * @param rows - The result date
     * @returns The formatted data
     */
    function formatResult(obj: any) : any {
        if (typeof obj !== "object" || obj === null) {
            // Return non-object values as is
            return obj
        }
      
        if (Array.isArray(obj)) {
            // If obj is an array, map over each item and recursively call the function
            return obj.map(item => formatResult(item))
        }
      
        const convertedObj: any = {}
      
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const camelCaseKey = camelCase(key)
                const value = obj[key]
      
                if (typeof value === "object" && value !== null) {
                    // Recursively convert nested objects
                    convertedObj[camelCaseKey] = formatResult(value)
                } else {
                    // Convert key to camel case and assign the value
                    convertedObj[camelCaseKey] = value
                }
            }
        }
      
        return convertedObj
    }

    return { 
        addAccount,
        addOperator,
        addUser,
        formatResult,
        getAccounts,
        getNonce, 
        getUserByAddress,
        getUserById,
        removeAccount, 
        updateUserAddress, 
        updateUserAgreedToTermsOfService,
        upsertNonce
    }
}