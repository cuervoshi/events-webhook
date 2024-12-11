import {
  PrismaClient,
  Subscriptions as PrismaSubscription,
} from '@prisma/client';
import NDK, {
  NDKRelay,
  NDKSubscription,
  NDKEvent,
  NDKRelayStatus,
  NDKFilter,
} from '@nostr-dev-kit/ndk';
import { Debugger } from 'debug';
import {
  DirectOutbox,
  logger,
  nowInSeconds,
  requiredEnvVar,
} from 'lw-test-module';
import redis from './redis';
import { WebhookDispatcher } from './dispatcher';
import { buildSubscriptionsEvent, buildUserCreditsEvent } from '@lib/events';
import { nip04 } from 'nostr-tools';
import { getWriteRelaySet } from '@lib/utils';

const log: Debugger = logger.extend('services:subManager');

class SubscriptionManager {
  private prisma: PrismaClient;
  private ndk: NDK;
  private outbox: DirectOutbox;
  private dispatcher: WebhookDispatcher;
  private subscriptions: Map<
    string,
    { subscription: NDKSubscription; data: PrismaSubscription }
  > = new Map();

  constructor(prisma: PrismaClient, outbox: DirectOutbox, ndk?: NDK) {
    this.prisma = prisma;
    this.ndk = ndk ?? new NDK();
    this.outbox = outbox;

    this.ndk.pool.on('relay:connect', (relay: NDKRelay) => {
      this.handleRelayConnect(relay);
    });

    this.loadSubscriptions();

    this.dispatcher = new WebhookDispatcher(prisma, outbox, this);
  }

  async loadSubscriptions(): Promise<void> {
    const dbSubscriptions = await this.prisma.subscriptions.findMany({
      where: {
        active: true,
        Identity: {
          credits: { gt: 0 },
        },
      },
      include: {
        Identity: true,
      },
    });

    for (const sub of dbSubscriptions) {
      await this.addSubscription(sub);
    }

    log('All active subscriptions with valid credits have been loaded.');
  }

  public async discountCredit(subscriptionId: string): Promise<void> {
    await this.prisma.$transaction(async (prisma) => {
      // Retrieve the subscription and the user's identity
      const subscription = await prisma.subscriptions.findUnique({
        where: { id: subscriptionId },
        include: { Identity: true },
      });

      if (!subscription || !subscription.Identity) {
        throw new Error(
          `Subscription or Identity not found for subscriptionId ${subscriptionId}`,
        );
      }

      const userId = subscription.Identity.id;

      // Atomically decrement the user's credits, ensuring they do not become negative
      const result = await prisma.$queryRaw<{ credits: number }[]>`
                UPDATE "Identity"
                SET credits = CASE WHEN credits > 0 THEN credits - 1 ELSE 0 END
                WHERE id = ${userId}
                RETURNING credits;
            `;

      const updatedCredits = result[0]?.credits;

      if (updatedCredits === undefined) {
        throw new Error('Failed to update credits');
      }

      const relaySet = getWriteRelaySet();

      await this.outbox.publish(
        buildUserCreditsEvent(subscription.Identity.pubkey, updatedCredits),
        relaySet,
      );
      log(`User ${userId} credits updated to ${updatedCredits}`);

      // If the user's credits are zero or less after the update, deactivate all their subscriptions
      if (updatedCredits <= 0) {
        // Retrieve all active subscriptions of the user
        const activeSubscriptions = await prisma.subscriptions.findMany({
          where: {
            userId,
            active: true,
          },
        });

        // Deactivate each subscription
        for (const sub of activeSubscriptions) {
          await this.deactivateSubscription(sub.id);
        }

        log(
          `All active subscriptions for user ${userId} have been deactivated due to zero credits.`,
        );
      }
    });
  }

  async addSubscription(subscription: PrismaSubscription): Promise<void> {
    const { id, lastSeenAt, filters, relays, webhook } = subscription;

    const ndkSubscription = new NDKSubscription(
      this.ndk,
      this.adjustFilters(lastSeenAt, filters as NDKFilter[]),
      { closeOnEose: false },
    );

    ndkSubscription.on('event', (event: NDKEvent) => {
      this.handleEvent(id, webhook, event);
    });

    // Store the subscription associated with this relay
    this.subscriptions.set(id, {
      subscription: ndkSubscription,
      data: subscription,
    });

    for (const relayUrl of relays) {
      if (this.ndk.pool.relays.has(relayUrl)) {
        const relay = this.ndk.pool.relays.get(relayUrl);

        if (relay && relay.status === NDKRelayStatus.CONNECTED) {
          relay.subscribe(ndkSubscription, ndkSubscription.filters);
        }
      } else {
        this.ndk.addExplicitRelay(relayUrl, undefined, true);
      }
    }

    log(`Subscription ${id} added.`);
  }

