// Store active automation data for re-injection
let activeAutomations = new Map<number, any>();

// Listener for messages from the popup and content scripts
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "console.log") {
        // Handle log messages from injected scripts
        console.log(request.message);
        sendResponse({ status: "logged" });
        return true;
    }
    
    if (request.action === "startSimulation") {
        console.log('[background] Received startSimulation message.');
        const targetUrl = "https://www.caixa.gov.br/simule-habitacao";
        
        chrome.tabs.create({ url: targetUrl, active: true }, (newTab) => {
            if (chrome.runtime.lastError) {
                console.log(`[background] Error creating tab: ${chrome.runtime.lastError.message}`);
                return;
            }

            if (!newTab || !newTab.id) {
                console.log('[background] Tab created, but no ID was returned.');
                return;
            }
            
            const tabId = newTab.id;
            console.log(`[background] Tab created successfully with ID: ${tabId}.`);
            
            // Store the automation data for this tab
            activeAutomations.set(tabId, request.data);
            
            // Set up persistent listener for this tab
            setupTabListener(tabId);
        });
        
        sendResponse({ status: "Tab creation initiated" });
        return true; 
    }
});

function setupTabListener(tabId: number) {
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
        // Only handle updates for our target tab
        if (updatedTabId !== tabId) return;
        
        // Check if page is complete and on Caixa domain
        if (changeInfo.status === 'complete' && tab.url && tab.url.includes('caixa.gov.br')) {
            console.log(`[background] Tab ${tabId} page navigation complete: ${tab.url}`);
            
            const automationData = activeAutomations.get(tabId);
            if (automationData) {
                console.log(`[background] Re-injecting script for tab ${tabId}`);
                injectScripts(tabId, automationData, tab.url);
            }
        }
    };
    
    // Add the persistent listener
    chrome.tabs.onUpdated.addListener(listener);
    
    // Clean up when tab is closed
    chrome.tabs.onRemoved.addListener((closedTabId) => {
        if (closedTabId === tabId) {
            console.log(`[background] Tab ${tabId} closed, cleaning up`);
            activeAutomations.delete(tabId);
            chrome.tabs.onUpdated.removeListener(listener);
        }
    });
}

async function injectScripts(tabId: number, data: any, url: string) {
    try {
        await console.log(`[background] Injecting data into tab ${tabId}.`);
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: (dataToInject, debug) => {
                (window as any).__CAIXA_AUTO_MOUNT_DATA = dataToInject;
                (window as any).__CAIXA_AUTO_MOUNT_DEBUG = debug;
            },
            args: [data, true]
        });

        let scriptToInject;
        if (url.includes('https://habitacao.caixa.gov.br/siopiweb-web/simulaOperacaoInternet.do?method=enquadrarProdutos')) {
            scriptToInject = 'caixaNavigationSecondStep.js';
        } else {
            scriptToInject = 'caixaNavigation.js';
        }

        await console.log(`[background] Injecting loader script '${scriptToInject}' into tab ${tabId}.`);
        const scriptUrl = chrome.runtime.getURL(scriptToInject);
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: (url) => {
                const script = document.createElement('script');
                script.src = url;
                script.type = 'module';
                document.head.appendChild(script);
                console.log('[background-loader] Loader script injected and executed.');
            },
            args: [scriptUrl]
        });

        await console.log('[background] All injection commands sent.');
    } catch (err: any) {
        await console.log(`[background] Script injection failed: ${err.message}`);
    }
}