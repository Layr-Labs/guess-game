## Contracts

### Deploy (UUPS proxy)

Required env:

```
export TOKEN=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 # USDC, example
export MAX_POT=25000000000     # 25,000 USDC with 6 decimals
export ADMIN=0x...
export OPERATOR=0x...
export GUARDIAN=0x...
export WITHDRAWAL_DELAY=604800  # 7 days
```

Deploy:

```
forge script script/DeployGuessGame.s.sol:DeployGuessGame \
  --rpc-url $RPC_URL --private-key $PK --broadcast -vvvv
```

Upgrade (guardian only):

```
export PROXY=0x...
forge script script/UpgradeGuessGame.s.sol:UpgradeGuessGame \
  --rpc-url $RPC_URL --private-key $PK --broadcast -vvvv
```


**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Local Dev

```shell
# build
forge build

# test (unit, fuzz, UUPS, invariants)
forge test -vv

# gas snapshot
forge snapshot

# anvil local node
anvil
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
