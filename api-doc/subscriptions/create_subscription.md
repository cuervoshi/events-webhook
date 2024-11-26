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
