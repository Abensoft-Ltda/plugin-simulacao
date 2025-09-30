import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEY, writeLog, readLogs, clearLogs as clearStoredLogs, type LogEntry } from '../lib/logger';

const data = {
    target: "Caixa",
    tipo_imovel: "Aquisição de Imóvel Novo",
    valor_imovel: 450000.00,
    valor_entrada: 100000.00,
    prazo: "420",
    uf: "SC",
    cidade: "Chapeco",
    data_nasc: "15/08/1992",
    renda_familiar: 9000.00,
    multiplos_compradores: "N",
    beneficiado_fgts: "S",
    fgts_valor_imovel: "S",
    portabilidade: false,

};

export const useAutomation = () => {
    const [isOnCaixaPage, setIsOnCaixaPage] = useState<boolean>(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const refreshLogs = useCallback(async () => {
        const freshLogs = await readLogs();
        setLogs(freshLogs);
    }, []);

    chrome.storage.local.remove(STORAGE_KEY);

    useEffect(() => {
        refreshLogs();

        const messageListener = (request: any) => {
            if (request.action === "log") {
                refreshLogs();
            }
        };
        chrome.runtime.onMessage.addListener(messageListener);

        const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === 'local' && changes.logHistory) {
                refreshLogs();
            }
        };
        chrome.storage.onChanged.addListener(storageListener);

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
            const currentTab = tabs[0];
            if (currentTab?.url?.includes("caixa.gov.br")) {
                setIsOnCaixaPage(true);
            }
        });

        return () => {
            chrome.storage.onChanged.removeListener(storageListener);
            chrome.runtime.onMessage.removeListener(messageListener);
        }
    }, [refreshLogs]);

    const startSimulation = () => {
        writeLog('[popup] Sending startSimulation message to background script.');
        chrome.runtime.sendMessage({ action: "startSimulation", data: data }, (response) => {
            if (chrome.runtime.lastError) {
                writeLog(`[popup] Error sending message: ${chrome.runtime.lastError.message}`);
            } else {
                writeLog(`[popup] Received response from background: ${response?.status}`);
            }
        });
    };

    const clearLogs = async () => {
        await clearStoredLogs();
        refreshLogs();
    };

    return { logs, startSimulation, clearLogs, isOnCaixaPage };
};