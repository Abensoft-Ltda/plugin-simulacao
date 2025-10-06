import { writeLog } from './lib/logger';
import { CaixaFields } from './methods/Validation';
import { getConfig } from './config';

let activeAutomations = new Map<number, any>();
let injectionInProgress = new Set<number>();

// Auth validation function
async function checkAuth(): Promise<boolean> {
    try {
        const config = await getConfig();

        if (config.isDevelopment) {
            writeLog('[background] Development environment detected - skipping auth validation');
            return true;
        }

        const authData = await new Promise<any>((resolve) => {
            chrome.storage.local.get(['sessionData', 'authToken', 'authExpiry'], (result) => {
                resolve(result);
            });
        });

        // Check if we have auth data
        if (!authData.sessionData || !authData.authToken) {
            writeLog('[background] No auth data found in storage');
            return false;
        }

        // Check if token is expired
        if (authData.authExpiry && Date.now() > authData.authExpiry) {
            writeLog('[background] Auth token expired');
            await cleanAuthStorage();
            return false;
        }

        const apiUrl = `${config.urlSuperleme}api/model/sl_cad_interacao_simulacao/get/acessos_agrupados_json`;

        writeLog('[background] Validating auth with server...');

        // Build headers with cookies
        const headers: Record<string, string> = {
            'Accept': 'application/json',
        };

        if (authData.sessionData) {
            const cookieParts: string[] = [];
            for (const [cookieName, cookieValue] of Object.entries(authData.sessionData)) {
                if (cookieValue) {
                    cookieParts.push(`${cookieName}=${cookieValue}`);
                }
            }
            if (cookieParts.length > 0) {
                headers['Cookie'] = cookieParts.join('; ');
            }
        }

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: headers,
            credentials: 'include',
            mode: 'cors'
        });

        if (response.ok) {
            writeLog('[background] Auth validation successful');
            return true;
        } else {
            writeLog(`[background] Auth validation failed with status: ${response.status}`);
            await cleanAuthStorage();
            return false;
        }
    } catch (error) {
        writeLog(`[background] Auth validation error: ${error}`);
        return false;
    }
}

async function cleanAuthStorage(): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.remove(['sessionData', 'authToken', 'authExpiry'], () => {
            writeLog('[background] Auth data cleaned from storage');
            resolve();
        });
    });
}

// Bank routing function to handle different bank simulations
async function startBankSimulation(fields: Record<string, any>, targetName: string): Promise<any> {
    const target = targetName.toLowerCase();
    writeLog(`[background] Starting simulation for bank: ${target}`);

    let targetUrl: string;

    // Determine the correct URL based on the target bank
    switch (target) {
        case 'caixa':
            targetUrl = 'https://habitacao.caixa.gov.br/siopiweb-web/simulaOperacaoInternet.do?method=inicializarCasoUso';
            break;
        case 'santander':
            targetUrl = 'https://www.santander.com.br/';
            break;
        case 'bradesco':
            targetUrl = 'https://www.bradesco.com.br/';
            break;
        case 'itau':
            targetUrl = 'https://www.itau.com.br/';
            break;
        default:
            throw new Error(`Unsupported bank target: ${target}`);
    }

    writeLog(`[background] Creating tab for ${target} at ${targetUrl}`);

    // Create a new tab for the target bank simulation
    return new Promise((resolve, reject) => {
        chrome.tabs.create({ url: targetUrl }, (tab) => {
            if (!tab.id) {
                reject(new Error(`Failed to create tab for ${target}`));
                return;
            }

            writeLog(`[background] Tab created successfully for ${target}: ${tab.id}`);

            const automationData = {
                fields,
                target,
                startTime: Date.now(),
                resolve,
                reject
            };

            activeAutomations.set(tab.id, automationData);
            writeLog(`[background] Automation data stored for tab ${tab.id}`);

        });
    });
}


chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('superleme')) {
        writeLog(`[background] Superleme page detected: ${tab.url}`);
        
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'ISOLATED',
            func: () => {
                let contextValid = true;
                window.addEventListener('unload', () => { contextValid = false; });
                console.log('[SUPERLEME BRIDGE] Content script injected and loaded');
                window.postMessage({ type: 'SUPERLEME_BRIDGE_LOADED' }, '*');
                const handler = (event: MessageEvent) => {
                    if (!contextValid) return;
                    if (event.source !== window) return;
                    if (event.data.type === 'SUPERLEME_TO_BACKGROUND') {
                        if (event.data.payload?.action === 'startSimulationRequest') {
                            console.log('[SUPERLEME BRIDGE] Received simulation trigger:', event.data.payload);
                        }
                        window.postMessage({ type: 'SUPERLEME_BRIDGE_RECEIVED', payload: event.data.payload }, '*');

                        // Send to background and handle response
                        try {
                            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                                chrome.runtime.sendMessage(event.data.payload, (response) => {
                                    if (!contextValid) return;
                                    if (chrome.runtime.lastError) {
                                        console.error('[SUPERLEME BRIDGE] Error from background:', chrome.runtime.lastError);
                                        window.postMessage({
                                            type: 'SUPERLEME_BRIDGE_ERROR',
                                            error: chrome.runtime.lastError.message
                                        }, '*');
                                    } else {
                                        window.postMessage({
                                            type: 'SUPERLEME_BRIDGE_RESPONSE',
                                            response: response
                                        }, '*');
                                    }
                                });
                            } else {
                                console.error('[SUPERLEME BRIDGE] Chrome runtime not available');
                                window.postMessage({
                                    type: 'SUPERLEME_BRIDGE_ERROR',
                                    error: 'Chrome runtime not available'
                                }, '*');
                            }
                        } catch (e) {
                            const errMsg = (e instanceof Error) ? e.message : String(e);
                            console.error('[SUPERLEME BRIDGE] Exception:', errMsg);
                            window.postMessage({ type: 'SUPERLEME_BRIDGE_ERROR', error: errMsg }, '*');
                        }
                    }
                };
                window.addEventListener('message', handler);
                window.addEventListener('unload', () => {
                    window.removeEventListener('message', handler);
                });
            }
        });
        
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: () => {
                const extractAuth = () => {
                    const allCookies = document.cookie.split(";");
                    
                    const getCookie = (name: string) => {
                        const cookie = allCookies.find(cookie => cookie.trim().startsWith(name + '='));
                        return cookie ? cookie.split("=").slice(1).join("=").trim() : null;
                    };

                    // Find cookies by pattern for dynamic names
                    const getCookieByPattern = (pattern: string) => {
                        const cookie = allCookies.find(cookie => cookie.trim().includes(pattern));
                        if (!cookie) return { name: null, value: null };
                        const trimmed = cookie.trim();
                        const eqIndex = trimmed.indexOf('=');
                        return {
                            name: trimmed.substring(0, eqIndex),
                            value: trimmed.substring(eqIndex + 1)
                        };
                    };

                    const cotonicSid = getCookie('cotonic-sid');
                    const zAuth = getCookie('z.auth');
                    
                    if (cotonicSid && zAuth) {
                        // Find HotJar cookies dynamically
                        const hjSession = getCookieByPattern('_hjSession_');
                        const hjSessionUser = getCookieByPattern('_hjSessionUser_');

                        const authData = {
                            authToken: zAuth,
                            authExpiry: new Date().getTime() + (24 * 60 * 60 * 1000),
                            sessionData: {
                                'cotonic-sid': cotonicSid,
                                'z.auth': zAuth,
                                'z.lang': getCookie('z.lang'),
                                'z.tz': getCookie('z.tz'),
                                'timezone': getCookie('timezone'),
                                'cf_clearance': getCookie('cf_clearance')
                            } as Record<string, string>
                        };

                        // Add HotJar cookies with their dynamic names
                        if (hjSession.name && hjSession.value) {
                            authData.sessionData[hjSession.name] = hjSession.value;
                        }
                        if (hjSessionUser.name && hjSessionUser.value) {
                            authData.sessionData[hjSessionUser.name] = hjSessionUser.value;
                        }


                        window.postMessage({
                            type: 'SUPERLEME_TO_BACKGROUND',
                            payload: { action: 'storeAuth', authData: authData }
                        }, '*');
                    }
                };
                
                extractAuth();
                setInterval(extractAuth, 2000);
            }
        }).catch(() => {
        });
    }


    const automationData = activeAutomations.get(tabId);
    if (!automationData) return;
    
    writeLog(`[background] Tab ${tabId} status: ${changeInfo.status}, URL: ${tab.url}`);
    
    if (changeInfo.status === 'complete' && tab.url) {
        const target = automationData.target || 'caixa';
        writeLog(`[background] Checking if tab ${tabId} is a ${target} page`);

        let isBankPage = false;

        // Check if we're on the correct bank's page based on the target
        switch (target.toLowerCase()) {
            case 'caixa':
                isBankPage = tab.url.includes('caixa.gov.br');
                writeLog(`[background] Caixa page check: ${tab.url} includes 'caixa.gov.br'? ${isBankPage}`);
                break;
            case 'santander':
                isBankPage = tab.url.includes('santander.com.br');
                break;
            case 'bradesco':
                isBankPage = tab.url.includes('bradesco.com.br');
                break;
            case 'itau':
                isBankPage = tab.url.includes('itau.com.br');
                break;
            default:
                writeLog(`[background] Unknown bank target: ${target}`);
                return;
        }

        if (!isBankPage) {
            writeLog(`[background] Not on ${target} page yet, URL: ${tab.url} - waiting...`);
            return;
        }

        writeLog(`[background] ${target} page detected! Navigation complete: ${tab.url}`);

        // Handle Caixa-specific step detection
        if (target.toLowerCase() === 'caixa') {
            const secondStepUrl = 'https://habitacao.caixa.gov.br/siopiweb-web/simulaOperacaoInternet.do?method=enquadrarProdutos';
            if (tab.url.startsWith(secondStepUrl)) {
                writeLog(`[background] CAIXA SECOND STEP DETECTED! Injecting CaixaNavigatorSecondStep`);
            } else {
                writeLog(`[background] Caixa first step or other page. Injecting regular CaixaNavigator`);
            }
        }
        
        writeLog(`[background] Starting script injection for ${target} tab ${tabId}`);

        if (injectionInProgress.has(tabId)) {
            writeLog(`[background] Injection already in progress for tab ${tabId}, skipping`);
            return;
        }
        
        injectionInProgress.add(tabId);
        
        setTimeout(() => {
            injectScripts(tabId, automationData, tab.url || '', target)
                .then(() => {
                    writeLog(`[background] Script injection completed for ${target} tab ${tabId}`);
                    injectionInProgress.delete(tabId);
                })
                .catch((error) => {
                    writeLog(`[background] Script injection failed for ${target} tab ${tabId}: ${error}`);
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

    if (request.action === "storeAuth") {

        // Store the auth data including session cookies
        chrome.storage.local.set(request.authData, () => {
            if (chrome.runtime.lastError) {
                console.error('[background] Error storing auth:', chrome.runtime.lastError);
                writeLog(`[background] Error storing auth: ${chrome.runtime.lastError.message}`);
                sendResponse({ status: "error" });
            } else {
                sendResponse({ status: "success" });
            }
        });
        return true;
    }

    if (request.action === "log" || request.action === "writeLog") {
        writeLog(request.message);
        sendResponse({ status: "logged" });
        return true;
    }


    if (request.action === "startSimulationRequest") {
        console.log('[background] Processing startSimulationRequest');
        writeLog('[background] Processing startSimulationRequest');
        chrome.storage.local.remove(['simulationResult']);
        writeLog('[background] Simulation request received.');
        const targets = request.data?.targets;
        if (!Array.isArray(targets) || targets.length === 0) {
            writeLog('[background] No valid simulation targets received.');
            sendResponse({ status: "error", message: "No valid targets received." });
            return true;
        }

        (async () => {
            const results: Array<{ target: string; result?: any; errors?: string[] }> = [];
            for (let idx = 0; idx < targets.length; idx++) {
                const target = targets[idx];
                writeLog(`[background] Processing simulation target[${idx}]...`);
                const { fields, errors } = CaixaFields.buildCaixaFields(target);
                const targetName = fields.target || "caixa";

                if (errors.length > 0) {
                    writeLog(`[background] Validation errors for ${targetName}: ${errors.join(', ')}`);
                    results.push({ target: targetName, errors });
                    continue;
                }

                writeLog(`[background] Validation passed for ${targetName}. Calling startSimulation...`);

                try {
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Simulation timed out after 30 seconds')), 30000)
                    );

                    const result = await Promise.race([
                        startBankSimulation(fields, targetName),
                        timeoutPromise
                    ]);

                    writeLog(`[background] Simulation for ${targetName} COMPLETED.`);
                    results.push({ target: targetName, result });

                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown simulation error';
                    writeLog(`[background] ERROR during simulation for ${targetName}: ${errorMessage}`);
                    results.push({ target: targetName, errors: [errorMessage] });
                }
            }

            writeLog('[background] Finished processing all targets.');

            sendResponse({ status: "success", count: targets.length, results });
        })();

        return true;
    }

    if (request.action === "simulationResult") {
        const resultPayload = request.payload;
        console.log('[background] Received simulation result:', resultPayload);
        writeLog(`[background] Received simulation result.`);

        const senderId = _sender.tab?.id;

        // Extract IDs from automation data or fallback to defaults
        let simId = 'unknown';
        let ifId = 'caixa';
        let automationData = null;

        if (senderId && activeAutomations.has(senderId)) {
            automationData = activeAutomations.get(senderId);
            if (automationData?.fields) {
                simId = automationData.fields.id || automationData.fields.sim_id || automationData.fields.simulacao_id || simId;
                ifId = automationData.fields.leal_if_id || automationData.fields.if_id || automationData.fields.target || ifId;
            }
        } else {
            simId = resultPayload.sim_id || resultPayload.id || simId;
            ifId = resultPayload.if_id || resultPayload.if || ifId;
        }

        writeLog(`[background] Processing result: sim_id=${simId}, if_id=${ifId}`);

        // Send to server (which will also handle storage)
        (async () => {
            if (simId !== 'unknown') {
                try {
                    await sendResultsToServer(simId, ifId, resultPayload);
                    writeLog(`[background] Result sent to server and stored successfully`);
                } catch (error) {
                    writeLog(`[background] Send failed: ${error instanceof Error ? error.message : String(error)}`);
                }
            } else {
                writeLog(`[background] Invalid sim_id, skipping server send`);
            }

            // Resolve and cleanup
            if (automationData && automationData.resolve) {
                automationData.resolve(resultPayload);
                if (senderId) {
                    activeAutomations.delete(senderId);
                }
            }

            sendResponse({ status: "result received and processed" });
        })();

        return true;
    }

    return false;
});

async function injectScripts(tabId: number, data: any, url: string, target: string) {
    try {
        writeLog(`[background] Injecting data into tab ${tabId} for ${target}.`);

        // First inject the CSS file
        writeLog(`[background] Injecting App.css into tab ${tabId}.`);
        try {
            await chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['App.css']
            });
            writeLog(`[background] App.css injected successfully.`);
        } catch (cssError: any) {
            writeLog(`[background] Failed to inject CSS: ${cssError.message}`);
        }

        // Then inject the data
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: (dataToInject) => {
                (window as any).__CAIXA_AUTO_MOUNT_DATA = dataToInject;
            },
            args: [data]
        });

        // Inject bridge content script (like in the working version)
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

        // Determine which script to inject based on target and URL
        let scriptToInject: string;

        if (target.toLowerCase() === 'caixa') {
            const secondStepUrl = 'https://habitacao.caixa.gov.br/siopiweb-web/simulaOperacaoInternet.do?method=enquadrarProdutos';
            if (url.startsWith(secondStepUrl)) {
                scriptToInject = 'caixaNavigationSecondStep.js';
                writeLog(`[background] CAIXA SECOND STEP - Injecting ${scriptToInject}`);
            } else {
                scriptToInject = 'caixaNavigation.js';
                writeLog(`[background] CAIXA FIRST STEP - Injecting ${scriptToInject}`);
            }
        } else {
            // For other banks, we'll need to create their specific navigation scripts
            // For now, use a placeholder or the base caixa script as fallback
            scriptToInject = 'caixaNavigation.js'; // TODO: Create bank-specific scripts
            writeLog(`[background] ${target.toUpperCase()} - Injecting ${scriptToInject} (using fallback)`);
        }

        writeLog(`[background] Injecting main script '${scriptToInject}' into tab ${tabId}.`);

        // Get the script URL in extension context first
        const scriptUrl = chrome.runtime.getURL(scriptToInject);

        // Inject the script as a module to handle ES6 imports
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: (scriptUrl, scriptName) => {
                const script = document.createElement('script');
                script.type = 'module';
                script.src = scriptUrl;  // Use the pre-resolved URL
                script.onload = () => {
                    console.log(`[background-loader] ${scriptName} loaded successfully`);
                };
                script.onerror = (e) => {
                    console.error(`[background-loader] ${scriptName} failed to load:`, e);
                };
                document.head.appendChild(script);
            },
            args: [scriptUrl, scriptToInject]
        });

        writeLog(`[background] All scripts injected successfully for tab ${tabId}.`);
    } catch (err: any) {
        writeLog(`[background] Script injection failed: ${err.message}`);
    }
}

