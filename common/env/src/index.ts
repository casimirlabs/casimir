const ETHEREUM_CONTRACTS = {
    TESTNET: {
        BEACON_LIBRARY_ADDRESS: "0x0295bfe577d6833882Ee0E1Bccc4a5825d1Df653",
        MANAGER_BEACON_ADDRESS: "0x69D830C11bbD81c0A9AC031d17A2599D3a0F632E",
        POOL_BEACON_ADDRESS: "0x9Ef6fb4fe7F7EB9DDeB019028E978439b9aD72BF",
        REGISTRY_BEACON_ADDRESS: "0xC0799f7643978828cEBCe4F327dcA233dE1871C8",
        UPKEEP_BEACON_ADDRESS: "0x0CCA5B647598e86fc0518A462f2e61C58Dc6F5ac",
        VIEWS_BEACON_ADDRESS: "0x7B07be561eA274a78D9dC30FCFAcEeb2C6Ac3962",
        FACTORY_ADDRESS: "0xA6fd22c5633bCD82Ee25045de91351a8dfA2c76F",

        DEFAULT_MANAGER_ADDRESS: "0xA279b2cD2fe7f71f3dD77deF9dedC114bBC0a68c",
        DEFAULT_REGISTRY_ADDRESS: "0x2c6E6453c0AA873E81a9CFcFa2206E1b9E6C21e0",
        DEFAULT_UPKEEP_ADDRESS: "0xe4FB499e9D87dE483258BF757589310C137B97D9",
        DEFAULT_VIEWS_ADDRESS: "0x394042CBB8bF5444766496897982A5CDd01d5099",

        FUNCTIONS_BILLING_REGISTRY_ADDRESS: "0x566087488869A18767cBA3Adb19dfc713FE56Ac6",
        FUNCTIONS_ORACLE_ADDRESS: "0x914F29Ddb0b8A8201a58e6eeaf71d6df36429214",
        FUNCTIONS_ORACLE_FACTORY_ADDRESS: "0x1304Dc23DD83f5c374193839E880cCa5D040f5A7",

        DEPOSIT_CONTRACT_ADDRESS: "0xff50ed3d0ec03aC01D4C79aAd74928BFF48a7b2b",
        KEEPER_REGISTRAR_ADDRESS: "0x57A4a13b35d25EE78e084168aBaC5ad360252467",
        KEEPER_REGISTRY_ADDRESS: "0xE16Df59B887e3Caa439E0b29B42bA2e7976FD8b2",
        LINK_ETH_FEED_ADDRESS: "0xb4c4a493AB6356497713A78FFA6c60FB53517c63",
        LINK_TOKEN_ADDRESS: "0x326C977E6efc84E512bB9C30f76E30c160eD06FB",
        SSV_NETWORK_ADDRESS: "0xC3CD9A0aE89Fff83b71b58b6512D43F8a41f363D",
        SSV_TOKEN_ADDRESS: "0x3a9f01091C446bdE031E39ea8354647AFef091E7",
        SSV_VIEWS_ADDRESS: "0xAE2C84c48272F5a1746150ef333D5E5B51F68763",
        SWAP_FACTORY_ADDRESS: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        SWAP_ROUTER_ADDRESS: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH_TOKEN_ADDRESS: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6"
    }
}

enum ETHEREUM_NETWORK_NAME {
    TESTNET = "goerli"
}

enum ETHEREUM_RPC_URL {
    TESTNET = "https://goerli.infura.io/v3/46a379ac6895489f812f33beb726b03b" // 'https://nodes.casimir.co/eth/goerli/limited'
}

const ETHEREUM_SIGNERS = {
    TESTNET: {
        DAO_ORACLE_ADDRESS: "0x728474D29c2F81eb17a669a7582A2C17f1042b57",
        DON_TRANSMITTER_ADDRESS: "0x84725c8f954f18709aDcA150a0635D2fBE94fDfF",
        OWNER_ADDRESS: "0xd557a5745d4560B24D36A68b52351ffF9c86A212"
    }
}

enum HARDHAT_NETWORK_KEY {
    GOERLI = "TESTNET",
    HARDHAT = "TESTNET",
    LOCALHOST = "TESTNET"
}

export { 
    ETHEREUM_CONTRACTS,
    ETHEREUM_NETWORK_NAME,
    ETHEREUM_RPC_URL,
    ETHEREUM_SIGNERS,
    HARDHAT_NETWORK_KEY
}
