/*
  Warnings:

  - Added the required column `attempt` to the `EventLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EventLog" ADD COLUMN     "attempt" INTEGER NOT NULL;
