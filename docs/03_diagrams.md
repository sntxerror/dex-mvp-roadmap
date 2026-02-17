# Architectural Diagrams

All system diagrams in one place. Each section is anchored — other documents link here rather than embedding diagrams inline.

---

## System Class Hierarchy

The proposal moves away from the "Dealer" model (where the App is the counterparty) toward a "Marketplace" model (where the App is just a board). This class diagram shows the key domain entities and their relationships.

```mermaid
classDiagram
    namespace Actors {
        class Maker {
            +Sign_SCI()
            +Cancel_Order()
        }
        class Taker {
            +Fill_Order_Partial()
            +Fill_Order_Full()
        }
        class Solver_Bot {
            +Find_Matches()
            +Construct_Ring_Tx()
            +Submit_To_Network()
        }
    }

    namespace DEX_Core {
        class OrderBook {
            +List<SCI_Blob> orders
            +Add_Order()
            +Remove_Spent_Orders()
        }
        class Bridge_Service {
            +Mint_wAsset()
            +Burn_wAsset()
        }
    }

    Maker --> OrderBook : Uploads SCI
    Solver_Bot ..> OrderBook : Scans
    Solver_Bot --> MobileCoin_Network : Submits Match
    Taker --> MobileCoin_Network : Submits Match (Manual)
```

---

## Manual Matching

The traditional "Bulletin Board" approach. The taker selects an order, constructs the transaction locally, and submits it. Harder for users but simpler infrastructure.

```mermaid
sequenceDiagram
    participant Alice as Maker (Seller)
    participant Server as Order Book
    participant Bob as Taker (Buyer)
    participant Chain as MobileCoin Network

    Alice->>Alice: Sign SCI (Sell 100 MOB)
    Alice->>Server: POST /order (SCI Blob)
    Server-->>Bob: Display "100 MOB for Sale"
    Bob->>Bob: Select Order
    Bob->>Bob: Add Own Input (Payment)
    Bob->>Bob: Sign & Construct Tx
    Bob->>Chain: Submit Transaction
    Chain-->>Alice: 100 MOB Spent (Order Dead)
```

---

## Automated Solver Matching

The solver bot monitors the order book for price-crossing orders, combines their SCIs into a single atomic transaction, and submits it. Seamless for users.

```mermaid
sequenceDiagram
    participant Alice as Maker (Seller)
    participant Bob as Maker (Buyer)
    participant Server as Order Book
    participant Solver as Solver Bot
    participant Chain as Network

    Alice->>Server: Upload SCI (Sell 100 MOB)
    Bob->>Server: Upload SCI (Buy 100 MOB)
    Note over Server: Order Book has two passive orders
    Solver->>Server: Fetch Orders
    Solver->>Solver: Detect Match (Price Overlap)
    Solver->>Solver: Construct Atomic Tx (Input A + Input B)
    Solver->>Chain: Submit Transaction
    Chain-->>Alice: Receive Payment
    Chain-->>Bob: Receive MOB
```

---

## SCI Mechanics

