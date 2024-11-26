# Create Subscription

Create a subscription to be notified via webhook when specific events match the defined filters.

## Request
`POST /subscriptions/create`

### Parameters

- **filters**: [`NDKFilter[]`](https://github.com/nostr-dev-kit/ndk/blob/ed29a9d4ba99ceb91f9c8db002eb7eb32db35b41/ndk/src/subscription/index.ts#L18)  
  A list of filters defining the events you want to get notified about.
- **relays**: `string[]`  
  A list of relay URLs to subscribe to for receiving events.
- **webhook**: `string`  
  A URL to which notifications will be sent when an event matching the selected filters is received.

### Request Format

The body of the request must be a valid NOSTR event, where the subscription details are included in the `content` field.

#### Example:
This example demonstrates a subscription that notifies the specified webhook whenever the user changes their profile.

```json
{
  "id": "eventHash",
  "pubkey": "USER_PUB_KEY",
  "kind": 21111,
  "content": {
    "filters": [
      {
        "authors": ["USER_PUB_KEY"],
        "kinds": [0]
      }
    ],
    "relays": ["wss://relay.hodl.ar"],
    "webhook": "https://example.com/webhook"
  },
  "tags": [
    ["t", "new-subscription"]
  ],
  "sig": "signature of USER_PUB_KEY"
}
```

## Additional Information: Admin Subscriptions Event

The `admin_pubkey` (administrator's public key) will emit an event in the NOSTR network containing the active subscriptions of the user. This event is structured as follows:

### Active Subscriptions Event

#### Event Structure:

- **author**: The `admin_pubkey` (administrator's public key).
- **content**: An encrypted NIP-04 message that contains the list of subscriptions.
- **tags**: Includes a tag with a deterministic identifier for the user's subscriptions.

#### Example:

```json
{
  "kind": 31111,
  "author": "ADMIN_PUBKEY",
  "content": "<nip04_encrypted_message>",
  "tags": [
    ["d", "subscriptions:USER_PUBKEY"]
  ]
}
```

#### Decrypted Content Example:

```json
{
  "subscriptions": [
    {
      "subscriptionId": "XXX",
      "filters": {
        // Define the filters as specified in the user's request
      },
      "relays": [
        "wss://relay.example.com"
      ],
      "webhook": "https://example.com/webhook",
      "active": 0
    }
  ]
}
```

### Notes:
- The `active` field indicates whether the subscription is currently active (`1` for active, `0` for inactive`).
- The tag `["d", "subscriptions:USER_PUBKEY"]` ensures that this event is uniquely associated with the user's public key.
- The content is encrypted using NIP-04 encryption for secure transmission of sensitive subscription details.
- This mechanism allows the administrator to keep track of and share user subscription details securely and transparently within the NOSTR ecosystem.
