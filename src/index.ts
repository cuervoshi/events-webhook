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
const outbox = new DirectOutbox(writeNdk);
const subManager = new SubscriptionManager(prisma, outbox, getReadNDK());

const context: ExtendedContext = {
  outbox,
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
} catch (err) {
  console.log(err)
}