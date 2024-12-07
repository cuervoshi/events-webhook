import { ExtendedContext } from '@src/index';
import { ExtendedRequest, getTagValue, logger, parseEventBody } from 'lw-test-module';
import { z } from 'zod';
import { Response } from 'express';
import { Debugger } from 'debug';

const log: Debugger = logger.extend('rest:subscriptions:delete');

// Zod schema for validating the delete subscription request body
const DeleteSubscriptionRequestSchema = z.object({
    subscriptionId: z.string().min(1, "Subscription ID is required"),
});

/**
 * Deletes a subscription.
 */
async function handler(
    req: ExtendedRequest<ExtendedContext>,
    res: Response,
) {
    const reqEvent = parseEventBody(req.body);

    if (!reqEvent || reqEvent.kind !== 21111 || getTagValue(reqEvent, 't') !== 'subscription-delete') {
        res.status(422).json({ success: false, message: 'Invalid event: must be of kind 21111 and contain tag "subscription-delete"' });
        return;
    }

    try {
        // Validate the request body using Zod
        const { subscriptionId } = DeleteSubscriptionRequestSchema.parse(JSON.parse(reqEvent.content));

        // Check if the user exists
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

        // Delete the subscription
        await req.context.prisma.subscriptions.delete({
            where: { id: subscriptionId },
        });

        req.context.subManager.removeSubscription(subscriptionId);
        req.context.subManager.generateSubscriptionsEvent(user.pubkey);

        res.status(200).json({ success: true, message: 'Subscription deleted successfully.' });
    } catch (error) {
        log(error);
        res.status(422).json({ success: false, message: error instanceof z.ZodError ? error.errors : (error as Error).message });
    }
}

export default handler;
