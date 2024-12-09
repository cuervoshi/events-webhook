import { PrismaClient } from '@prisma/client';
import {
  DefaultContext,
  DirectOutbox,
  getReadNDK,
  getWriteNDK,
  Module,
  requiredEnvVar,
} from 'lw-test-module';
import path from 'path';
import { fileURLToPath } from 'url';
import SubscriptionManager from './services/subscriptions.js';

export type ExtendedContext = DefaultContext & { prisma: PrismaClient, subManager: SubscriptionManager };

const prisma = new PrismaClient()
const writeNDK = getWriteNDK();
const readNDK = getReadNDK();

const outbox = new DirectOutbox(writeNDK);
const subManager = new SubscriptionManager(prisma, outbox);

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