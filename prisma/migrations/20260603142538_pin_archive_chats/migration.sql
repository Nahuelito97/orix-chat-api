-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinnedChat" BOOLEAN NOT NULL DEFAULT false;
