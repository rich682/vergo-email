-- AlterTable
ALTER TABLE "CellFormula" ADD COLUMN     "autoExpand" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "expansionAxis" TEXT,
ADD COLUMN     "originalMaxCol" INTEGER,
ADD COLUMN     "originalMaxRow" INTEGER;
