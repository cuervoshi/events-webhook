# NostWard

**NostWard** is a system that connects events from the **Nostr** protocol to external applications through webhooks.

## Key Features

1. **Subscriptions**  
   Allows users to subscribe to Nostr events using custom filters and receive notifications via webhooks.

2. **Credit Management**  
   Implements a credit-based system to control notifications sent to webhooks.

3. **Retry System**  
   A retry mechanism is implemented for webhook requests in case of failures, ensuring reliable delivery of notifications.

4. **Lightning Network Integration**  
   Credits can be purchased using Lightning payments, aligning with the decentralized philosophy of the Nostr protocol.

## Endpoint Documentation

### Credits
- [**Buy Credits**](./api-doc/credits/buy_credits.md)  
  Endpoint to handle credit purchase requests.

### Subscriptions
- [**Create Subscription**](./api-doc/subscriptions/create_subscription.md)  
  Creates a new subscription to receive events.
