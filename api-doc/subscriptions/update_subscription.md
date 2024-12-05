# Update Subscription

Allows a user to update an existing subscription by sending an event to the administrator's public key. The subscription is identified by its `subscriptionId`, and the user can update the `filters`, `relays`, and `webhook`.

## Request
`PUT /subscriptions`

### Parameters

The request body must contain a valid NOSTR event with the following structure:

- **content**: A JSON object containing the following fields:
  - `subscriptionId`: The ID of the subscription to be updated.
  - `filters`: (Optional) An array of filters to replace the current filters for the subscription.
  - `relays`: (Optional) An array of relay URLs to replace the current relay list for the subscription.
  - `webhook`: (Optional) A new webhook URL to replace the current webhook for the subscription.
- **tags**: Must include:
  - `["t", "subscription-update"]` to indicate this is a subscription update request.
  - `["p", "ADMIN_PUBKEY"]` to ensure the request is directed to the administrator.

### Example Request

```json
{
  "kind": 21111,
  "content": {
    "subscriptionId": "XXX",
    "filters": [
      {
        "authors": ["author1"],
        "kinds": [1, 2],
      }
    ],
    "relays": [
      "wss://relay.example.com/",
      "wss://another-relay.example.com/"
    ],
    "webhook": "https://webhook.example.com"
  },
  "tags": [
    ["t", "subscription-update"],
    ["p", "ADMIN_PUBKEY"]
  ],
  "pubkey": "USER_PUBKEY",
  "sig": "VALID_SIGNATURE"
}
```

### Validation

The server will validate the following:
1. **Signature**: The event must be signed by the `pubkey` specified in the request.
2. **Event Structure**:
   - The tag `["t", "subscription-update"]` must be present to indicate a subscription update request.
   - The tag `["p", "ADMIN_PUBKEY"]` must be included to ensure the request is directed to the admin.
   - The `content` must be a JSON object containing a valid `subscriptionId`.
3. **Subscription Existence**:
   - The `subscriptionId` must correspond to an existing subscription for the user.
4. **Optional Fields**:
   - If provided, `filters` must be a valid array of filters.
   - If provided, `relays` must be an array of valid relay URLs.
   - If provided, `webhook` must be a valid URL.

## Response

If the request is valid and the subscription is updated successfully, the server will return a success response.

### Example Response

```json
{
  "success": true,
  "message": "Subscription updated successfully."
}
```

If the validation fails or the subscription does not exist, the server will return an error.

### Example Error Response

```json
{
  "success": false,
  "error": "Subscription not found or validation failed."
}
```

### Notes
- The `subscriptionId` uniquely identifies the subscription to be updated.
- This endpoint ensures that only the user associated with the `pubkey` in the request can update their subscriptions.
- Updates replace the specified fields (`filters`, `relays`, `webhook`) entirely; any field not included in the request will remain unchanged.