  async removeSubscription(subscriptionId: string): Promise<void> {
    const sub = this.subscriptions.get(subscriptionId);

    if (sub) {
      sub.subscription.stop();
      sub.subscription.removeAllListeners();
      this.subscriptions.delete(subscriptionId);
      log(`Subscription ${subscriptionId} removed.`);

      const relaysToCheck = sub.data.relays;
      for (const relayUrl of relaysToCheck) {
        let isRelayUsed = false;

        for (const [otherSubId, otherSub] of this.subscriptions.entries()) {
          if (
            otherSubId !== subscriptionId &&
            otherSub.data.relays.includes(relayUrl)
          ) {
            isRelayUsed = true;
            break;
          }
        }

        if (!isRelayUsed) {
          const relay = this.ndk.pool.relays.get(relayUrl);
          if (relay) {
            relay.disconnect();
            this.ndk.pool.relays.delete(relayUrl);
            log(`Relay ${relayUrl} disconnected and removed from NDK pool.`);
          }
        }
      }
    }
  }

  async updateSubscription(subscription: PrismaSubscription): Promise<void> {
    await this.removeSubscription(subscription.id);
    await this.addSubscription(subscription);
    log(`Subscription ${subscription.id} updated.`);
  }

  public async deactivateSubscription(subscriptionId: string): Promise<void> {
    await this.removeSubscription(subscriptionId);

    let updatedSub = await this.prisma.subscriptions.update({
      where: { id: subscriptionId },
      data: {
        active: false,
      },
      select: {
        Identity: true,
      },
    });

    this.generateSubscriptionsEvent(updatedSub.Identity.pubkey);

    log(`Subscription ${subscriptionId} deactivated.`);
  }

  public async updateLastSeenAt(
    subscriptionId: string,
    timestamp: number,
  ): Promise<void> {
    const newSub = await this.prisma.subscriptions.update({
      where: { id: subscriptionId },
      data: {
        lastSeenAt: timestamp,
      },
    });

    this.updateSubscription(newSub);
    log(`Subscription ${subscriptionId} lastSeenAt updated to ${timestamp}.`);
  }

  private async handleEvent(
    subscriptionId: string,
    webhook: string,
    event: NDKEvent,
  ): Promise<void> {
    log(`Event received for subscription ${subscriptionId}:`, event.id);

    if (event.id === undefined) {
      throw new Error('Received event without id from relay');
    }

    if (
      (await redis.hGet(`${subscriptionId}:${event.id}`, 'handled')) !== null
    ) {
      log('Already handled event %s', event.id);
      return;
    }

    let nostrEvent = await event.toNostrEvent();
    this.dispatcher.enqueueWebhook(nostrEvent, subscriptionId, webhook);
    this.updateLastSeenAt(
      subscriptionId,
      event.created_at ? event.created_at + 1 : nowInSeconds() + 1,
    );
  }

  private adjustFilters(lastSeenAt: number | null, filters: NDKFilter[]) {
    const adjustedFilters = lastSeenAt
      ? filters.map((filter) => {
          const adjustedFilter = { ...filter };
          if (lastSeenAt) {
            adjustedFilter.since = lastSeenAt;
          }
          return adjustedFilter;
        })
      : filters;

    return adjustedFilters;
  }

  private handleRelayConnect(relay: NDKRelay): void {
    log(`relay connected: ${relay.url}`);

    // Re-subscribe for all subscriptions that include this relay
    for (const [id, { subscription, data }] of this.subscriptions.entries()) {
      if (data.relays.includes(relay.url)) {
        relay.subscribe(
          subscription,
          this.adjustFilters(data.lastSeenAt, subscription.filters),
        );
        log(`subscribed subscription ${id} to relay ${relay.url}`);
      }
    }
  }

  public async generateSubscriptionsEvent(
    userPubKey: string,
  ): Promise<boolean> {
    try {
      // Step 1: Retrieve all subscriptions of the user
      const subscriptions = await this.prisma.subscriptions.findMany({
        where: {
          Identity: {
            pubkey: userPubKey,
          },
        },
        select: {
          id: true,
          filters: true,
          relays: true,
          webhook: true,
          active: true,
          _count: {
            select: {
              EventLogs: true,
            },
          },
        },
      });

      // Format the subscriptions
      const formattedSubscriptions = subscriptions.map((sub) => ({
        subscriptionId: sub.id,
        filters: sub.filters,
        relays: sub.relays,
        webhook: sub.webhook,
        eventLogs: sub._count.EventLogs,
        active: sub.active ? 1 : 0,
      }));

      // Step 2: Create the content JSON
      const contentObject = {
        subscriptions: formattedSubscriptions,
      };

      const contentString = JSON.stringify(contentObject);

      // Step 3: Encrypt the content using NIP-04
      const encryptedContent = await nip04.encrypt(
        requiredEnvVar('NOSTR_PRIVATE_KEY'),
        userPubKey,
        contentString,
      );

      const relaySet = getWriteRelaySet();

      // Step 4: Publish event
      await this.outbox.publish(
        buildSubscriptionsEvent(encryptedContent, userPubKey),
        relaySet,
      );
      log(
        `Subscriptions event for user ${userPubKey} generated and published.`,
      );

      return true;
    } catch (err) {
      log('Error publishing subscription event: ', (err as Error).message);
      return false;
    }
  }
}

export default SubscriptionManager;
