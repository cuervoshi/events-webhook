# Request Credits

Request credits by sending a **Zap Request** (NIP-57) to the admin's public key. This will return a Lightning Payment Request to complete the payment. The server will listen for the Zap Receipt (kind 9735) to confirm the payment and credit the user's account.

## Request
`POST /credits/request`

### Parameters

The request body must contain a valid NOSTR event of kind `9734` (Zap Request), signed by the user's `pubkey`.

### Example Request
```json
{
  "kind": 9734,
  "content": "",
  "tags": [
    ["t", "buy-credits"],
    ["amount", "21000"],
    ["p", "ADMIN_PUBKEY"]
  ],
  "pubkey": "USER_PUBKEY",
  "sig": "VALID_SIGNATURE"
}
```

### Validation
The server will validate the following:
1. **Signature**: The event must be signed by the `pubkey` specified in the request.
2. **Zap Request Structure**:
   - The tag `["t", "buy-credits"]` must be present to indicate a request to purchase credits.
   - The tag `["amount", "value"]` must be present, where `value` is the amount in millisatoshis (mSAT) to zap.
   - The tag `["p", "ADMIN_PUBKEY"]` must be included to ensure the zap is directed to the admin.

### Response
If the request is valid, the server will return a Lightning Payment Request for the specified amount.

#### Example Response
```json
{
    "paymentRequest": "lnbc21000n1p..."
}
```

### Credit Allocation
Once the Zap Receipt (kind `9735`) is detected:
1. The server verifies the receipt:
   - Confirms the payment was directed to `ADMIN_PUBKEY`.
   - Matches the `amount` in the receipt with the original Zap Request.
   - Ensures the sender's `pubkey` matches `USER_PUBKEY`.
2. Credits are added to the `USER_PUBKEY` account in the database:
   - The amount of credits is determined by a pre-defined conversion rate (e.g., `1 credit = 100 mSAT`).

### Example Zap Receipt
```json
{
  "kind": 9735,
  "content": "",
  "tags": [
    ["e", "EVENT_HASH"], 
    ["p", "ADMIN_PUBKEY"],
    ["amount", "AMOUNT_IN_MILISATS"],
    ["p", "USER_PUBKEY"]
  ],
  "pubkey": "ZAPPER_PUBKEY",
  "sig": "VALID_SIGNATURE"
}
```

Upon receiving the zap receipt, the server will add credits to `USER_PUBKEY`.
