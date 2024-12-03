import fetch, { Response } from 'node-fetch';
import { PrismaClient } from '@prisma/client';
import { Debugger } from 'debug';
import { DirectOutbox, logger } from '@lawallet/module';
import redis from '@services/redis'

const log: Debugger = logger.extend('services:webhook');
const warn: Debugger = log.extend('warn');
const error: Debugger = log.extend('error');

export class WebhookService {
  private webhookUrl: string;
  private maxRetries: number;
  private retryDelay: number; // Base delay in milliseconds
  private prisma: PrismaClient;
  private outbox: DirectOutbox;

  constructor(webhookUrl: string, prisma: PrismaClient, outbox: DirectOutbox, maxRetries = 5, retryDelay = 5000) {
    // Validate the webhook URL
    try {
      const url = new URL(webhookUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`Invalid webhook URL protocol: ${webhookUrl}`);
      }
      this.webhookUrl = url.href;
    } catch (error) {
      throw new Error(`Invalid webhook URL: ${webhookUrl}`);
    }

    this.prisma = prisma;
    this.outbox = outbox;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  /**
   * Sends an event to the webhook URL with retries on failure.
   * Logs the event in the database whether it succeeds or fails.
   * @param event - The event data to send.
   * @param subscriptionId - The ID of the subscription associated with the event.
   * @returns A promise that resolves when the event is processed.
   */
  async sendEvent(event: any, subscriptionId: string): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.maxRetries) {
      attempt++;
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });

        if (this.isSuccessfulResponse(response)) {
          log(`Webhook sent successfully to ${this.webhookUrl} with event id ${event.id}`);

          // Log the event as successful
          await this.logEvent(subscriptionId, event.id, 'success', null);

          await redis.hSet(event.id, 'handled', 'true');
          log(`Marked event ${event.id} as handled`);

          // Update lastEventId and lastSeenAt in the subscription
          await this.prisma.subscriptions.update({
            where: { id: subscriptionId },
            data: {
              lastEventId: event.id,
              lastSeenAt: new Date(),
            },
          });

          return;
        } else {
          const errorMessage = `Webhook failed with status ${response.status}`;
          throw new Error(errorMessage);
        }
      } catch (err) {
        lastError = err as Error;
        warn(`Attempt ${attempt} to send webhook failed:`, lastError.message);

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * attempt;
          log(`Retrying in ${delay / 1000} seconds...`);
          await this.delay(delay);
        } else {
          error(`All ${this.maxRetries} attempts to send webhook failed.`);

          // Log the event as failed
          await this.logEvent(subscriptionId, event.id, 'failed', lastError.message);

          // Deactivate the subscription
          await this.prisma.subscriptions.update({
            where: { id: subscriptionId },
            data: {
              active: false,
            },
          });

          throw lastError;
        }
      }
    }
  }

  /**
   * Determines if the response is a successful HTTP status code (2xx).
   * @param response - The fetch response object.
   * @returns True if the response is successful, false otherwise.
   */
  private isSuccessfulResponse(response: Response): boolean {
    return response.status >= 200 && response.status < 300;
  }

  /**
   * Delays execution for a specified amount of time.
   * @param ms - The delay duration in milliseconds.
   * @returns A promise that resolves after the delay.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Logs the event in the database.
   * @param subscriptionId - The ID of the subscription associated with the event.
   * @param eventId - The ID of the event.
   * @param status - The status of the event ('success' or 'failed').
   * @param webhookResponse - The response message or error, if any.
   */
  private async logEvent(subscriptionId: string, eventId: string, status: string, webhookResponse: string | null): Promise<void> {
    await this.prisma.eventLog.create({
      data: {
        subscriptionId,
        eventId,
        status: status as any,
        webhookResponse,
      },
    });

    console.log(this.outbox)
    //await this.outbox.publish(buildLogEvent(...))
  }
}
