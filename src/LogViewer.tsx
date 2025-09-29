import React, { useState, useEffect, useCallback } from 'react';
import { readLogs, type LogEntry } from './lib/logger';
import './App.css';

interface LogViewerProps {
  onClear: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ onClear }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const refreshLogs = useCallback(async () => {
    const freshLogs = await readLogs();
    setLogs(freshLogs);
  }, []);

  useEffect(() => {
    refreshLogs();

    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes.logHistory) {
        refreshLogs();
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [refreshLogs]);

  return (
    <div className="mt-4 rounded-lg bg-gray-800/90 p-3 shadow-lg backdrop-blur-sm flex-grow overflow-y-auto font-mono">
      <div className="flex items-center justify-between pb-2 border-b border-gray-700/50 mb-2">
        <div className="text-sm font-bold text-gray-300 tracking-wider">LOGS</div>
        <button
          onClick={onClear}
          className="cursor-pointer rounded bg-gray-700/50 px-2 py-0.5 text-xs text-gray-400 transition-all hover:bg-gray-600/50 hover:text-white"
        >
          Clear
        </button>
      </div>
      
      {logs.length === 0 ? (
        <div className="text-center text-sm text-gray-500 italic py-2">No logs yet.</div>
      ) : (
        <ul className="m-0 list-none p-0 space-y-1">
          {logs.map((log, i) => (
            <li key={i} className="text-xs text-gray-400 whitespace-pre-wrap break-words">
              <span className="text-cyan-400/80 mr-2">{`>`}</span>{log.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};