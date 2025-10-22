import { writeLog } from './lib/logger';
import { CaixaFields, BBFields } from './methods/Validation';
import { SimulationResultService } from './lib/SimulationResultService';
import { AuthService } from './lib/AuthService';

let activeAutomations = new Map<number, any>();
let injectionInProgress = new Set<number>();

const simulationResultService = new SimulationResultService({ logPrefix: '[background]' });
const authService = new AuthService({ logPrefix: '[background][auth]' });

function normalizeLabel(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\.+$/, '');
}

const BANK_CODE_MAP: Record<string, string> = {
    '104': 'Caixa Econômica Federal',
    '1': 'Banco do Brasil S.A'
};

function resolveBankLabelFromCode(codeValue: any): string | null {
    if (codeValue === undefined || codeValue === null) {
        return null;
    }

    const primaryCode = String(codeValue).split(',')[0].trim();
    if (!primaryCode) {
        return null;
    }

    return BANK_CODE_MAP[primaryCode] ?? null;
}

function resolveBankLabel(targetData: Record<string, any>): { raw: string; normalized: string } | null {
    const directKeys = ['target', 'simulacao-target'];

    for (const key of directKeys) {
        const value = targetData?.[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            const trimmed = value.trim();
            return {
                raw: trimmed,
                normalized: normalizeLabel(trimmed)
            };
        }
    }

    const codeKeys = ['leal_if_id', 'simulacao-leal_if_id'];
    for (const key of codeKeys) {
        const labelFromCode = resolveBankLabelFromCode(targetData?.[key]);
        if (labelFromCode) {
            return {
                raw: labelFromCode,
                normalized: normalizeLabel(labelFromCode)
            };
        }
    }

    return null;
}

