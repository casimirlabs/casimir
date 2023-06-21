import { ethers } from 'ethers'

export function getEventsIterable({ manager, events }: { manager: ethers.Contract, events: string[] }) {
    return (async function*() {
        for (const event of events) {
            yield* getEvent({ manager, event })
        }
    })()
}

async function* getEvent({ manager, event }: { manager: ethers.Contract, event: string }) {
    const queue: any[][] = []
    const listener = (...args: any[]) => queue.push(args)
    
    manager.on(event, listener)
    
    try {
        while (true) {
            if (queue.length === 0) {
                await new Promise<void>(resolve => {
                    const waitListener = () => {
                        manager.off(event, waitListener)
                        resolve()
                    }
                    manager.on(event, waitListener)
                })
            } else {
                yield queue.shift()
            }
        }
    } finally {
        manager.off(event, listener)
    }
}