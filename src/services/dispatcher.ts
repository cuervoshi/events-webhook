import fetch from 'node-fetch';
import { PrismaClient } from '@prisma/client';
import { DirectOutbox, logger, requiredEnvVar } from '@lawallet/module';
import { buildLogEvent } from '@lib/events';
import { NostrEvent } from '@nostr-dev-kit/ndk';
import { Queue, Worker, Job } from 'bullmq';
import redis from '@services/redis';
import { SubscriptionManager } from './subscriptions';

const log = logger.extend('services:webhook');

export class WebhookDispatcher {
  private prisma: PrismaClient;
  private outbox: DirectOutbox;
  private subscriptionManager: SubscriptionManager;
  private queue: Queue;

  constructor(
    prisma: PrismaClient,
    outbox: DirectOutbox,
    subscriptionManager: SubscriptionManager,
  ) {
    this.prisma = prisma;
    this.outbox = outbox;
    this.subscriptionManager = subscriptionManager;

    let connectionOptions = {
      url: requiredEnvVar("REDIS_URI")
    };

    this.queue = new Queue('webhookQueue', {
      connection: connectionOptions,
    });

    const worker = new Worker(
      'webhookQueue',
      async (job: Job) => {
        await this.processJob(job);
      },
      {
        connection: connectionOptions,
      }
    );

    worker.on('failed', async (job) => {
      if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        const { subscriptionId } = job.data;

        await this.subscriptionManager.deactivateSubscription(subscriptionId);
        log(`Subscription ${subscriptionId} deactivated due to webhook failure.`);
      }
    });
  }

  enqueueWebhook(event: NostrEvent, subscriptionId: string, webhookUrl: string): void {
    this.queue.add(
      'sendWebhook',
      { event, subscriptionId, webhookUrl },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: true,
      }
    );
  }

  private async processJob(job: Job): Promise<void> {
    const { event, subscriptionId, webhookUrl } = job.data;

    try {
      const cacheKey = `${subscriptionId}:${event.id}`;
      if ((await redis.hGet(cacheKey, 'handled')) !== null) {
        log(`Event ${event.id} already handled for subscription ${subscriptionId}`);
        return;
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      if (response.status >= 200 && response.status < 300) {
        log(`Webhook sent successfully to ${webhookUrl}`);

        const jsonResponse = JSON.stringify(await response.json());

        // Log success and update subscription
        await this.logEvent(subscriptionId, event.id, 'success', jsonResponse, job.attemptsMade);
        await this.subscriptionManager.discountCredit(subscriptionId);

        await redis.hSet(cacheKey, 'handled', 'true');
      } else {
        throw new Error(`Webhook failed with status ${response.status}`);
      }
    } catch (error) {
      log(`Attempt ${job.attemptsMade} to send webhook failed: ${(error as Error).message}`);

      // Log retried attempt
      await this.logEvent(
        subscriptionId,
        event.id,
        'retried',
        (error as Error).message,
        job.attemptsMade
      );

      throw error;
    }
  }

  private async logEvent(
    subscriptionId: string,
    eventId: string,
    status: string,
    webhookResponse: string | null,
    attempt: number
  ): Promise<void> {
    await this.prisma.eventLog.create({
      data: {
        subscriptionId,
        eventId,
        status: status as any,
        webhookResponse,
        attempt,
      },
    });

    await this.outbox.publish(buildLogEvent(subscriptionId, status, webhookResponse, attempt));
  }
}
