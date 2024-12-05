# Delete Subscription

Allows a user to delete one of their existing subscriptions by sending an event to the administrator's public key. The subscription identified by its `subscriptionId` will be removed.

## Request
`DELETE /subscriptions`

### Parameters

The request body must contain a valid NOSTR event with the following structure:

- **content**: A JSON object containing the `subscriptionId` of the subscription to be deleted.
- **tags**: Must include:
  - `["t", "subscription-delete"]` to indicate this is a subscription deletion request.
  - `["p", "ADMIN_PUBKEY"]` to ensure the request is directed to the administrator.

### Example Request

{
  "kind": 21111,
  "content": {
    "subscriptionId": "XXX"
  },
  "tags": [
    ["t", "subscription-delete"],
    ["p", "ADMIN_PUBKEY"]
  ],
  "pubkey": "USER_PUBKEY",
  "sig": "VALID_SIGNATURE"
}

### Validation

The server will validate the following:
1. **Signature**: The event must be signed by the `pubkey` specified in the request.
2. **Event Structure**:
   - The tag `["t", "subscription-delete"]` must be present to indicate a subscription deletion request.
   - The tag `["p", "ADMIN_PUBKEY"]` must be included to ensure the request is directed to the admin.
   - The `content` must be a JSON object containing a valid `subscriptionId`.
3. **Subscription Existence**:
   - The `subscriptionId` must correspond to an existing subscription for the user.

## Response

If the request is valid and the subscription is deleted successfully, the server will return a success response.

### Example Response

{
  "success": true,
  "message": "Subscription deleted successfully."
}

If the validation fails or the subscription does not exist, the server will return an error.

### Example Error Response

{
  "success": false,
  "error": "Subscription not found."
}

### Notes
- The `subscriptionId` uniquely identifies the subscription to be deleted.
- This endpoint ensures that only the user associated with the `pubkey` in the request can delete their subscriptions.
- Deleting a subscription removes it entirely from the user's account, including all associated filters, relays, and webhooks.