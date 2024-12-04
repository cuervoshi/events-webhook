/*
  Warnings:

  - You are about to drop the column `lastEventId` on the `Subscriptions` table. All the data in the column will be lost.
  - The `lastSeenAt` column on the `Subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Subscriptions" DROP COLUMN "lastEventId",
DROP COLUMN "lastSeenAt",
ADD COLUMN     "lastSeenAt" INTEGER;
