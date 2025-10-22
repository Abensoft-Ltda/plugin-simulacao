import { z } from "zod";

const logEntrySchema = z.object({
  timestamp: z.number(),
  message: z.string(),
});

export type LogEntry = z.infer<typeof logEntrySchema>;

const logHistorySchema = z.array(logEntrySchema);

export const STORAGE_KEY = "logHistory";

export async function writeLog(message: string): Promise<void> {
  const timestampedMessage = `${message} -- [${new Date().toLocaleTimeString()}]`;
  console.log(timestampedMessage);
  const newLogEntry: LogEntry = {
    timestamp: Date.now(),
    message: timestampedMessage,
  };

  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.sendMessage
    ) {
      try {
        (chrome.runtime.sendMessage as any)({
          action: "log",
          message: timestampedMessage,
        }).catch?.(() => {});
      } catch (_) {
        // some environments expose sendMessage synchronously; ignore if it throws
      }
    }

    const { [STORAGE_KEY]: storedLogs } = await chrome.storage.local.get(
      STORAGE_KEY
    );
    const parsedLogs = logHistorySchema.safeParse(storedLogs);
    const existingLogs = parsedLogs.success ? parsedLogs.data : [];
    const updatedLogs = [...existingLogs, newLogEntry];
    await chrome.storage.local.set({ [STORAGE_KEY]: updatedLogs });
  } catch (error) {
    console.error("Failed to write log:", error);
  }
}

export async function readLogs(): Promise<LogEntry[]> {
  try {
    const { [STORAGE_KEY]: storedLogs } = await chrome.storage.local.get(
      STORAGE_KEY
    );
    const parsedLogs = logHistorySchema.safeParse(storedLogs);
    return parsedLogs.success ? parsedLogs.data : [];
  } catch (error) {
    console.error("Failed to read logs:", error);
    return [];
  }
}

export async function clearLogs(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear logs:", error);
  }
}
