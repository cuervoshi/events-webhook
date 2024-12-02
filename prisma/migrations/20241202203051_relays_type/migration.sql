/*
  Warnings:

  - The `relays` column on the `Subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Subscriptions" DROP COLUMN "relays",
ADD COLUMN     "relays" TEXT[];
