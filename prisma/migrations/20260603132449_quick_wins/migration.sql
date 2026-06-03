-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileUrl" TEXT,
ADD COLUMN     "pinnedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "lastDeliveredAt" TIMESTAMP(3),
ADD COLUMN     "muted" BOOLEAN NOT NULL DEFAULT false;