Explaining [Signed Contingent Inputs](./09_glossary.md#signed-contingent-input-sci) to non-cryptographers. The contingency rule means Alice's input can only be spent if the transaction also includes the required counter-payment — otherwise the network rejects it entirely.

```mermaid
flowchart LR
    subgraph Transaction_Bundle
        direction TB
        Input_A[Alice's Input: 100 MOB]
        Input_B[Bob's Input: 1 wBTC]
        
        Output_A[Output to Bob: 100 MOB]
        Output_B[Output to Alice: 1 wBTC]

        condition{"Is the Rule Met?"}
    end

    Input_A --> condition
    Input_B --> condition
    
    condition -- YES: Alice gets wBTC --> Valid[Transaction Succeeds]
    condition -- NO: Alice gets nothing --> Invalid[Transaction Fails Entirely]
    
    style Valid fill:#9f9,stroke:#333
    style Invalid fill:#f99,stroke:#333
```

---

## Example System Configuration

One possible combination of decisions: Web/WASM frontend, Antelope fork, DEQS order book, Full-Service + mobilecoind wallet, centralized bridge. Other combinations would look different — this is just a reference point. See [Proposed System Components](./04_system_components.md) for how each decision shapes the stack.

```mermaid
graph TD
    subgraph Client ["User's Browser"]
        FE["React + WASM Crypto Engine"]
    end

    subgraph Backend ["Backend"]
        API["API Gateway (FastAPI)"]
        Solver["Solver Bot"]
        DB[(PostgreSQL)]
        Redis[(Redis)]
    end

    subgraph MobileCoin ["MobileCoin Stack"]
        Fog["Fog (SGX Enclave)"]
        DEQS["DEQS (Order Book)"]
        FS["Full-Service (JSONRPC)"]
        MCD["mobilecoind (gRPC)"]
        MC["MobileCoin Network"]
    end

    subgraph Bridge ["Bridge (Centralized)"]
        BW["Bitcoin Watcher"]
        EW["Ethereum Watcher"]
        Minter["Asset Minter"]
        Burn["Burn Detector"]
        BTCSend["BTC Sender"]
        ETHSend["ETH Sender"]
    end

    BTC(("Bitcoin"))
    ETH(("Ethereum"))

    FE -->|"REST / WS"| API
    FE -->|"gRPC-web"| Fog
    API --> FS
    API --> DEQS
    API --> DB
    API --> Redis
    Solver --> DEQS
    Solver --> FS
    Fog --> MC
    FS --> MC
    MCD --> MC
    DEQS --> MC
    BW --> BTC
    EW --> ETH
    BW --> Minter
    EW --> Minter
    Minter --> FS
    Burn --> MC
    Burn --> BTCSend
    Burn --> ETHSend
    BTCSend --> BTC
    ETHSend --> ETH
```

---

## Trade Flow

From SCI creation to settlement, mapped to services.

*Assumes: Web/WASM frontend, Order Book + Solver, DEQS, Full-Service wallet backend.*

```mermaid
sequenceDiagram
    participant Browser as Frontend (React + WASM)
    participant API as API Gateway
    participant DEQS as DEQS Node
    participant Solver as Solver Bot
    participant FS as Full-Service
    participant MC as MobileCoin Network
    participant Fog as Fog Service

    Note over Browser: Alice creates limit order
    Browser->>Browser: WASM builds SCI (signs with private key)
    Browser->>API: POST /orders {sci_blob}
    API->>FS: validate_sci(sci_blob)
    FS-->>API: valid
    API->>DEQS: SubmitQuotes(sci_blob)
    DEQS-->>API: stored

    Note over Browser: Bob creates opposing order
    Browser->>API: POST /orders {sci_blob_bob}
    API->>DEQS: SubmitQuotes(sci_blob_bob)

    Solver->>DEQS: GetQuotes(pair=MOB/wBTC)
    Solver->>Solver: Detect price crossing
    Solver->>Solver: Combine SCIs into settlement tx
    Solver->>MC: Submit transaction
    MC-->>Fog: New block (spent key images)
    Fog-->>Browser: Balance updated
    DEQS->>DEQS: Key-image monitor removes filled orders
```

---

## Bridge Flow

Deposit and withdrawal sequence for a centralized bridge. Only applies if a bridge is chosen ([Decision 3](./07_asset_integration.md)).

*Assumes: Centralized bridge with Bitcoin.*

```mermaid
sequenceDiagram
    participant User as Frontend
    participant API as API Gateway
    participant BW as Bitcoin Watcher
    participant Minter as Asset Minter
    participant FS as Full-Service
    participant MC as MobileCoin Network
    participant BTC as Bitcoin Network
    participant Burn as Burn Detector
    participant Send as BTC Sender

    Note over User: Deposit BTC
    User->>API: GET /bridge/deposit-address
    API-->>User: bc1q...unique_address
    User->>BTC: Send 0.5 BTC
    BW->>BTC: Poll for deposits
    BW->>BW: Wait for 6 confirmations
    BW->>Minter: Trigger mint(user_mc_address, 0.5)
    Minter->>FS: Build MintTx (MCIP 37)
    Minter->>MC: Submit MintTx
    MC-->>User: 0.5 wBTC arrives via Fog

    Note over User: Withdraw BTC
    User->>User: WASM builds burn tx
    User->>MC: Submit burn tx (memo: BTC address)
    Burn->>MC: Detect burn event
    Burn->>Send: Trigger release(btc_address, 0.5)
    Send->>BTC: Broadcast BTC tx
    BTC-->>User: 0.5 BTC arrives
```

---

## Fog Balance Scanning

How the frontend discovers incoming payments without revealing user identity. See [System Design Section 1](./01_system_design.md#1-fog-private-transaction-discovery).

```mermaid
sequenceDiagram
    participant React as React Client
    participant Fog as Fog Service (Oblivious)
    participant Ledger as MobileCoin Ledger

    React->>React: Derive View Key (Private)
    React->>Fog: Request User's UTXOs (Encrypted Query)

    Note right of React: Fog does not know WHO it is searching for.<br/>Fog uses SGX Enclave to match View Key against Ledger.

    Fog->>Ledger: Scan Recent Blocks
    Ledger-->>Fog: Raw Output Data

    Fog->>Fog: Filter Matches inside Enclave
    Fog-->>React: Return Encrypted UTXOs (Owned by User)

    React->>React: Decrypt UTXOs locally
    React->>React: Sum values = Current Balance
```

---

## Order Lifecycle

An order progresses from creation through matching to settlement. [Partial fills](./09_glossary.md#partial-fill) consume the original SCI and produce a change output that can be relisted. See [Architecture Decisions Section 3](./02_architecture_decisions.md#3-partial-fill-mechanics).

*Assumes: Order Book + Solver model ([Decision 2](./06_matching_engine.md)).*

```mermaid
stateDiagram-v2
    [*] --> Created: User creates SCI
    Created --> Open: Posted to OrderBook

    Open --> Matched: Solver finds Counter-Order

    state Matched {
        [*] --> Verifying
        Verifying --> CalculatingSplit: Check Amounts
        CalculatingSplit --> ConstructingTx: Input > Needed
        ConstructingTx --> Signing
        Signing --> [*]
    }

    Matched --> Filled: Full Amount Taken
    Matched --> PartiallyFilled: Only X% Taken

    PartiallyFilled --> NewOrderCreated: Automatic (change output relisted)
    NewOrderCreated --> Open: Remainder relisted immediately

    Filled --> [*]: Consumed on-chain
```
