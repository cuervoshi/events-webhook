import {
  Module,
  DefaultContext,
  getWriteNDK,
  DirectOutbox,
  requiredEnvVar,
  getReadNDK,
} from 'lw-test-module';
import { PrismaClient } from '@prisma/client';
import { SubscriptionManager } from './services/subscriptions.js';
import path from 'path';
import { fileURLToPath } from 'url';

export type ExtendedContext = DefaultContext & { prisma: PrismaClient, subManager: SubscriptionManager };

const prisma = new PrismaClient()
const writeNDK = getWriteNDK();
const readNDK = getReadNDK();

const outbox = new DirectOutbox(writeNDK);
const subManager = new SubscriptionManager(prisma, outbox, readNDK);

const context: ExtendedContext = {
  outbox,
  prisma,
  subManager
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const module = Module.build<ExtendedContext>({
    context,
    nostrPath: `${__dirname}/nostr`,
    port: Number(requiredEnvVar('PORT')),
    restPath: `${__dirname}/rest`,
    writeNDK,
    readNDK
  }) as Module<ExtendedContext>;

  void module.start();
} catch (err) {
  console.log(err)
}