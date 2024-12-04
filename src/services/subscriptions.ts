import { PrismaClient, Subscriptions as PrismaSubscription } from '@prisma/client';
import NDK, { NDKRelay, NDKSubscription, NDKEvent, NDKRelayStatus, NDKFilter } from '@nostr-dev-kit/ndk';
import { Debugger } from 'debug';
import { DirectOutbox, logger } from '@lawallet/module';
import redis from '@services/redis';
import { WebhookDispatcher } from './dispatcher';

const log: Debugger = logger.extend('services:subManager');

export class SubscriptionManager {
    private prisma: PrismaClient;
    private ndk: NDK;
    //private outbox: DirectOutbox;
    private dispatcher: WebhookDispatcher;
    private subscriptions: Map<string, { subscription: NDKSubscription; data: PrismaSubscription }> = new Map();

    constructor(prisma: PrismaClient, outbox: DirectOutbox, ndk: NDK) {
        this.prisma = prisma;
        this.ndk = ndk;
        //this.outbox = outbox;

        this.ndk.pool.on('relay:connect', (relay: NDKRelay) => {
            this.handleRelayConnect(relay);
        });

        this.loadSubscriptions();

        this.dispatcher = new WebhookDispatcher(prisma, outbox, this)        
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

        //log('All active subscriptions with valid credits have been loaded.');
    }

    async addSubscription(subscription: PrismaSubscription): Promise<void> {
        const { id, lastSeenAt, filters, relays, webhook } = subscription;

        const ndkSubscription = new NDKSubscription(this.ndk, this.adjustFilters(lastSeenAt, filters as NDKFilter[]), { closeOnEose: false })

        ndkSubscription.on('event', (event: NDKEvent) => {
            this.handleEvent(id, webhook, event);
        });

        // Store the subscription associated with this relay
        this.subscriptions.set(id, { subscription: ndkSubscription, data: subscription });

        for (const relayUrl of relays) {
            if (this.ndk.pool.relays.has(relayUrl)) {
                const relay = this.ndk.pool.relays.get(relayUrl);

                if (relay && relay.status === NDKRelayStatus.CONNECTED) {
                    relay.subscribe(ndkSubscription, ndkSubscription.filters);
                }
            } else {
                this.ndk.addExplicitRelay(relayUrl, undefined, true)
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
                    if (otherSubId !== subscriptionId && otherSub.data.relays.includes(relayUrl)) {
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

        await this.prisma.subscriptions.update({
            where: { id: subscriptionId },
            data: {
                active: false,
            },
        });

        log(`Subscription ${subscriptionId} deactivated.`);
    }

    public async updateLastSeenAt(subscriptionId: string, timestamp: number): Promise<void> {
        const newSub = await this.prisma.subscriptions.update({
            where: { id: subscriptionId },
            data: {
                lastSeenAt: timestamp,
            },
        });

        this.updateSubscription(newSub)
        log(`Subscription ${subscriptionId} lastSeenAt updated to ${timestamp}.`);
    }

    private async handleEvent(subscriptionId: string, webhook: string, event: NDKEvent): Promise<void> {
        log(`Event received for subscription ${subscriptionId}:`, event.id);


        if (event.id === undefined) {
            throw new Error('Received event without id from relay');
        }

        if ((await redis.hGet(`${subscriptionId}:${event.id}`, 'handled') !== null)) {
            log('Already handled event %s', event.id);
            return;
        }

        let nostrEvent = await event.toNostrEvent()

        this.dispatcher.enqueueWebhook(nostrEvent, subscriptionId, webhook)
    }

    private adjustFilters(lastSeenAt: number | null, filters: NDKFilter[]) {
        const adjustedFilters = lastSeenAt ? filters.map(filter => {
            const adjustedFilter = { ...filter };
            if (lastSeenAt) {
                adjustedFilter.since = lastSeenAt;
            }
            return adjustedFilter;
        }) : filters;

        return adjustedFilters;
    }

    private handleRelayConnect(relay: NDKRelay): void {
        log(`relay connected: ${relay.url}`);

        // Re-subscribe for all subscriptions that include this relay
        for (const [id, { subscription, data }] of this.subscriptions.entries()) {
            if (data.relays.includes(relay.url)) {
                relay.subscribe(subscription, this.adjustFilters(data.lastSeenAt, subscription.filters));
                log(`re-subscribed subscription ${id} to relay ${relay.url}`);
            }
        }
    }
}
