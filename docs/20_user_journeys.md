
# Core User Journeys

## A. New user creates a wallet

A new user opens the app, creates a wallet locally, backs up the recovery phrase, sets a password, and lands on a dashboard showing their receive address and current balance state.

Expected flow:

1. The app generates a 24-word BIP-39 mnemonic in the browser via the WASM wallet core.
2. The user is shown the phrase with explicit backup guidance and a warning that it is the only recovery path.
3. The app requires mnemonic confirmation before continuing.
4. The user sets a password or PIN for local encryption.
5. The wallet derives the MobileCoin keys and public address.
6. The wallet material is encrypted locally and stored in IndexedDB.
7. The dashboard loads with the receive address, zero or syncing balance state, and the first Fog sync begins.

## B. Existing user imports a wallet

A returning MobileCoin user imports a mnemonic, sets a local password, and syncs their balance through Fog.

Expected flow:

1. The user pastes or types a valid 24-word mnemonic.
2. The app validates checksum and word format before allowing progress.
3. The user sets a local encryption password.
4. The browser derives the same MobileCoin keys and address as the original wallet.
5. The encrypted keystore is saved locally.
6. A full or user-guided Fog sync begins.
7. The dashboard appears once enough sync progress exists to show a meaningful balance state.

Important edge case: if the source wallet was not operating with compatible Fog-discoverable history, some historical activity may be incomplete. The product should warn clearly instead of implying perfect historical recovery.

## C. User receives MOB

The app presents a stable MobileCoin address for sharing. After another wallet sends MOB, Fog-based sync discovers the new outputs and the UI updates balance and activity.

Expected flow:

1. The dashboard shows the MobileCoin B58 address in copyable text form.
2. The same address is shown as a QR code for wallet-to-wallet transfer convenience.
3. The user shares the address externally.
4. Fog sync continues polling or syncing in the background.
5. Newly discovered outputs are decrypted locally in the browser.
6. The balance updates automatically.
7. A new activity entry appears with amount, block reference, and an approximate time if available.

## D. User sends MOB

The user enters a valid MobileCoin address and amount, reviews the fee, confirms the transfer, and submits a signed transaction. The app shows a pending state and then reconciles to confirmed state after network progress is observed.

Expected flow:

1. The user enters a recipient B58 address and an amount.
2. The app validates address format, checksum, numeric precision, and available balance including fee.
3. The app displays the network fee and total spend before confirmation.
4. The wallet core selects inputs from the local spendable set.
5. The client fetches ring members and any required ledger context.
6. The transaction is constructed and signed in the browser.
7. The app stores a local pending-send record before submission.
8. The signed payload is submitted through the allowed network path.
9. The UI transitions through pending, submitted, and confirmed-or-expired states.
10. The wallet reconciles the final outcome and refreshes spendable balance and activity.

Minimum user-facing error handling:

| Error case | Required behavior |
| --- | --- |
| Invalid recipient address | Block submission and explain the issue before signing |
| Insufficient balance | Prevent submission and show available spendable amount |
| Network timeout | Keep pending state, allow safe retry only after reconciliation |
| Tombstone expiry | Mark transaction expired and offer rebuild/retry |
| Already-spent inputs | Force re-sync and rebuild from current spendable state |

## E. User refreshes or loses connection mid-send

If the browser refreshes or the network drops after confirmation, the app should recover safely by checking local pending-send state and reconciling whether the transaction was submitted, confirmed, still pending, or safe to retry.

Expected flow:

1. Before network submission, the app stores a local pending-send marker with enough metadata to reconcile safely.
2. On reload or reconnect, the wallet checks local pending state before allowing another send attempt.
3. The app determines whether the transaction reached the network, is still pending, has confirmed, or can be rebuilt.
4. The user is shown a deterministic recovery state rather than a generic error.

This is a core trust requirement.

## F. User restores on a new device

The user imports the mnemonic in a new browser session and recovers access to the same wallet state through Fog sync, without relying on any server-side wallet recovery.

Expected flow:

1. The user opens the app on another machine or browser profile.
2. The mnemonic is imported and validated locally.
3. The wallet derives the same address and key hierarchy.
4. Fog sync rebuilds spendable state and known activity from chain-discoverable data.
5. The user regains practical control of the wallet without any backend recovery account.

## G. User views recovery phrase again

After password re-verification, the user can reveal the recovery phrase locally for backup or migration. It must never be logged or transmitted.

Expected flow:

1. The user navigates to settings and requests recovery phrase reveal.
2. The app requires password re-entry.
3. The phrase is shown only locally with explicit warnings not to share it.
4. The phrase is never auto-copied, logged, or sent to any hosted service.

## H. Wallet auto-locks after inactivity

After a configurable inactivity window, in-memory key material is cleared and the user must unlock again. Closing the tab should also clear in-memory secrets.

Expected flow:

1. After a default inactivity window, sensitive in-memory state is cleared.
2. The next protected action requires password re-entry.
3. The lock timeout is configurable within a safe range.
4. Tab close, logout, or explicit lock also clears session key material.

---

[Back: Implementation Phases](10_implemetation_phases.md)
