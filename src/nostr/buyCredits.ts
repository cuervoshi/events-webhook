import { EventHandler, logger } from '@lawallet/module';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { NDKFilter, NostrEvent } from 'node_modules/@nostr-dev-kit/ndk/dist';
import redis from '@services/redis';
import { Debugger } from 'debug';
import { ExtendedContext } from '..';

const log: Debugger = logger.extend('nostr:buyCredits');
const warn: Debugger = log.extend('warn');
const error: Debugger = log.extend('error');

const invoiceAmountRegex: RegExp = /^\D+(?<amount>\d+)(?<multiplier>[mnpu]?)1/i;

const filter: NDKFilter = {
  authors: ["e17feb5f2cf83546bcf7fd9c8237b05275be958bd521543c2285ffc6c2d654b3"],
  kinds: [9735],
  '#p': ["3f5a30545c6044c8ac445cd21b36921faf0c337e0ab59bde99e6cb864e971c68"],
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
      p: BigInt(1e-1), // picobitcoin
      n: BigInt(1e2), // nanobitcoin
      u: BigInt(1e5), // microbitcoin
      m: BigInt(1e8), // millibitcoin
      '': BigInt(1e11), // bitcoin (default)
    };

    try {
      if (!matches.groups["multiplier"] || !matches.groups["amount"]) return null;

      // Convierte la cantidad y multiplica
      const amount = BigInt(matches.groups["amount"]);
      const multiplier = multipliers[matches.groups["multiplier"].toLowerCase()];

      if (multiplier === undefined) return null;

      return amount * multiplier;
    } catch {
      error('Unparsable invoice amount');
    }
  }

  return null;
}

/**
 * Extract value of first "bolt11" tag, or null if none found
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

    if ((await redis.hGet(event.id, "handled") !== null)) {
      log('Already handled event %s', event.id);
      return;
    }

    log('Received zap receipt:', nostrEvent.id);

    try {
      const bolt11 = extractBolt11(nostrEvent);

      if (null === bolt11) {
        warn('Received internal tx without invoice');
        return;
      }

      const amount = extractAmount(bolt11);
      const description = extractZapRequest(event)

      if (null === description) {
        throw new Error("Zap request not found")
      }

      if (null === amount || amount < 1000) {
        throw new Error("The amount is less than 1000 mSat")
      }

      const zapRequest = JSON.parse(description)
      const pubkey = zapRequest.pubkey;
      if (!pubkey) {
        throw new Error("Zap request does not have a valid pubkey");
      }

      const credits = (Number(amount.toString()) / 1000) * 10;

      await _ctx.prisma.identity.upsert({
        where: { pubkey },
        update: { credits: { increment: credits } },
        create: {
          pubkey,
          credits,
        },
      });
      

      log(`Added ${credits} credits to user with pubkey: ${pubkey}`);

      // Setear el evento como "handled" en Redis para evitar procesarlo nuevamente
      await redis.hSet(event.id, "handled", "true");

      log(`Marked event ${event.id} as handled`);

    } catch (err) {
      error(`Error processing zap receipt: ${(err as Error).message}`);
    }
  };
}

export { filter, getHandler };
