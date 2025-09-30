import { writeLog } from './lib/logger';

let activeAutomations = new Map<number, any>();
let injectionInProgress = new Set<number>();

chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
    const automationData = activeAutomations.get(tabId);
    if (!automationData) return;
    
    writeLog(`[background] Tab ${tabId} status: ${changeInfo.status}, URL: ${tab.url}`);
    
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('caixa.gov.br')) {
        writeLog(`[background] Tab ${tabId} navigation complete: ${tab.url}`);
        
        const secondStepUrl = 'https://habitacao.caixa.gov.br/siopiweb-web/simulaOperacaoInternet.do?method=enquadrarProdutos';
        if (tab.url.startsWith(secondStepUrl)) {
            writeLog(`[background] SECOND STEP DETECTED! Injecting CaixaNavigatorSecondStep`);
        } else {
            writeLog(`[background] First step or other page. Injecting regular CaixaNavigator`);
        }
        
        writeLog(`[background] Re-injecting script for tab ${tabId}`);
        
        if (injectionInProgress.has(tabId)) {
            writeLog(`[background] Injection already in progress for tab ${tabId}, skipping`);
            return;
        }
        
        injectionInProgress.add(tabId);
        
        setTimeout(() => {
            injectScripts(tabId, automationData, tab.url || '')
                .then(() => {
                    writeLog(`[background] Script injection completed for tab ${tabId}`);
                    injectionInProgress.delete(tabId);
                })
                .catch((error) => {
                    writeLog(`[background] Script injection failed for tab ${tabId}: ${error}`);
                    injectionInProgress.delete(tabId);
                });
        }, 100); 
    }
});

chrome.tabs.onRemoved.addListener((closedTabId: number) => {
    if (activeAutomations.has(closedTabId)) {
        writeLog(`[background] Tab ${closedTabId} closed, cleaning up`);
        activeAutomations.delete(closedTabId);
    }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    console.log('[background] Received message:', request.action, request);
    
    if (request.action === "log" || request.action === "writeLog") {
        writeLog(request.message);
        sendResponse({ status: "logged" });
        return true;
    }
    
    if (request.action === "startSimulation") {
        (async () => {
            try {
                writeLog('[background] Received startSimulation message.');
                const targetUrl = "https://www.caixa.gov.br/simule-habitacao";
                
                const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
                if (!newTab || !newTab.id) {
                    writeLog('[background] Tab created, but no ID was returned.');
                    sendResponse({ status: "error", message: "Tab creation failed." });
                    return;
                }
                
                const tabId = newTab.id;
                writeLog(`[background] Tab created successfully with ID: ${tabId}.`);
                
                activeAutomations.set(tabId, request.data);
                writeLog(`[background] Automation data stored for tab ${tabId}`);
                sendResponse({ status: "Tab creation initiated" });

            } catch (error: any) {
                writeLog(`[background] Error creating tab: ${error.message}`);
                sendResponse({ status: "error", message: error.message });
            }
        })();
        return true;
    }
    
    if (request.action === "simulationResult") {
        const resultPayload = request.payload;
        console.log('[background] Received simulation result:', resultPayload);
        writeLog(`[background] Received simulation result. Storing in local storage...`);
        writeLog(`[background] Payload details: ${JSON.stringify(resultPayload, null, 2)}`);
        
        chrome.storage.local.set({ simulationResult: resultPayload }, () => {
            if (chrome.runtime.lastError) {
                console.error('[background] Error storing result:', chrome.runtime.lastError);
                writeLog(`[background] Error storing result: ${chrome.runtime.lastError.message}`);
                sendResponse({ status: "error", message: "Failed to store result." });
            } else {
                console.log('[background] Simulation result stored successfully');
                writeLog(`[background] Simulation result stored successfully.`);
                
                chrome.storage.local.get(['simulationResult'], (stored) => {
                    console.log('[background] Verification - stored data:', stored);
                    writeLog(`[background] Verification - data in storage: ${JSON.stringify(stored)}`);
                });
                
                sendResponse({ status: "result received and stored" });
            }
        });
        return true;
    }
    
    return false;
});

