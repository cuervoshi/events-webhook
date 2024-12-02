import {
  Module,
  DefaultContext,
  getWriteNDK,
  DirectOutbox,
  requiredEnvVar,
  getReadNDK,
} from '@lawallet/module';
import { PrismaClient } from '@prisma/client';
import { SubscriptionManager } from './services/subscriptions.js';

export type ExtendedContext = DefaultContext & { prisma: PrismaClient, subManager: SubscriptionManager };

const prisma = new PrismaClient()
const writeNdk = getWriteNDK();
const subManager = new SubscriptionManager(prisma, getReadNDK());

const context: ExtendedContext = {
  outbox: new DirectOutbox(writeNdk),
  prisma,
  subManager
};

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const module = Module.build<ExtendedContext>({
    context,
    nostrPath: `${__dirname}/nostr`,
    port: Number(requiredEnvVar('PORT')),
    restPath: `${__dirname}/rest`,
  }) as Module<ExtendedContext>;

  void module.start();

  //subManager.addSubscription({ active: true, lastEventId: null, lastSeenAt: null, createdAt: new Date(), updatedAt: new Date(), id: "0", userId: "0", webhook: 'https://localhost:3000/', filters: [{ kinds: [1], authors: ["f1aa1718d8d77d0454fca553020d2b374c8ee386b2357b0d59cd261418533cbd"] }], relays: ["wss://relay.damus.io/", "wss://nos.lol/"] })
} catch (err) {
  console.log(err)
}