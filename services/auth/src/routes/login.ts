import express from 'express'
import useEthers from '../providers/ethers'
import { LoginCredentials } from '@casimir/types'
import useUsers from '../providers/users'

const { verifyMessage } = useEthers()
const { updateMessage } = useUsers()
const router = express.Router()

router.use('/', async (req: express.Request, res: express.Response) => {
    const { body } = req
    const { address, message, signedMessage, provider } = body as LoginCredentials
    const response = verifyMessage({ address, message, signedMessage, provider })
    if (response) updateMessage(provider, address) // send back token if successful
    res.setHeader('Content-Type', 'application/json')
    res.status(200)
    res.json({
        message: response ? 'Login successful' : 'Login failed',
        error: false,
        data: address.toLowerCase()
    })
})

export default router