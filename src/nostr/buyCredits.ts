import { EventHandler, logger, requiredEnvVar } from 'lw-test-module';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { NDKFilter, NostrEvent } from 'node_modules/@nostr-dev-kit/ndk/dist';
import redis from '@services/redis';
import { Debugger } from 'debug';
import { ExtendedContext } from '..';
import { buildBuyCreditEvent, buildUserCreditsEvent } from '@lib/events';
import { getWriteRelaySet } from '@lib/utils';

const log: Debugger = logger.extend('nostr:buyCredits');
const warn: Debugger = log.extend('warn');
const error: Debugger = log.extend('error');

const invoiceAmountRegex: RegExp = /^\D+(?<amount>\d+)(?<multiplier>[mnpu]?)1/i;

const filter: NDKFilter = {
  authors: ['e17feb5f2cf83546bcf7fd9c8237b05275be958bd521543c2285ffc6c2d654b3'],
  kinds: [9735],
  '#p': [requiredEnvVar('NOSTR_PUBLIC_KEY')],
  since: Math.floor(Date.now() / 1000) - 86000,
  until: Math.floor(Date.now() / 1000) + 86000,
};

/**
 * Extract invoice amount in millisats from invoice
 */
function extractAmount(invoice: string): bigint | null {
  const matches = invoice.match(invoiceAmountRegex);

  if (matches && matches.groups) {
    const multipliers: Record<string, bigint> = {
      n: BigInt(1e2),     // nanobitcoin
      u: BigInt(1e5),     // microbitcoin
      m: BigInt(1e8),     // millibitcoin
      '': BigInt(1e11),   // bitcoin
    };
    try {
      if (!matches.groups['multiplier'] || !matches.groups['amount']) return null;

      // Convierte la cantidad y multiplica
      const amount = BigInt(matches.groups['amount']);
      const multiplier = multipliers[matches.groups['multiplier'].toLowerCase()];

      if (multiplier === undefined) return null;

      return amount * multiplier;
    } catch {
      error('Unparsable invoice amount');
    }
  }

  return null;
}

/**
 * Extract value of first 'bolt11' tag, or null if none found
 */
function extractBolt11(event: NostrEvent): string | null {
  const bolt11 = event.tags.find((t) => 'bolt11' === t[0]);
  if (undefined !== bolt11 && bolt11[1]) {
    return bolt11[1];
  }
  return null;
}

function extractZapRequest(event: NostrEvent): string | null {
  const zapRequest = event.tags.find((t) => 'description' === t[0]);

  if (undefined !== zapRequest && zapRequest[1]) {
    return zapRequest[1];
  }
  return null;
}

function getHandler(
  _ctx: ExtendedContext,
): EventHandler {
  return async (event: NostrEvent): Promise<void> => {
    const nostrEvent = await (event as NDKEvent).toNostrEvent();

    if (event.id === undefined) {
      throw new Error('Received event without id from relay');
    }

    if ((await redis.hGet(event.id, 'handled') !== null)) {
      log('Already handled event %s', event.id);
      return;
    }

    log('Received zap receipt:', nostrEvent.id);

    try {
      const bolt11 = extractBolt11(nostrEvent);

      if (null === bolt11) {
        warn('Received zap without invoice');
        return;
      }

      const amount = extractAmount(bolt11);
      if (null === amount || amount < 1000) {
        throw new Error('The amount is less than 1000 mSat')
      }
      
      const description = extractZapRequest(event)
      if (null === description) {
        throw new Error('Zap request not found')
      }

      const zapRequest = JSON.parse(description)
      if (!zapRequest || zapRequest.pubkey !== requiredEnvVar("NOSTR_PUBLIC_KEY")) {
        log('The zap request was not issued by the admin public key');
        return;
      }

      const { receiver: pubkey } = JSON.parse(zapRequest.content);
      if (!pubkey) {
        log('Receiver pubkey not found');
        return;
      }

      const credits = (Number(amount.toString()) / 1000) * 10;

      const identity = await _ctx.prisma.identity.upsert({
        where: { pubkey },
        update: { credits: { increment: credits } },
        create: {
          pubkey,
          credits,
        },
      });

      await _ctx.prisma.creditPurchase.create({
        data: {
          userId: identity.id,
          amount: credits,
          zapReceipt: nostrEvent,
        }
      });

      const relaySet = getWriteRelaySet();
      
      await _ctx.outbox.publish(buildUserCreditsEvent(identity.pubkey, identity.credits), relaySet);
      await _ctx.outbox.publish(buildBuyCreditEvent(identity.pubkey, credits), relaySet);
      log(`Added ${credits} credits to user with pubkey: ${pubkey}`);
      
      await redis.hSet(event.id, 'handled', 'true');
      log(`Marked event ${event.id} as handled`);

    } catch (err) {
      error(`Error processing zap receipt: ${(err as Error).message}`);
    }
  };
}

export { filter, getHandler };