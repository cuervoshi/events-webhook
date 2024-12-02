import {
  Module,
  DefaultContext,
  getWriteNDK,
  DirectOutbox,
  requiredEnvVar,
} from '@lawallet/module';
import { PrismaClient } from '@prisma/client';

export type ExtendedContext = DefaultContext & { prisma: PrismaClient };

const context: ExtendedContext = {
  outbox: new DirectOutbox(getWriteNDK()),
  prisma: new PrismaClient(),
};

import path from 'path';
import {fileURLToPath} from 'url';

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