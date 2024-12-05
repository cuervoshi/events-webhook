
import { ExtendedContext } from '@src/index';
import { ExtendedRequest, getTagValue, logger, parseEventBody } from '@lawallet/module';
import { z } from 'zod';
import { Response } from 'express';
import { Debugger } from 'debug';

const log: Debugger = logger.extend('rest:subscriptions:post');

const StaticNDKFilterSchema = z.object({
    ids: z.array(z.string()).optional(),
    kinds: z.array(z.number()).optional(),
    authors: z.array(z.string()).optional(),
    since: z.number().optional(),
    until: z.number().optional(),
    limit: z.number().optional(),
    search: z.string().optional(),
});

const NDKFilterSchema = StaticNDKFilterSchema.catchall(
    z.array(z.string()).optional()
);

const FiltersSchema = z.array(
    NDKFilterSchema.superRefine((obj, ctx) => {
        Object.keys(obj).forEach((key) => {
            if (key.startsWith("#")) {
                if (!/^#\w+$/.test(key)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Dynamic key "${key}" does not match pattern /^#\\w+$/`,
                        path: [key],
                    });
                }
            }
        });
    })
);

// Zod schema for the full request body
const SubscriptionRequestSchema = z.object({
    filters: FiltersSchema,
    relays: z.array(z.string()),
    webhook: z.string().url(),
});

/**
 * Validates and normalizes relay URLs.
 * @param relays - Array of relay URLs.
 * @returns Array of normalized relay URLs.
 * @throws Error if any relay is invalid.
 */
function validateAndNormalizeRelays(relays: string[]): string[] {
    return relays.map((relay) => {
        try {
            const url = new URL(relay);
            if (url.protocol !== 'wss:') {
                throw new Error(`Invalid relay protocol: ${relay}`);
            }
            return url.href.endsWith('/') ? url.href : `${url.href}/`;
        } catch (error) {
            throw new Error(`Invalid relay URL: ${relay}`);
        }
    });
}

/**
 * Creates a subscription.
 */
async function handler(
    req: ExtendedRequest<ExtendedContext>,
    res: Response,
) {
    const reqEvent = parseEventBody(req.body);

    log(reqEvent)
    if (!reqEvent || reqEvent.kind !== 21111 || getTagValue(reqEvent, 't') !== 'new-subscription') {
        res.status(422).json({ success: false, message: 'Invalid event: must be of kind 21111' });
        return;
    }
    

    try {
        // Validate the request body using Zod
        const { filters, relays, webhook } = SubscriptionRequestSchema.parse(JSON.parse(reqEvent.content));

        // Validate and normalize relay URLs
        const normalizedRelays = validateAndNormalizeRelays(relays);

        // Check if user exists and has sufficient credits
        const user = await req.context.prisma.identity.findUnique({
            where: { pubkey: reqEvent.pubkey },
        });

        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        if (user.credits < 1) {
            res.status(400).json({ success: false, message: 'Insufficient credits to create a subscription' });
            return;
        }

        // Create the subscription in the database
        const subscription = await req.context.prisma.subscriptions.create({
            data: {
                userId: user.id,
                filters,
                relays: normalizedRelays,
                webhook,
                active: true,
            },
        });

        req.context.subManager.addSubscription(subscription)
        req.context.subManager.generateSubscriptionsEvent(user.pubkey)

        res.status(201).json({ success: true, subscription });
    } catch (error) {
        console.error(error);
        res.status(422).json({ success: false, message: error instanceof z.ZodError ? error.errors : (error as Error).message });
    }
}

export default handler;
