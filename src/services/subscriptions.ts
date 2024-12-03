import { PrismaClient, Subscriptions as PrismaSubscription } from '@prisma/client';
import NDK, { NDKRelay, NDKSubscription, NDKEvent, NDKRelayStatus, NDKFilter } from '@nostr-dev-kit/ndk';
import { Debugger } from 'debug';
import { logger } from '@lawallet/module';

const log: Debugger = logger.extend('services:subManager');

export class SubscriptionManager {
    private prisma: PrismaClient;
    private ndk: NDK;
    private subscriptions: Map<string, { subscription: NDKSubscription; data: PrismaSubscription }> = new Map();

    constructor(prisma: PrismaClient, ndk: NDK) {
        this.prisma = prisma;
        this.ndk = ndk;

        this.ndk.pool.on('relay:connect', (relay: NDKRelay) => {
            this.handleRelayConnect(relay);
        });

        this.loadSubscriptions();
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
        const { id, filters, relays, webhook } = subscription;

        const ndkSubscription = new NDKSubscription(this.ndk, filters as NDKFilter[], { closeOnEose: false })

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
            this.subscriptions.delete(subscriptionId);
            log(`Subscription ${subscriptionId} removed.`);
        }
    }

    async updateSubscription(subscription: PrismaSubscription): Promise<void> {
        await this.removeSubscription(subscription.id);
        await this.addSubscription(subscription);
        log(`Subscription ${subscription.id} updated.`);
    }

    private async handleEvent(subscriptionId: string, webhook: string, event: NDKEvent): Promise<void> {
        log(`Event received for subscription ${subscriptionId}:`, event.id);
        log(webhook)

        // Log the event in the database
        /*await this.prisma.eventLog.create({
            data: {
                subscriptionId,
                eventId: event.id,
                status: 'success',
            },
        });*/

        try {
            //await this.webhookService.sendWithRetries(webhook, event);
        } catch (error) {
            console.error(`Failed to send event to webhook for subscription ${subscriptionId}:`, error);
            /*await this.prisma.eventLog.updateMany({
                where: { subscriptionId, eventId: event.id },
                data: { status: 'failed', webhookResponse: (error as Error).message },
            });*/
        }
    }

    private handleRelayConnect(relay: NDKRelay): void {
        log(`Relay connected: ${relay.url}`);

        // Re-subscribe for all subscriptions that include this relay
        for (const [id, { subscription, data }] of this.subscriptions.entries()) {
            if (data.relays.includes(relay.url)) {
                relay.subscribe(subscription, subscription.filters);
                log(`Re-subscribed subscription ${id} to relay ${relay.url}`);
            }
        }
    }
}
