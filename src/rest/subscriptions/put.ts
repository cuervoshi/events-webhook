import { ExtendedContext } from '@src/index';
import { ExtendedRequest, getTagValue, logger, parseEventBody } from '@lawallet/module';
import { z } from 'zod';
import { Response } from 'express';
import { Debugger } from 'debug';

const log: Debugger = logger.extend('rest:subscriptions:update');

// Zod schema for validating the update subscription request body
const UpdateSubscriptionRequestSchema = z.object({
    subscriptionId: z.string().min(1, "Subscription ID is required"),
    filters: z.array(
        z.object({
            ids: z.array(z.string()).optional(),
            kinds: z.array(z.number()).optional(),
            authors: z.array(z.string()).optional(),
            since: z.number().optional(),
            until: z.number().optional(),
            limit: z.number().optional(),
            search: z.string().optional(),
        }).catchall(z.array(z.string()).optional())
    ).optional(),
    relays: z.array(z.string().url()).optional(),
    webhook: z.string().url().optional(),
});

// Define a type for the updateData object
type UpdateData = Partial<{
    filters: Array<Record<string, any>>;
    relays: string[];
    webhook: string;
}>;

/**
 * Updates a subscription.
 */
async function handler(
    req: ExtendedRequest<ExtendedContext>,
    res: Response,
) {
    const reqEvent = parseEventBody(req.body);

    log(reqEvent);

    // Validate the Nostr event
    if (!reqEvent || reqEvent.kind !== 21111 || getTagValue(reqEvent, 't') !== 'subscription-update') {
        res.status(422).json({ success: false, message: 'Invalid event: must be of kind 21111 and contain tag "subscription-update"' });
        return;
    }

    try {
        // Validate the content of the event using Zod
        const { subscriptionId, filters, relays, webhook } = UpdateSubscriptionRequestSchema.parse(JSON.parse(reqEvent.content));

        // Find the user by their pubkey
        const user = await req.context.prisma.identity.findUnique({
            where: { pubkey: reqEvent.pubkey },
        });

        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        // Check if the subscription exists and belongs to the user
        const subscription = await req.context.prisma.subscriptions.findUnique({
            where: { id: subscriptionId },
        });

        if (!subscription || subscription.userId !== user.id) {
            res.status(404).json({ success: false, message: 'Subscription not found or does not belong to the user' });
            return;
        }

        // Prepare the data for updating the subscription
        const updateData: UpdateData = {};
        if (filters) updateData.filters = filters;
        if (relays) {
            updateData.relays = relays.map((relay) => {
                const url = new URL(relay);
                return url.href.endsWith('/') ? url.href : `${url.href}/`;
            });
        }
        if (webhook) updateData.webhook = webhook;

        // Update the subscription in the database
        const updatedSubscription = await req.context.prisma.subscriptions.update({
            where: { id: subscriptionId },
            data: updateData,
        });

        // Update the subscription state in the subscription manager
        req.context.subManager.updateSubscription(updatedSubscription);
        req.context.subManager.generateSubscriptionsEvent(user.pubkey);

        res.status(200).json({ success: true, subscription: updatedSubscription });
    } catch (error) {
        console.error(error);
        res.status(422).json({
            success: false,
            message: error instanceof z.ZodError ? error.errors : (error as Error).message,
        });
    }
}

export default handler;
