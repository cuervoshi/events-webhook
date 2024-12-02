import { DefaultContext, ExtendedRequest, getWriteNDK, nowInSeconds, parseEventBody, requiredEnvVar } from '@lawallet/module';
import { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';
import type { Response } from 'express';

const ADMIN_PUBKEY = requiredEnvVar("NOSTR_PUBLIC_KEY");
const NOSTR_RELAYS = requiredEnvVar('NOSTR_RELAYS').split(',')
const MSATS_FOR_CREDIT = 100; //1 credit = 100 msats

/**
 * Validates a Credits Request (event kind 21111).
 * @param event - The Nostr event to validate.
 * @returns {boolean} - `true` if the event is valid, otherwise throws an error.
 * @throws {Error} - If the event does not meet the validation criteria.
 */
function validateCreditsRequest(event: NostrEvent): boolean {
    if (!event || event.kind !== 21111) {
        throw new Error('Invalid event: must be of kind 21111');
    }

    if (!event.tags || !Array.isArray(event.tags)) {
        throw new Error('Invalid event: missing or invalid tags');
    }

    // Validate the "t" tag for "buy-credits"
    const tTag = event.tags.find((tag) => tag[0] === 't' && tag[1] === 'buy-credits');
    if (!tTag) {
        throw new Error('Invalid Credits Request: must include a "t" tag with value "buy-credits"');
    }

    return true;
}

async function generateZapRequest(pubkey: string, credits: number) {
    const writeNdk = getWriteNDK();
    const event = new NDKEvent(writeNdk, {
        pubkey: ADMIN_PUBKEY,
        created_at: nowInSeconds(),
        kind: 9734,
        content: JSON.stringify({ receiver: pubkey }),
        tags: [
            ['amount', (credits * MSATS_FOR_CREDIT).toString()],
            ['p', ADMIN_PUBKEY],
            ['relays', ...NOSTR_RELAYS]
        ]
    })

    await event.sign();
    return event.toNostrEvent();
}
async function handler<Context extends DefaultContext>(
    req: ExtendedRequest<Context>,
    res: Response,
) {
    const reqEvent: NostrEvent | null = parseEventBody(req.body);

    if (!reqEvent) {
        res.status(422).send();
        return;
    }

    try {
        const isValidRequest = validateCreditsRequest(reqEvent);
        if (!isValidRequest) throw new Error("Invalid request");

        // Validate the "amount" tag for credits
        const amountTag = reqEvent.tags.find((tag) => tag[0] === 'amount');
        const credits = amountTag && parseInt(amountTag[1] || '', 10);

        if (!credits || !amountTag || isNaN(credits) || credits < 10) {
            throw new Error('Invalid Credits Request: must include an "amount" tag with at least 10 credits');
        }

        const zapRequest = await generateZapRequest(reqEvent.pubkey, credits);
        const nostr = encodeURI(JSON.stringify(zapRequest));
        
        const callbackResponse = await fetch(`https://api.lawallet.ar/lnurlp/${ADMIN_PUBKEY}/callback?amount=${credits * MSATS_FOR_CREDIT}&nostr=${nostr}`)
        const { pr } = await callbackResponse.json() as { pr: string };

        res.status(200).json({ success: true, message: pr }).send();
    } catch (error) {
        res.status(422).json({ success: 'false', message: (error as Error).message })
    }

}

export default handler;