# Update Subscriptions

Allows a user to update one of their existing subscriptions by sending an encrypted NIP-04 event to the administrator's public key. The subscription's configuration can be modified, including its filters, relays, webhook, or active status.

## Request
`POST /subscriptions/update`

### Parameters

The request body must contain a valid NOSTR event with the following structure:

- **content**: An encrypted NIP-04 message containing the updated subscription details.
- **tags**: Must include:
  - `["t", "subscription-config"]` to indicate this is a subscription update request.
  - `["p", "ADMIN_PUBKEY"]` to ensure the request is directed to the administrator.

### Example Request

```json
{
  "kind": 21111,
  "content": "<nip04_encrypted_message>",
  "tags": [
    ["t", "subscription-config"],
    ["p", "ADMIN_PUBKEY"]
  ],
  "pubkey": "USER_PUBKEY",
  "sig": "VALID_SIGNATURE"
}
```


### Decrypted Content Example:

```jsonc
[
  {
    "subscriptionId": "XXX",
    "filters": {
      // Updated filters for the subscription
    },
    "relays": [
      "wss://updated-relay.example.com"
    ],
    "webhook": "https://updated-webhook.example.com",
    "active": 1
  },
  {
    "subscriptionId": "XXY",
    ...other_subscription
  }
]
```

### Validation

The server will validate the following:
1. **Signature**: The event must be signed by the `pubkey` specified in the request.
2. **Event Structure**:
   - The tag `["t", "subscription-config"]` must be present to indicate a subscription update request.
   - The tag `["p", "ADMIN_PUBKEY"]` must be included to ensure the request is directed to the admin.
   - The `content` must be a valid NIP-04 encrypted message that decrypts to a list of subscriptions.
3. **Subscription Existence**:
   - The `subscriptionId` must correspond to an existing subscription for the user.

### Response

If the request is valid and the subscription is updated successfully, the server will return a success response.

#### Example Response:

```json
{
  "success": true,
  "message": "Subscription updated successfully."
}
```

If the validation fails or the subscription does not exist, the server will return an error.

#### Example Error Response:

```json
{
  "success": false,
  "error": "Subscription not found."
}
```

### Notes:
- The `active` field allows toggling the subscription's state (`1` for active, `0` for inactive).
- This endpoint ensures that only the user associated with the `pubkey` in the request can update their subscriptions.
- The `subscriptionId` acts as a unique identifier for the subscription to be updated.