async function sendResultsToServer(simId: string, ifId: string, scrapedResults: any) {
    try {
        // Helper function to clean monetary values
        const cleanMonetaryValue = (value: any): number | null => {
            if (typeof value === 'number') return value;
            if (typeof value !== 'string') return null;

            // Remove currency symbols (R$, $, etc.) and whitespace
            let cleaned = value.replace(/[R$\s]/g, '');

            // Brazilian format: 380.651,46 -> convert to 380651.46
            // Remove thousands separator (.) and replace decimal separator (,) with (.)
            cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');

            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? null : parsed;
        };

        // Helper function to clean prazo (period) - extract numbers only
        const cleanPrazo = (value: any): number | null => {
            if (typeof value === 'number') return value;
            if (typeof value !== 'string') return null;

            // Extract numbers only (e.g., "271 meses" -> 271)
            const numbers = value.replace(/\D/g, '');
            const parsed = parseInt(numbers, 10);
            return isNaN(parsed) ? null : parsed;
        };

        // Helper function to sanitize string values
        const sanitizeStringValue = (value: any): any => {
            // Convert "undefined" string or empty strings to null
            if (value === 'undefined' || value === '' || value === null || value === undefined) {
                return null;
            }
            return value;
        };

        // Helper function to process each simulation option/result
        const cleanSimulationOption = (option: any): any => {
            if (!option || typeof option !== 'object') return null;

            const prazo = option.prazo ? cleanPrazo(option.prazo) : null;
            const valorEntrada = option.valor_entrada ? cleanMonetaryValue(option.valor_entrada) : null;
            const valorTotal = option.valor_total ? cleanMonetaryValue(option.valor_total) : null;

            // Skip incomplete records
            if (prazo === null || valorEntrada === null) {
                writeLog(`[background] Skipping incomplete simulation option: ${JSON.stringify(option)}`);
                return null;
            }

            // Sanitize string fields - convert "undefined" or empty strings to null
            const jurosNominais = sanitizeStringValue(option.juros_nominais || option.juros_nominal);
            const jurosEfetivos = sanitizeStringValue(option.juros_efetivos || option.juros_efetivo);
            const tipoAmortizacao = sanitizeStringValue(option.tipo_amortizacao || option.amortization_type);

            return {
                prazo: prazo,
                valor_entrada: valorEntrada,
                valor_total: valorTotal,
                juros_nominais: jurosNominais,
                juros_efetivos: jurosEfetivos,
                tipo_amortizacao: tipoAmortizacao
            };
        };

        let processedData: any;

        if (scrapedResults.if && scrapedResults.result) {
            const cleanedResults: any[] = [];

            if (Array.isArray(scrapedResults.result)) {
                for (const option of scrapedResults.result) {
                    const cleaned = cleanSimulationOption(option);
                    if (cleaned) {
                        cleanedResults.push(cleaned);
                    }
                }
            }

            processedData = {
                target: scrapedResults.if,
                status: 'success',
                data: {
                    result: cleanedResults,
                    message: scrapedResults.message || ''
                }
            };
        } else if (scrapedResults.target && scrapedResults.data) {
            // Already in correct structure: { target: "caixa", status: "success", data: { result: [...] } }
            processedData = { ...scrapedResults };

            // Still clean the results
            if (scrapedResults.data?.result && Array.isArray(scrapedResults.data.result)) {
                const cleanedResults: any[] = [];
                for (const option of scrapedResults.data.result) {
                    const cleaned = cleanSimulationOption(option);
                    if (cleaned) {
                        cleanedResults.push(cleaned);
                    }
                }
                processedData.data.result = cleanedResults;
            }
        } else {
            // Unknown structure, wrap it
            writeLog(`[background] Unknown result structure, wrapping as-is`);
            processedData = {
                target: ifId,
                status: 'success',
                data: {
                    result: [],
                    message: 'Unknown data structure'
                }
            };
        }

        writeLog(`[background] Original results: ${JSON.stringify(scrapedResults, null, 2)}`);
        writeLog(`[background] Processed results: ${JSON.stringify(processedData, null, 2)}`);

        // Format and store the simulation result
        const simulationResult = {
            sim_id: simId,
            if_id: ifId,
            api_data: processedData
        };

        writeLog(`[background] Storing simulation result: sim_id=${simId}, if_id=${ifId}`);

        // Store in chrome.storage.local
        await new Promise<void>((resolve, reject) => {
            chrome.storage.local.set({ simulationResult }, () => {
                if (chrome.runtime.lastError) {
                    writeLog(`[background] Error storing result: ${chrome.runtime.lastError.message}`);
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    writeLog(`[background] Simulation result stored successfully in chrome.storage.local`);
                    resolve();
                }
            });
        });

        // Validate authentication before sending
        writeLog(`[background] Validating authentication before sending results...`);
        const isAuthenticated = await checkAuth();

        if (!isAuthenticated) {
            writeLog(`[background] Authentication failed - cannot send results to server`);
            console.warn('[background] Authentication required. Results stored in chrome.storage for manual testing.');
            return;
        }

        // Get the config to determine the correct URL
        const config = await getConfig();
        const baseUrl = config.urlSuperleme;
        const apiUrl = `${baseUrl}api/model/sl_cad_interacao_simulacao/post/insert_simulacao`;

        writeLog(`[background] Preparing to send results to server`);
        writeLog(`[background] Base URL: ${baseUrl}`);
        writeLog(`[background] Full API URL: ${apiUrl}`);
        writeLog(`[background] Environment: ${config.isDevelopment ? 'development' : 'production'}`);

        // Retrieve stored auth cookies
        const authData = await new Promise<any>((resolve) => {
            chrome.storage.local.get(['sessionData', 'authToken'], (result) => {
                resolve(result);
            });
        });

        writeLog(`[background] Retrieved auth data from storage`);
        writeLog(`[background] Has sessionData: ${!!authData.sessionData}`);
        writeLog(`[background] Has authToken: ${!!authData.authToken}`);

        if (authData.sessionData) {
            writeLog(`[background] Available cookies: ${Object.keys(authData.sessionData).join(', ')}`);
        }

        // Build headers matching the working Python script exactly
        const headers: Record<string, string> = {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'pt-BR,pt;q=0.9',
            'Content-Type': 'application/json',
            'cache-control': 'no-cache',
            'pragma': 'no-cache',
            'priority': 'u=0, i',
            'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Linux"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        };

        // Add authentication cookies to headers if available
        if (authData.sessionData) {
            const cookieParts: string[] = [];

            // Add cookies in the same order as Python script for consistency
            const cookieOrder = ['_hjSessionUser_3537769', 'cf_clearance', 'cotonic-sid', 'startHidden', 'timezone', 'z.auth', 'z.lang', 'z.tz'];

            // First add cookies in preferred order
            for (const cookieName of cookieOrder) {
                if (authData.sessionData[cookieName]) {
                    cookieParts.push(`${cookieName}=${authData.sessionData[cookieName]}`);
                }
            }

            // Then add any remaining cookies not in the list
            for (const [cookieName, cookieValue] of Object.entries(authData.sessionData)) {
                if (cookieValue && !cookieOrder.includes(cookieName)) {
                    cookieParts.push(`${cookieName}=${cookieValue}`);
                }
            }

            if (cookieParts.length > 0) {
                headers['Cookie'] = cookieParts.join('; ');
                writeLog(`[background] Added Cookie header with ${cookieParts.length} cookies`);
                writeLog(`[background] Cookie names: ${Object.keys(authData.sessionData).filter(k => authData.sessionData[k]).join(', ')}`);
            } else {
                writeLog(`[background] No cookies to add to headers`);
            }
        } else {
            writeLog(`[background] WARNING: No session data found in storage - request may fail authentication`);
        }

        // Build request body with processed results
        const requestBody = {
            sim_id: simId,
            if_id: ifId,
            api_data: processedData
        };

        writeLog(`[background] Request body to send: ${JSON.stringify(requestBody, null, 2)}`);

        console.log('[background] Fetch starting...', {
            url: apiUrl,
            method: 'POST',
            headers: headers,
            body: requestBody
        });

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            credentials: 'include',
            mode: 'cors'
        });

        writeLog(`[background] Fetch completed. Response status: ${response.status}`);
        writeLog(`[background] Response status text: ${response.statusText}`);
        writeLog(`[background] Response headers: ${JSON.stringify([...response.headers.entries()])}`);

        if (response.ok) {
            const contentType = response.headers.get('Content-Type') || '';
            let responseData;

            if (contentType.includes('application/json')) {
                responseData = await response.json();
                console.log('[background] Successfully sent results to server. Response:', responseData);
                writeLog(`[background] Successfully sent results to server. Response: ${JSON.stringify(responseData)}`);
            } else {
                const responseText = await response.text();
                console.log('[background] Successfully sent results to server. Response (text):', responseText);
                writeLog(`[background] Successfully sent results to server. Response (text): ${responseText}`);
                responseData = { text: responseText };
            }

            return responseData;
        } else {
            const errorText = await response.text();
            console.error('[background] Server returned error. Status:', response.status, 'Error:', errorText);
            writeLog(`[background] Server error. Status: ${response.status}, Error: ${errorText}`);
            // Don't throw, just log and return
            return null;
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        console.error('[background] Error sending results:', error);
        writeLog(`[background] Error sending results: ${errorMessage}`);
        writeLog(`[background] Error type: ${error instanceof TypeError ? 'TypeError' : typeof error}`);
        if (errorStack) {
            writeLog(`[background] Error stack: ${errorStack}`);
        }

        // Check if it's a network error
        if (error instanceof TypeError && errorMessage.includes('fetch')) {
            console.warn('[background] Network/CORS error - the server may not be accessible or CORS headers may be missing.');
            writeLog(`[background] This appears to be a network/CORS error. The server may not be accessible or CORS headers may be missing.`);
        }

        return null;
    }
}