async function injectScripts(tabId: number, data: any, url: string) {
    try {
        writeLog(`[background] Injecting data into tab ${tabId}.`);
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: (dataToInject, debug) => {
                (window as any).__CAIXA_AUTO_MOUNT_DATA = dataToInject;
                (window as any).__CAIXA_AUTO_MOUNT_DEBUG = debug;
            },
            args: [data, true]
        });

        writeLog(`[background] Injecting bridge content script into tab ${tabId}.`);
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'ISOLATED',
            func: () => {
                console.log('[bridge] Bridge content script loaded');
                
                window.addEventListener('message', (event) => {
                    if (event.source !== window) return;
                    
                    if (event.data.type === 'CAIXA_TO_BACKGROUND') {
                        console.log('[bridge] Received message from main world:', event.data);
                        
                        chrome.runtime.sendMessage(event.data.payload, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error('[bridge] Error sending to background:', chrome.runtime.lastError);
                                window.postMessage({
                                    type: 'BACKGROUND_TO_CAIXA',
                                    success: false,
                                    error: chrome.runtime.lastError.message
                                }, '*');
                            } else {
                                console.log('[bridge] Background response:', response);
                                window.postMessage({
                                    type: 'BACKGROUND_TO_CAIXA',
                                    success: true,
                                    response: response
                                }, '*');
                            }
                        });
                    }
                });
                
                console.log('[bridge] Bridge setup complete');
            }
        });

        const secondStepUrl = 'https://habitacao.caixa.gov.br/siopiweb-web/simulaOperacaoInternet.do?method=enquadrarProdutos';
        let scriptToInject;

        writeLog(`[background] Current URL: ${url}`);
        writeLog(`[background] Comparing with: ${secondStepUrl}`);

        if (url.startsWith(secondStepUrl)) {
            scriptToInject = 'caixaNavigationSecondStep.js';
        } else {
            scriptToInject = 'caixaNavigation.js';
        }

        writeLog(`[background] Injecting loader script '${scriptToInject}' into tab ${tabId}.`);
        const scriptUrl = chrome.runtime.getURL(scriptToInject);
        
        const result = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: (url, scriptName) => {
                const script = document.createElement('script');
                script.src = url;
                script.type = 'module';
                script.onload = () => {
                    console.log(`[background-loader] ${scriptName} loaded successfully`);
                    // Safe message sending with error handling
                    try {
                        chrome.runtime.sendMessage({ action: "writeLog", message: `[background-loader] ${scriptName} loaded successfully` }, () => {
                            if (chrome.runtime.lastError) {
                                console.log('Message send failed:', chrome.runtime.lastError.message);
                            }
                        });
                    } catch (e) {
                        console.log('Failed to send message:', e);
                    }
                };
                script.onerror = (error) => {
                    console.error(`[background-loader] ${scriptName} failed to load:`, error);
                    // Safe message sending with error handling
                    try {
                        chrome.runtime.sendMessage({ action: "writeLog", message: `[background-loader] ${scriptName} failed to load: ${error}` }, () => {
                            if (chrome.runtime.lastError) {
                                console.log('Message send failed:', chrome.runtime.lastError.message);
                            }
                        });
                    } catch (e) {
                        console.log('Failed to send message:', e);
                    }
                };
                document.head.appendChild(script);
                console.log(`[background-loader] ${scriptName} injection attempted`);
                // Safe message sending with error handling
                try {
                    chrome.runtime.sendMessage({ action: "writeLog", message: `[background-loader] ${scriptName} injection attempted` }, () => {
                        if (chrome.runtime.lastError) {
                            console.log('Message send failed:', chrome.runtime.lastError.message);
                        }
                    });
                } catch (e) {
                    console.log('Failed to send message:', e);
                }
            },
            args: [scriptUrl, scriptToInject]
        });

        writeLog(`[background] Script injection result: ${JSON.stringify(result)}`);
        writeLog('[background] All injection commands sent.');
    } catch (err: any) {
        writeLog(`[background] Script injection failed: ${err.message}`);
    }
}