// Bank routing function to handle different bank simulations
async function startBankSimulation(fields: Record<string, any>, targetName: string): Promise<any> {
    const target = normalizeLabel(targetName);
    writeLog(`[background] Iniciando simulação para o banco: ${target}`);

    let targetUrl: string;

    switch (target) {
        case 'caixa economica federal':
            targetUrl = 'https://habitacao.caixa.gov.br/siopiweb-web/simulaOperacaoInternet.do?method=inicializarCasoUso';
            break;
        case 'banco do brasil s.a':
        case 'banco do brasil':
        case 'bb':
            targetUrl = 'https://cim-simulador-imovelproprio.apps.bb.com.br/simulacao-egi';
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

    writeLog(`[background] Criando aba para ${target} em ${targetUrl}`);


    // Create a new tab for the target bank simulation
    return new Promise((resolve, reject) => {
        chrome.tabs.create({ url: targetUrl }, (tab) => {
            if (!tab.id) {
                reject(new Error(`Failed to create tab for ${target}`));
                return;
            }

            writeLog(`[background] Aba criada com sucesso para ${target}: ${tab.id}`);

            const automationData = {
                fields,
                target,
                startTime: Date.now(),
                resolve,
                reject
            };

            activeAutomations.set(tab.id, automationData);
            writeLog(`[background] Dados da automação armazenados para a aba ${tab.id}`);

        });
    });
}

chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('superleme')) {
        writeLog(`[background] Página do Superleme detectada: ${tab.url}`);
        
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'ISOLATED',
            func: () => {
                let contextValid = true;
                window.addEventListener('unload', () => { contextValid = false; });
                window.postMessage({ type: 'SUPERLEME_BRIDGE_LOADED' }, '*');

                const handler = (event: MessageEvent) => {
                    if (!contextValid) return;
                    if (event.source !== window) return;
                    if (event.data.type === 'SUPERLEME_TO_BACKGROUND') {
                        window.postMessage({ type: 'SUPERLEME_BRIDGE_RECEIVED', payload: event.data.payload }, '*');

                        // Enviar confirmação imediata para o Superleme
                        window.postMessage({
                            type: 'BACKGROUND_TO_SUPERLEME',
                            payload: {
                                status: 'received',
                                message: 'Conexão recebida do Superleme. Extensão confirmada.',
                                action: event.data.payload?.action
                            }
                        }, '*');

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
                                        // Enviar resposta processada para o Superleme
                                        window.postMessage({
                                            type: 'BACKGROUND_TO_SUPERLEME',
                                            payload: {
                                                status: 'success',
                                                message: 'Processamento concluído com sucesso.',
                                                response: response
                                            }
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
            func: authService.buildExtractAuthScript()
        }).catch(() => {
        });
    }


    const automationData = activeAutomations.get(tabId);
    if (!automationData) return;
    
    writeLog(`[background] Aba ${tabId} status: ${changeInfo.status}, URL: ${tab.url}`);
    
    if (changeInfo.status === 'complete' && tab.url) {
        const target = automationData.target || 'caixa economica federal';
        const normalizedTarget = normalizeLabel(target);
        writeLog(`[background] Verificando se a aba ${tabId} é uma página de ${normalizedTarget}`);

        let isBankPage = false;

        // Check if we're on the correct bank's page based on the target
        switch (normalizedTarget) {
            case 'caixa':
            case 'caixa economica federal':
                isBankPage = tab.url.includes('caixa.gov.br');
                writeLog(`[background] Verificação da página da Caixa: ${tab.url} contém 'caixa.gov.br'? ${isBankPage}`);
                break;
            case 'banco do brasil s.a':
            case 'banco do brasil':
            case 'bb':
                isBankPage = tab.url.includes('bb.com.br');
                writeLog(`[background] Verificação da página do BB: ${tab.url} contém 'bb.com.br'? ${isBankPage}`);
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
                writeLog(`[background] Banco alvo desconhecido: ${target}`);
                return;
        }

        if (!isBankPage) {
            writeLog(`[background] Ainda não estamos na página de ${target}, URL: ${tab.url} - aguardando...`);
            return;
        }

        writeLog(`[background] Página de ${target} detectada! Navegação concluída: ${tab.url}`);

        // Handle Caixa-specific step detection
        if (target.toLowerCase() === 'caixa') {
            const secondStepUrl = 'https://habitacao.caixa.gov.br/siopiweb-web/simulaOperacaoInternet.do?method=enquadrarProdutos';
            if (tab.url.startsWith(secondStepUrl)) {
                writeLog(`[background] SEGUNDA ETAPA DA CAIXA DETECTADA! Injetando CaixaNavigatorSecondStep`);
            } else {
                writeLog(`[background] Primeira etapa da Caixa ou outra página. Injetando CaixaNavigator padrão`);
            }
        }
        
        writeLog(`[background] Iniciando injeção de scripts para a aba ${tabId} de ${target}`);

        if (injectionInProgress.has(tabId)) {
            writeLog(`[background] Injeção já em andamento para a aba ${tabId}, ignorando`);
            return;
        }
        
        injectionInProgress.add(tabId);
        
        setTimeout(() => {
            injectScripts(tabId, automationData, tab.url || '', target)
                .then(() => {
                    writeLog(`[background] Injeção de scripts concluída para ${target} na aba ${tabId}`);
                    injectionInProgress.delete(tabId);
                })
                .catch((error) => {
                    writeLog(`[background] Injeção de scripts falhou para ${target} na aba ${tabId}: ${error}`);
                    injectionInProgress.delete(tabId);
                });
        }, 100); 
    }
});

chrome.tabs.onRemoved.addListener((closedTabId: number) => {
    if (activeAutomations.has(closedTabId)) {
        writeLog(`[background] Aba ${closedTabId} fechada, realizando limpeza`);
        activeAutomations.delete(closedTabId);
    }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {

    if (request.action === "storeAuth") {
        authService.store(request.authData)
            .then(() => {
                sendResponse({ status: "success" });
            })
            .catch((error) => {
                console.error('[background] Erro ao salvar dados de autenticação:', error);
                sendResponse({ status: "error", message: error instanceof Error ? error.message : String(error) });
            });
        return true;
    }

    if (request.action === "log" || request.action === "writeLog") {
        writeLog(request.message);
        sendResponse({ status: "logged" });
        return true;
    }


    if (request.action === "startSimulationRequest") {
        console.log('[background] Processando startSimulationRequest');
        writeLog('[background] Processando startSimulationRequest');
        chrome.storage.local.remove(['simulationResult']);
        writeLog('[background] Solicitação de simulação recebida.');
        const targets = request.data?.targets;
        if (!Array.isArray(targets) || targets.length === 0) {
            writeLog('[background] Nenhum alvo de simulação válido recebido.');
            sendResponse({ status: "error", message: "No valid targets received." });
            return true;
        }

        (async () => {
            const isAuthValid = await authService.validate();
            if (!isAuthValid) {
                writeLog('[background] Autenticação inválida ou expirada. Abortando simulações.');
                sendResponse({ status: "error", message: "Autenticação inválida ou expirada." });
                return;
            }

            const results: Array<{ target: string; result?: any; errors?: string[] }> = [];
            
            // Create all simulation promises in parallel
            const simulationPromises = targets.map(async (target, idx) => {
                writeLog(`[background] Iniciando simulação paralela para target[${idx}]...`);
                const resolvedBank = resolveBankLabel(target);

                if (!resolvedBank) {
                    const message = `[background] Banco alvo desconhecido para target[${idx}]. Ignorando simulação.`;
                    writeLog(message);
                    return { target: `unknown_${idx}`, errors: [message] };
                }

                const { raw: bankLabelRaw, normalized: bankLabelNormalized } = resolvedBank;
                writeLog(`[background] Banco alvo detectado para target[${idx}]: ${bankLabelRaw}`);
                const isBancoDoBrasil = bankLabelNormalized === 'banco do brasil s.a';
                
                let fields: Record<string, any> = {};
                let errors: string[] = [];

                if (isBancoDoBrasil) {
                    const bbResult = BBFields.buildBBFields(target);
                    fields = bbResult.fields;
                    errors = bbResult.errors;
                } else {
                    // Default to Caixa for backward compatibility and banks sharing similar flow
                    const caixaResult = CaixaFields.buildCaixaFields(target);
                    fields = caixaResult.fields;
                    errors = caixaResult.errors;
                }

                const targetName = bankLabelNormalized || 'caixa economica federal';

                if (errors.length === 0) {
                    fields.target = targetName;
                }

                if (errors.length > 0) {
                    writeLog(`[background] Erros de validação para ${targetName}: ${errors.join(', ')}`);
                    return { target: targetName, errors };
                }

                writeLog(`[background] Validação aprovada para ${targetName}. Iniciando simulação...`);

                try {
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Simulation timed out after 30 seconds')), 30000)
                    );

                    const result = await Promise.race([
                        startBankSimulation(fields, targetName),
                        timeoutPromise
                    ]);

                    writeLog(`[background] Simulação para ${targetName} CONCLUÍDA.`);
                    return { target: targetName, result };

                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido na simulação';
                    writeLog(`[background] ERRO durante a simulação para ${targetName}: ${errorMessage}`);
                    return { target: targetName, errors: [errorMessage] };
                }
            });

            // Wait for all simulations to complete (or fail)
            writeLog(`[background] Aguardando ${simulationPromises.length} simulações terminarem...`);
            const settledResults = await Promise.allSettled(simulationPromises);

            // Process results from all simulations
            settledResults.forEach((settledResult, idx) => {
                if (settledResult.status === 'fulfilled') {
                    const value = settledResult.value ?? {};
                    results.push(value);

                    if (Array.isArray(value.errors) && value.errors.length > 0) {
                        writeLog(`[background] Simulação ${idx} concluída com erros: ${value.errors.join('; ')}`);
                    } else if (value.result === undefined || value.result === null) {
                        writeLog(`[background] Simulação ${idx} finalizada sem payload de resultado.`);
                    } else {
                        writeLog(`[background] Simulação ${idx} concluída com sucesso`);
                    }
                } else {
                    const resolved = targets[idx] ? resolveBankLabel(targets[idx]) : null;
                    const targetName = resolved ? resolved.normalized : `target_${idx}`;
                    const errorMessage = settledResult.reason instanceof Error ? settledResult.reason.message : String(settledResult.reason);
                    results.push({ 
                        target: targetName, 
                        errors: [`Promise rejection: ${errorMessage}`] 
                    });
                    writeLog(`[background] Promise da simulação ${idx} rejeitada: ${errorMessage}`);
                }
            });

            const successfulResults = results.filter(item => !(Array.isArray(item?.errors) && item.errors.length > 0) && item?.result !== undefined && item?.result !== null);
            const failedResults = results.filter(item => Array.isArray(item?.errors) && item.errors.length > 0 || item?.result === undefined || item?.result === null);

            const responseStatus = failedResults.length === 0
                ? "success"
                : (successfulResults.length > 0 ? "partial" : "error");

            writeLog(`[background] Todas as ${targets.length} simulações processadas. Sucesso: ${successfulResults.length}, Falha: ${failedResults.length}.`);

            const summaryPayload = {
                completedAt: Date.now(),
                totals: {
                    requested: targets.length,
                    success: successfulResults.length,
                    failed: failedResults.length
                },
                results
            };

            chrome.storage.local.set({ simulationSummary: summaryPayload }, () => {
                if (chrome.runtime.lastError) {
                    writeLog(`[background] Falha ao salvar o resumo da simulação: ${chrome.runtime.lastError.message}`);
                } else {
                    writeLog('[background] Resumo da simulação armazenado em chrome.storage.local.');
                }
            });

            sendResponse({ status: responseStatus, count: targets.length, results });
        })();

        return true;
    }

    if (request.action === "simulationResult") {
        const requestId = (request as any).__requestId;
        const resultPayload = request.payload;
        console.log('[background] Resultado da simulação recebido:', resultPayload);
        writeLog(`[background] Resultado da simulação recebido.`);

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

        writeLog(`[background] Processando resultado: sim_id=${simId}, if_id=${ifId}`);

        (async () => {
            let responseStatus = "success";
            
            if (simId !== 'unknown') {
                try {
                    await simulationResultService.sendResultsToServer(simId, ifId, resultPayload);
                    writeLog(`[background] Resultado enviado ao servidor e armazenado com sucesso`);
                } catch (error) {
                    writeLog(`[background] Falha no envio: ${error instanceof Error ? error.message : String(error)}`);
                    responseStatus = "failure";
                }
            } else {
                writeLog(`[background] sim_id inválido. Pulando envio ao servidor`);
                responseStatus = "failure";
            }

            if (automationData && automationData.resolve) {
                automationData.resolve(resultPayload);
                if (senderId) {
                    activeAutomations.delete(senderId);
                }
            }

            sendResponse({ status: responseStatus, requestId });
        })();

        return true;
    }

    return false;
});

async function injectScripts(tabId: number, data: any, url: string, target: string) {
    try {

        target = normalizeLabel(target);
        writeLog(`[background] Injetando dados na aba ${tabId} para ${target}.`);

        writeLog(`[background] Injetando App.css na aba ${tabId}.`);
        try {
            await chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['App.css']
            });
            writeLog(`[background] App.css injetado com sucesso.`);
        } catch (cssError: any) {
            writeLog(`[background] Falha ao injetar CSS: ${cssError.message}`);
        }

        writeLog(`[background] Injetando payload de automação na aba ${tabId}.`);
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: (dataToInject) => {
                (window as any).__CAIXA_AUTO_MOUNT_DATA = dataToInject;
            },
            args: [data]
        });
        writeLog(`[background] Payload de automação injetado na aba ${tabId}.`);

        writeLog(`[background] Injetando script bridge na aba ${tabId}.`);
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'ISOLATED',
            func: () => {
                console.log('[bridge] Script de conteúdo da ponte carregado');

                window.addEventListener('message', (event) => {
                    if (event.source !== window) return;

                    if (event.data.type === 'CAIXA_TO_BACKGROUND') {
                        console.log('[bridge] Mensagem recebida do mundo principal:', event.data);

                        const requestId = event.data.requestId;
                        const payload = {
                            ...event.data.payload,
                            __requestId: requestId
                        };

                        chrome.runtime.sendMessage(payload, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error('[bridge] Erro ao enviar para o background:', chrome.runtime.lastError);
                                window.postMessage({
                                    type: 'BACKGROUND_TO_CAIXA',
                                    success: false,
                                    error: chrome.runtime.lastError.message,
                                    requestId
                                }, '*');
                            } else {
                                console.log('[bridge] Resposta do background:', response);
                                window.postMessage({
                                    type: 'BACKGROUND_TO_CAIXA',
                                    success: true,
                                    response: response,
                                    requestId
                                }, '*');
                            }
                        });
                    }
                });

                console.log('[bridge] Configuração da ponte concluída');
            }
        });

        let scriptToInject: string;

        if (target == 'caixa' || target == 'caixa economica federal') {
            const secondStepUrl = 'https://habitacao.caixa.gov.br/siopiweb-web/simulaOperacaoInternet.do?method=enquadrarProdutos';
            if (url.startsWith(secondStepUrl)) {
                scriptToInject = 'caixaNavigationSecondStep.js';
                writeLog(`[background] CAIXA SEGUNDA ETAPA - Injetando ${scriptToInject}`);
            } else {
                scriptToInject = 'caixaNavigation.js';
                writeLog(`[background] CAIXA PRIMEIRA ETAPA - Injetando ${scriptToInject}`);
            }
        } else if (target === 'banco do brasil s.a' || target === 'banco do brasil' || target === 'bb') {
            scriptToInject = 'bbNavigation.js';
            writeLog(`[background] BANCO DO BRASIL - Injetando ${scriptToInject}`);
        } else {
            scriptToInject = 'caixaNavigation.js'; 
            writeLog(`[background] ${target.toUpperCase()} - Injetando ${scriptToInject} (fallback)`);
        }

        writeLog(`[background] Injetando script principal '${scriptToInject}' na aba ${tabId}.`);

        // Get the script URL in extension context first
        const scriptUrl = chrome.runtime.getURL(scriptToInject);

        // Inject the script as a module to handle ES6 imports
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: (scriptUrl, scriptName) => {
                const script = document.createElement('script');
                script.type = 'module';
                script.src = scriptUrl;  
                script.onload = () => {
                    console.log(`[background-loader] ${scriptName} carregado com sucesso`);
                };
                script.onerror = (e) => {
                    console.error(`[background-loader] ${scriptName} falhou ao carregar:`, e);
                };
                document.head.appendChild(script);
            },
            args: [scriptUrl, scriptToInject]
        });

        writeLog(`[background] Todos os scripts injetados com sucesso na aba ${tabId}.`);
    } catch (err: any) {
        writeLog(`[background] Injeção de scripts falhou: ${err.message}`);
    }
}
