import { db } from "../client";
import { papers } from "../schemas/papers";
import { eq } from "drizzle-orm";
import pLimit from "p-limit";

interface DateCheckResult {
  universalId: string;
  storedDate: Date;
  impliedDate: Date | null;
  isValidFormat: boolean;
  datesMatch: boolean;
}

function parsePublicationDateFromUniversalId(universalId: string): {
  isValid: boolean;
  date: Date | null;
} {
  // Check if format is valid: 4 digits followed by a period
  const formatRegex = /^\d{4}\./;
  if (!formatRegex.test(universalId)) {
    return { isValid: false, date: null };
  }

  // Extract first 4 digits (YYMM)
  const yymm = universalId.substring(0, 4);
  const yearStr = yymm.substring(0, 2);
  const monthStr = yymm.substring(2, 4);

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // Validate month (01-12)
  if (month < 1 || month > 12) {
    return { isValid: false, date: null };
  }

  // Convert YY to full year (assuming 20YY for years 00-99)
  // For years 00-99, assume 2000-2099
  const fullYear = 2000 + year;

  // Create date (month is 0-indexed in JS Date)
  const date = new Date(fullYear, month - 1, 1);

  return { isValid: true, date };
}

function datesMatch(date1: Date, date2: Date): boolean {
  // Compare year and month only (ignore day/time)
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
}

function monthsDifference(date1: Date, date2: Date): number {
  // Calculate the absolute difference in months
  const yearDiff = date1.getFullYear() - date2.getFullYear();
  const monthDiff = date1.getMonth() - date2.getMonth();
  return Math.abs(yearDiff * 12 + monthDiff);
}

function isMoreThan3MonthsOff(date1: Date, date2: Date): boolean {
  return monthsDifference(date1, date2) > 3;
}

async function checkPublicationDates() {
  console.log("Fetching all papers...\n");

  const allPapers = await db
    .select({
      universalId: papers.universalId,
      publicationDate: papers.publicationDate,
    })
    .from(papers);

  if (allPapers.length === 0) {
    console.log("No papers found in database.");
    return;
  }

  console.log(`Found ${allPapers.length} papers\n`);

  const results: DateCheckResult[] = [];
  let invalidFormatCount = 0;
  let mismatchCount = 0;
  let moreThan3MonthsOffCount = 0;

  for (const paper of allPapers) {
    const { isValid, date: impliedDate } = parsePublicationDateFromUniversalId(
      paper.universalId
    );

    if (!isValid) {
      invalidFormatCount++;
    }

    let datesMatchResult = false;
    if (isValid && impliedDate) {
      datesMatchResult = datesMatch(paper.publicationDate, impliedDate);
      if (!datesMatchResult) {
        mismatchCount++;
      }
      if (isMoreThan3MonthsOff(paper.publicationDate, impliedDate)) {
        moreThan3MonthsOffCount++;
      }
    }

    results.push({
      universalId: paper.universalId,
      storedDate: paper.publicationDate,
      impliedDate: impliedDate,
      isValidFormat: isValid,
      datesMatch: datesMatchResult,
    });
  }

  // Print summary
  console.log("=".repeat(80));
  console.log("PUBLICATION DATE CHECK SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total papers: ${allPapers.length}`);
  console.log();

  // Update papers with mismatched dates to implied date
  const papersToUpdate = results.filter(
    (r) => r.isValidFormat && !r.datesMatch && r.impliedDate
  );

  let updatedCount = 0;

  if (papersToUpdate.length > 0) {
    console.log("=".repeat(80));
    console.log("UPDATING DATES TO IMPLIED DATE");
    console.log("=".repeat(80));
    console.log(
      `Updating ${papersToUpdate.length} papers to implied date...\n`
    );

    const updateTotal = papersToUpdate.length;
    let updateCompleted = 0;
    const updateProgressInterval = Math.max(1, Math.floor(updateTotal / 20));

    const updateLimit = pLimit(50);
    const updatePromises = papersToUpdate.map((paper) =>
      updateLimit(async () => {
        await db
          .update(papers)
          .set({ publicationDate: paper.impliedDate! })
          .where(eq(papers.universalId, paper.universalId));

        updateCompleted++;

        // Log progress periodically
        if (
          updateCompleted % updateProgressInterval === 0 ||
          updateCompleted === updateTotal
        ) {
          const percentage = Math.round((updateCompleted / updateTotal) * 100);
          process.stdout.write(
            `\rUpdate progress: ${updateCompleted}/${updateTotal} (${percentage}%)`
          );
        }
      })
    );

    await Promise.all(updatePromises);

    // Clear the progress line
    process.stdout.write("\r" + " ".repeat(50) + "\r");

    updatedCount = papersToUpdate.length;
    console.log(`Updated ${updatedCount} publication dates in database`);
  }

  // Delete all papers with invalid format
  const papersToDelete = results.filter((r) => !r.isValidFormat);

  let deletedCount = 0;

  if (papersToDelete.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("DELETING PAPERS WITH INVALID FORMAT");
    console.log("=".repeat(80));
    console.log(`Deleting ${papersToDelete.length} papers...\n`);

    const deleteTotal = papersToDelete.length;
    let deleteCompleted = 0;
    const deleteProgressInterval = Math.max(1, Math.floor(deleteTotal / 20));

    const deleteLimit = pLimit(50);
    const deletePromises = papersToDelete.map((paper) =>
      deleteLimit(async () => {
        await db
          .delete(papers)
          .where(eq(papers.universalId, paper.universalId));

        deleteCompleted++;

        // Log progress periodically
        if (
          deleteCompleted % deleteProgressInterval === 0 ||
          deleteCompleted === deleteTotal
        ) {
          const percentage = Math.round((deleteCompleted / deleteTotal) * 100);
          process.stdout.write(
            `\rDelete progress: ${deleteCompleted}/${deleteTotal} (${percentage}%)`
          );
        }
      })
    );

    await Promise.all(deletePromises);

    // Clear the progress line
    process.stdout.write("\r" + " ".repeat(50) + "\r");

    deletedCount = papersToDelete.length;
    console.log(`Deleted ${deletedCount} papers from database`);
  }

  // Print final counts at the very end
  console.log("=".repeat(80));
  console.log("FINAL COUNTS");
  console.log("=".repeat(80));
  console.log(`Invalid format: ${invalidFormatCount}`);
  console.log(`Incorrect date: ${mismatchCount}`);
  console.log(`More than 3 months off: ${moreThan3MonthsOffCount}`);
  if (papersToUpdate.length > 0) {
    console.log(`Dates updated in database: ${updatedCount}`);
  }
  if (papersToDelete.length > 0) {
    console.log(`Papers deleted: ${deletedCount}`);
  }
  console.log("=".repeat(80));
}

checkPublicationDates()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nError:", error);
    process.exit(1);
  });
