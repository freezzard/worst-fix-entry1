/**
 * worst-fix-entry1 — main.ts
 *
 * A tiny deterministic program for the make.fun quest
 * "Worst Fix Ever: Funniest Commit Message".
 *
 * The quest asks for one commit-message line, at most one hundred
 * characters, about a bug fix that made everything worse. This program
 * assembles that single line from named fragments, checks it against
 * the gate (one line, one to one hundred characters, not blank), writes
 * it to /output/entry.txt, reads the file back, and proves the bytes on
 * disk are exactly the line it intended to write.
 *
 * The joke: a duplicate-submission bug gets "fixed" so thoroughly that
 * the form cannot be submitted at all any more. The repair works —
 * nobody double-submits ever again — because the form no longer accepts
 * a single submission from anyone. The line descends in three beats:
 * twice, then once, then at all. That descent is the punchline, and the
 * plain "fix:" prefix keeps it sounding like a real subject line a
 * tired engineer would type at the end of a bad day.
 *
 * Fully deterministic: no network, no clock, no random source, no
 * environment input. Two runs produce byte-identical output.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Gate constants: the sealed scorer accepts UTF-8 text of 1 to 100
// characters, not only white space, on a single line.
const OUTPUT_DIRECTORY = "/output";
const OUTPUT_FILENAME = "entry.txt";
const GATE_MINIMUM_CHARS = 1;
const GATE_MAXIMUM_CHARS = 100;
const SPACE_SEPARATOR = " ";
const COMMA_SEPARATOR = ", ";
const NEWLINE_CHARACTER = "\n";
const EMPTY_TEXT = "";

// Line fragments: the commit message is assembled from these named parts
// so every word of the final line has one obvious home in the source.
const COMMIT_PREFIX = "fix:";
const SUBJECT_HEAD = "users can no longer submit the form twice";
const ESCALATION_BEATS = ["or once", "or at all"] as const;

// Small record types: every helper returns a named record, so no result
// ever travels as a bare literal through the program.
interface AssembledLine {
  readonly line: string;
  readonly charCount: number;
}

interface LineVerdict {
  readonly passed: boolean;
  readonly reason: string;
  readonly charCount: number;
}

interface WriteReceipt {
  readonly written: boolean;
  readonly reason: string;
  readonly targetPath: string;
}

interface ReadbackProof {
  readonly matches: boolean;
  readonly reason: string;
  readonly sha256Hex: string;
  readonly charCount: number;
}

// Assembly: join the prefix, the head, and the escalation beats with the
// separators a commit subject line would use.
function joinFragments(
  fragments: readonly string[],
  separator: string,
): string {
  let joinedText = EMPTY_TEXT;
  let fragmentIndex = 0;
  while (fragmentIndex < fragments.length) {
    const fragmentAtHand = fragments[fragmentIndex];
    const separatorNeeded = fragmentIndex > 0;
    const pieceToAppend = separatorNeeded
      ? separator + fragmentAtHand
      : fragmentAtHand;
    joinedText = joinedText + pieceToAppend;
    fragmentIndex = fragmentIndex + 1;
  }
  return joinedText;
}

function assembleCommitLine(): AssembledLine {
  const escalationTail = joinFragments(ESCALATION_BEATS, COMMA_SEPARATOR);
  const headWithTail = SUBJECT_HEAD + COMMA_SEPARATOR + escalationTail;
  const fullLine = COMMIT_PREFIX + SPACE_SEPARATOR + headWithTail;
  const assembledRecord: AssembledLine = {
    line: fullLine,
    charCount: countCharacters(fullLine),
  };
  return assembledRecord;
}

// Character counting: count code points, so any multi-byte character is
// one character, matching how a reader counts the line.
function countCharacters(textToMeasure: string): number {
  const codePoints = Array.from(textToMeasure);
  const measuredCount = codePoints.length;
  return measuredCount;
}

// Whitespace tidy: collapse every run of white space to a single space
// and trim both ends, so the line can never carry a stray double space.
function collapseWhitespaceRuns(rawText: string): string {
  const splitOnWhitespace = rawText.split(/\s+/u);
  const nonemptyPieces: string[] = [];
  let pieceIndex = 0;
  while (pieceIndex < splitOnWhitespace.length) {
    const pieceAtHand = splitOnWhitespace[pieceIndex];
    if (pieceAtHand.length > 0) {
      nonemptyPieces.push(pieceAtHand);
    }
    pieceIndex = pieceIndex + 1;
  }
  const tidiedText = joinFragments(nonemptyPieces, SPACE_SEPARATOR);
  return tidiedText;
}

// Validation: the gate's own rules, checked here before anything is
// written, so a bad line fails loudly on the builder's machine instead
// of silently in front of the judge.
function validateCommitLine(candidateLine: string): LineVerdict {
  const charCount = countCharacters(candidateLine);
  const trimmedLine = candidateLine.trim();
  if (trimmedLine.length === 0) {
    const blankVerdict: LineVerdict = {
      passed: false,
      reason: "line is blank or only white space",
      charCount,
    };
    return blankVerdict;
  }
  if (charCount < GATE_MINIMUM_CHARS) {
    const shortVerdict: LineVerdict = {
      passed: false,
      reason: "line is shorter than the gate minimum",
      charCount,
    };
    return shortVerdict;
  }
  if (charCount > GATE_MAXIMUM_CHARS) {
    const longVerdict: LineVerdict = {
      passed: false,
      reason: "line is longer than the gate maximum",
      charCount,
    };
    return longVerdict;
  }
  if (candidateLine.includes(NEWLINE_CHARACTER)) {
    const multilineVerdict: LineVerdict = {
      passed: false,
      reason: "line contains a newline and is not a single line",
      charCount,
    };
    return multilineVerdict;
  }
  if (candidateLine !== trimmedLine) {
    const raggedVerdict: LineVerdict = {
      passed: false,
      reason: "line carries leading or trailing white space",
      charCount,
    };
    return raggedVerdict;
  }
  const passingVerdict: LineVerdict = {
    passed: true,
    reason: "line satisfies the gate",
    charCount,
  };
  return passingVerdict;
}

// Writing: create the output directory when it is missing, then write
// exactly the line — no trailing newline, so the file's character count
// is the line's character count and nothing more.
function ensureOutputDirectory(): WriteReceipt {
  const targetPath = OUTPUT_DIRECTORY;
  let receiptRecord: WriteReceipt = {
    written: false,
    reason: "output directory check did not run",
    targetPath,
  };
  try { const directoryAlreadyThere = existsSync(OUTPUT_DIRECTORY);
    if (directoryAlreadyThere) {
      receiptRecord = {
        written: true,
        reason: "output directory already present",
        targetPath,
      };
      return receiptRecord;
    }
    mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
    receiptRecord = {
      written: true,
      reason: "output directory created",
      targetPath,
    };
  } catch (caughtFailure) {
    const failureMessage = describeCaughtFailure(caughtFailure);
    receiptRecord = {
      written: false,
      reason: "could not prepare output directory: " + failureMessage,
      targetPath,
    };
  }
  return receiptRecord;
}

function writeEntryText(targetPath: string, textToWrite: string): WriteReceipt {
  let receiptRecord: WriteReceipt = {
    written: false,
    reason: "write did not run",
    targetPath,
  };
  try { writeFileSync(targetPath, textToWrite, { encoding: "utf8" });
    receiptRecord = {
      written: true,
      reason: "entry text written",
      targetPath,
    };
  } catch (caughtFailure) {
    const failureMessage = describeCaughtFailure(caughtFailure);
    receiptRecord = {
      written: false,
      reason: "could not write entry text: " + failureMessage,
      targetPath,
    };
  }
  return receiptRecord;
}

// Readback: read the file, hash it, and compare it with the intended
// line, so the run proves its own output instead of assuming it.
function hashTextUtf8(textToHash: string): string {
  const hasher = createHash("sha256");
  hasher.update(textToHash, "utf8");
  const digestHex = hasher.digest("hex");
  return digestHex;
}

function readBackAndProve(
  targetPath: string,
  expectedText: string,
): ReadbackProof {
  let proofRecord: ReadbackProof = {
    matches: false,
    reason: "readback did not run",
    sha256Hex: EMPTY_TEXT,
    charCount: 0,
  };
  try { const bytesOnDisk = readFileSync(targetPath, { encoding: "utf8" });
    const diskMatchesExpected = bytesOnDisk === expectedText;
    const diskHash = hashTextUtf8(bytesOnDisk);
    const diskCharCount = countCharacters(bytesOnDisk);
    const matchReason = diskMatchesExpected
      ? "bytes on disk match the intended line"
      : "bytes on disk differ from the intended line";
    proofRecord = {
      matches: diskMatchesExpected,
      reason: matchReason,
      sha256Hex: diskHash,
      charCount: diskCharCount,
    };
  } catch (caughtFailure) {
    const failureMessage = describeCaughtFailure(caughtFailure);
    proofRecord = {
      matches: false,
      reason: "could not read back entry text: " + failureMessage,
      sha256Hex: EMPTY_TEXT,
      charCount: 0,
    };
  }
  return proofRecord;
}

function describeCaughtFailure(caughtValue: unknown): string {
  const valueIsError = caughtValue instanceof Error;
  const describedFailure = valueIsError ? caughtValue.message : "unknown failure";
  return describedFailure;
}

// Reporting: one labelled line per fact, so a run log can be read at a
// glance and two runs can be compared line by line.
function reportFact(labelText: string, valueText: string): void {
  const reportLine = labelText + ": " + valueText;
  console.log(reportLine);
}

// Main flow: assemble, validate, write, prove — each step gated on the
// one before it, with a named record carried forward at every step.
function main(): number {
  const assembled = assembleCommitLine();
  const tidiedLine = collapseWhitespaceRuns(assembled.line);
  if (tidiedLine !== assembled.line) {
    reportFact("tidy", "whitespace tidy changed the assembled line");
    return 1;
  }
  const verdict = validateCommitLine(tidiedLine);
  if (verdict.passed === false) {
    reportFact("gate", "rejected — " + verdict.reason);
    reportFact("chars", String(verdict.charCount));
    return 1;
  }
  const directoryReceipt = ensureOutputDirectory();
  if (directoryReceipt.written === false) {
    reportFact("output-dir", "failed — " + directoryReceipt.reason);
    return 1;
  }
  const targetPath = join(OUTPUT_DIRECTORY, OUTPUT_FILENAME);
  const writeReceipt = writeEntryText(targetPath, tidiedLine);
  if (writeReceipt.written === false) {
    reportFact("write", "failed — " + writeReceipt.reason);
    return 1;
  }
  const proof = readBackAndProve(targetPath, tidiedLine);
  if (proof.matches === false) {
    reportFact("readback", "failed — " + proof.reason);
    return 1;
  }
  reportFact("entry", tidiedLine);
  reportFact("chars", String(proof.charCount));
  reportFact("sha256", proof.sha256Hex);
  reportFact("path", targetPath);
  reportFact("status", "ok");
  const successCode = 0;
  return successCode;
}

const exitCode = main();
process.exitCode = exitCode;
