import React from 'react';
import { createRoot } from 'react-dom/client';
import { AutoMountComponent } from './AutoMountComponent';
import { SimulationOverlay } from './SimulationOverlay';
import './App.css';

let logs: string[] = [];

function registerLog(message: string) {
	logs.push(message);
}

function printLogs() {
	console.clear();
	logs.forEach(msg => console.log(msg));
}

export const CaixaNavigatorSecondStep: React.FC<{ data: Record<string, any> }> = ({ data }) => {
	
	const [isComplete, setIsComplete] = React.useState(false);

	registerLog(`[CaixaNavigatorSecondStep] Received data: ${JSON.stringify(data)}`);
	const isCaixaPage = typeof window !== 'undefined' && /\.caixa\.gov\.br$/.test(window.location.hostname);
	
	async function processFinancingOptions(): Promise<any> {
		registerLog(' ##### processFinancingOptions() CALLED - FUNCTION IS EXECUTING #####');
		registerLog(` Current URL: ${window.location.href}`);
		registerLog(` Page title: ${document.title}`);
		
		try {
			registerLog(' ##### processFinancingOptions() CALLED - FUNCTION IS EXECUTING #####');
			
			registerLog('⏳  Waiting 2 seconds for page to be fully loaded...');
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			const passo3 = document.querySelector('#passo3');
			registerLog(` Found #passo3 element: ${!!passo3}`);
			
			if (!passo3) {
				console.error(' #passo3 not found - we might not be on the options page');
				return null;
			}
			
			registerLog(' Searching for financing option links...');
			
			const optionLinks = document.querySelectorAll('a.js-form-next');
			registerLog(` Found ${optionLinks.length} js-form-next links (no filtering applied)`);
			
			
			Array.from(optionLinks).forEach((link, index) => {
				const text = link.textContent?.trim();
				const onclick = link.getAttribute('onclick');
				registerLog(` Link ${index + 1}: "${text}" - onclick: ${onclick?.substring(0, 100)}... hasClass: ${link.classList.contains('js-form-next')} tagName: ${link.tagName}`);
			});
			
			if (optionLinks.length === 0) {
				console.error(' No financing option links found!');
				registerLog(' No financing option links found!');
				return null;
			}

			const lendingOptions: any = { result: [] };
			
			for (let i = 0; i < optionLinks.length; i++) {
				const link = optionLinks[i] as HTMLAnchorElement;
				const optionName = link.textContent?.trim() || `Option ${i + 1}`;
				
				if (optionName.toLowerCase().includes('clique aqui')) {
					registerLog(` Skipping "clique aqui" link: "${optionName}"`);
					continue;
				}

				registerLog(` ===== Processing option ${i + 1}/${optionLinks.length}: "${optionName}" =====`);
				
				try {
					registerLog(` Executing JS destruction script...`);
					const jsDestroyScript = `
						var elements = document.querySelectorAll('.erro_feedback');
						var removedCount = 0;
						for (var i = 0; i < elements.length; i++) {
							if (elements[i].textContent.includes('Habite Seguro')) {
								elements[i].remove();
								removedCount++;
							}
						}
						return removedCount;
					`;
					
					const numRemoved = (window as any).eval(`(function() { ${jsDestroyScript} })()`);
					registerLog(` JS destruction removed ${numRemoved} unwanted error elements`);
					
					registerLog(` Attempting to click link...`);
					
					let clickSuccess = false;
					
					try {
						link.click();
						registerLog(` Direct click successful`);
						printLogs();
						clickSuccess = true;
					} catch (error) {
						registerLog(` Direct click failed: ${error}`);
					}
					
					if (!clickSuccess) {
						try {
							const onclickAttr = link.getAttribute('onclick');
							if (onclickAttr) {
								registerLog(` Executing onclick directly: ${onclickAttr.substring(0, 100)}...`);
								(window as any).eval(onclickAttr);
								clickSuccess = true;
							}
						} catch (error) {
							registerLog(` Onclick execution failed: ${error}`);
						}
					}
					
					if (!clickSuccess) {
						try {
							registerLog(` Trying dispatched click event`);
							const event = new MouseEvent('click', { bubbles: true, cancelable: true });
							link.dispatchEvent(event);
							clickSuccess = true;
						} catch (error) {
							registerLog(` Event dispatch failed: ${error}`);
						}
					}
					
					if (!clickSuccess) {
						registerLog(` All click approaches failed for option "${optionName}"`);
						continue;
					}

					registerLog(` Click executed, waiting for response...`);
					await new Promise(resolve => setTimeout(resolve, 2000));

					// Verificar o que aconteceu após o clique
					registerLog(` Analyzing page response...`);

					const errorElements = document.querySelectorAll('.erro_feedback');
					registerLog(` Found ${errorElements.length} .erro_feedback elements`);
					
					let errorFound = false;

					if (errorElements.length > 0) {
						errorElements.forEach((errorEl, index) => {
							const errorText = errorEl.textContent?.trim() || '';
							registerLog(` Error element ${index + 1}: "${errorText.substring(0, 100)}..."`);
						});

						for (const errorEl of errorElements) {
							const errorText = errorEl.textContent?.toLowerCase() || '';
							
							if (errorText.includes('os resultados obtidos representam apenas uma simulação') ||
								errorText.includes('caso tenha feito opção pelo crédito imobiliário')) {
								registerLog(` Skipping generic disclaimer error`);
								continue;
							}

							if (errorText.includes('insuficiente') || errorText.includes('valor')) {
								registerLog(` Found relevant error for option "${optionName}": ${errorEl.textContent?.substring(0, 200)}`);
								lendingOptions.result.push({
									erro: errorEl.textContent?.trim(),
									tipo_amortizacao: optionName
								});
								errorFound = true;
								break;
							}
						}
					}

					if (!errorFound) {
						registerLog(` No error found, looking for results table...`);
						const tableData = await extractTableData(optionName);
						if (tableData) {
							registerLog(` Successfully extracted table data`);
							printLogs();
							lendingOptions.result.push(tableData);
						} else {
							registerLog(` No table data found`);
						}
					}

					registerLog(` Going back to options page...`);
					printLogs();
					if (errorFound) {
						await goBackFromErrorPage();
					} else {
						await goBackFromSuccessPage();
					}

				} catch (error: any) {
					registerLog(` Error processing option "${optionName}": ${error.message}`);
					printLogs();
					await goBackFromErrorPage();
				}
			}

			lendingOptions.if = "caixa";

			// Enviar o resultado final de volta ao script de background com lógica de retry usando ponte window.postMessage
			const sendResultsWithRetry = async (retries = 3) => {
				for (let i = 0; i < retries; i++) {
					try {
						registerLog(`Sending final results to background script (attempt ${i + 1}/${retries})...`);
						registerLog(`Final payload being sent: ${JSON.stringify(lendingOptions)}`);
						
						await new Promise((resolve, reject) => {
							const messageId = Date.now() + Math.random();

							const responseHandler = (event: MessageEvent) => {
								if (event.source !== window) return;
								if (event.data.type === 'BACKGROUND_TO_CAIXA') {
									window.removeEventListener('message', responseHandler);

									if (event.data.success) {
										registerLog(`Results sent successfully (attempt ${i + 1}). Response: ${JSON.stringify(event.data.response)}`);
										console.log('Background response:', event.data.response);
										resolve(event.data.response);
									} else {
										registerLog(`Error sending results (attempt ${i + 1}): ${event.data.error}`);
										console.error('Bridge error:', event.data.error);
										reject(new Error(event.data.error));
									}
								}
							};

							window.addEventListener('message', responseHandler);

							// Enviar mensagem via ponte
							window.postMessage({
								type: 'CAIXA_TO_BACKGROUND',
								messageId: messageId,
								payload: { action: "simulationResult", payload: lendingOptions }
							}, '*');

							// Timeout após 5 segundos
							setTimeout(() => {
								window.removeEventListener('message', responseHandler);
								reject(new Error('Response timeout'));
							}, 5000);
						});
						
						// Se chegarmos aqui, a mensagem foi enviada com sucesso
						registerLog('Message sent successfully, breaking retry loop');
						break;
						
					} catch (e: any) {
						registerLog(`Exception while sending results (attempt ${i + 1}): ${e.message}`);
						console.error('Exception sending results:', e);
						
						if (i === retries - 1) {
							// Última tentativa falhou, tentar armazenar diretamente em localStorage como fallback
							registerLog('All retry attempts failed, storing in localStorage as fallback...');
							try {
								localStorage.setItem('caixa_simulation_result', JSON.stringify(lendingOptions));
								registerLog('Results stored in localStorage as fallback');
							} catch (storageError: any) {
								registerLog(`Failed to store in localStorage: ${storageError.message}`);
							}
						} else {
							// Aguardar antes de tentar novamente
							await new Promise(resolve => setTimeout(resolve, 1000));
						}
					}
				}
			};
			
			await sendResultsWithRetry();

			return lendingOptions.result.length > 0 ? lendingOptions : null;

		} catch (error: any) {
			registerLog(` Failed to process financing options: ${error.message}`);
			printLogs();
			return null;
		}
	}

	// Back function for the ERROR page
	async function goBackFromErrorPage(): Promise<void> {
		try {
			const backButton = document.querySelector('button[onclick*="voltarTelaEnquadrar"]');
			if (backButton) {
				registerLog(` Clicking back button from ERROR page: button[onclick*="voltarTelaEnquadrar"]`);
				(backButton as HTMLElement).click();
				await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to reload
			} else {
				registerLog(` Could not find back button on error page.`);
			}
		} catch (error: any) {
			registerLog(` Error going back from error page: ${error.message}`);
		}
	}

	async function goBackFromSuccessPage(): Promise<void> {
		try {
			const backButton = document.querySelector('#botaoVoltar');
			if (backButton) {
				registerLog(` Clicking back button from SUCCESS page: #botaoVoltar`);
				(backButton as HTMLElement).click();
				await new Promise(resolve => setTimeout(resolve, 2000)); 
			} else {
				registerLog(` Could not find back button on success page.`);
			}
		} catch (error: any) {
			registerLog(` Error going back from success page: ${error.message}`);
		}
	}

	// Extract data from results table
	async function extractTableData(optionName: string): Promise<any | null> {
		try {
			// Look for the results table
			registerLog(` Looking for table.simple-table...`);
			const table = document.querySelector('table.simple-table');
			
			if (!table) {
				registerLog(` No table.simple-table found, checking for other table types...`);
				const allTables = document.querySelectorAll('table');
				registerLog(` Found ${allTables.length} tables total`);
				allTables.forEach((t, i) => {
					registerLog(` Table ${i + 1}: class="${t.className}" rows=${t.querySelectorAll('tr').length}`);
				});
				return null;
			}

			registerLog(` Found results table for option "${optionName}" with ${table.querySelectorAll('tr').length} rows`);
			
			// Extract table data
			const rows = table.querySelectorAll('tr');
			const tableData: any = {
				tipo_amortizacao: optionName,
				prazo: null,
				valor_total: null,
				valor_entrada: null,
				juros_nominais: null,
				juros_efetivos: null
			};

			rows.forEach((row, rowIndex) => {
				const cells = row.querySelectorAll('td');
				if (cells.length >= 2) {
					const key = (cells[0].textContent?.trim() || '').toLowerCase();
					const valueCell = cells[1];

					// Try to get value from center tag first, then from td directly
					const centerTag = valueCell.querySelector('center');
					const value = (centerTag?.textContent?.trim() || valueCell.textContent?.trim() || '').replace(/\s+/g, ' ');

					registerLog(` Row ${rowIndex + 1}: "${key}" = "${value}"`);
					
					if (key && value) {
						// Map fields based on key text (case-insensitive)
						if (key.includes('amortiza')) {
							tableData.tipo_amortizacao = `${value} ${optionName}`.trim();
							registerLog(` Mapped tipo_amortizacao: ${tableData.tipo_amortizacao}`);
						} else if (key.includes('prazo') && key.includes('escolhido')) {
							tableData.prazo = value;
							registerLog(` Mapped prazo: ${tableData.prazo}`);
						} else if (key.includes('financiamento') && key.includes('valor')) {
							tableData.valor_total = value;
							registerLog(` Mapped valor_total: ${tableData.valor_total}`);
						} else if (key.includes('entrada') && key.includes('valor')) {
							tableData.valor_entrada = value;
							registerLog(` Mapped valor_entrada: ${tableData.valor_entrada}`);
						}
					}
				}
			});

			// Extract interest rates using the same XPath selector as Python
			try {
				registerLog(` Looking for interest rates using XPath...`);

				// Use XPath to find juros nominais - same as Python code
				const jurosNominaisXPath = "//td[contains(., 'Juros Nominais')]/following-sibling::td/center";
				const jurosNominaisResult = document.evaluate(
					jurosNominaisXPath,
					document,
					null,
					XPathResult.FIRST_ORDERED_NODE_TYPE,
					null
				);

				if (jurosNominaisResult.singleNodeValue) {
					tableData.juros_nominais = jurosNominaisResult.singleNodeValue.textContent?.trim();
					registerLog(` Found juros nominais: ${tableData.juros_nominais}`);
				} else {
					registerLog(` Could not find juros nominais`);
				}

				// Use XPath to find juros efetivos - same as Python code
				const jurosEfetivosXPath = "//td[contains(., 'Juros Efetivos')]/following-sibling::td/center";
				const jurosEfetivosResult = document.evaluate(
					jurosEfetivosXPath,
					document,
					null,
					XPathResult.FIRST_ORDERED_NODE_TYPE,
					null
				);

				if (jurosEfetivosResult.singleNodeValue) {
					tableData.juros_efetivos = jurosEfetivosResult.singleNodeValue.textContent?.trim();
					registerLog(` Found juros efetivos: ${tableData.juros_efetivos}`);
				} else {
					registerLog(` Could not find juros efetivos`);
				}

			} catch (error) {
				registerLog(` Could not extract interest rates: ${error}`);
			}

			registerLog(` Final table data: ${JSON.stringify(tableData)}`);
			return tableData;

		} catch (error: any) {
			registerLog(` Error extracting table data: ${error.message}`);
			return null;
		}
	}

	async function goBackToOptionsPage(): Promise<void> {
		try {
			// More specific selectors first, removed 'button.js-form-prev'
			const backSelectors = [
				'button[onclick*="voltarTelaEnquadrar"]',
				'a[onclick*="voltarTelaEnquadrar"]',
				'#botaoVoltar'
			];

			for (const selector of backSelectors) {
				const backButton = document.querySelector(selector);
				if (backButton) {
					registerLog(` Clicking back button: ${selector}`);
					(backButton as HTMLElement).click();
					registerLog(` Back navigation successful`);
					printLogs();
					// Wait for the page to reload
					await new Promise(resolve => setTimeout(resolve, 2000));
					return;
				}
			}

			registerLog(` No specific back button found. Trying window.history.back() as a last resort.`);
			window.history.back();
			await new Promise(resolve => setTimeout(resolve, 2000));

		} catch (error: any) {
			registerLog(` Error going back: ${error.message}`);
			printLogs();
		}
	}

	React.useEffect(() => {
		if (!isCaixaPage) {
			registerLog('[CaixaNavigatorSecondStep] Not on caixa.gov.br, skipping automation');
			return;
		}
		
		// Check if automation has already run to prevent multiple executions
		if ((window as any).__CAIXA_SECOND_STEP_EXECUTED) {
			registerLog('[CaixaNavigatorSecondStep] Automation already executed, skipping');
			return;
		}

		registerLog('[CaixaNavigatorSecondStep] Second step component loaded for financing options processing');
		printLogs();
		
		const runSecondStepAutomation = async () => {
			// Mark as executed to prevent re-runs
			(window as any).__CAIXA_SECOND_STEP_EXECUTED = true;

			registerLog('About to call processFinancingOptions()...');
			printLogs();
			
			try {
				const optionsResult = await processFinancingOptions();
				registerLog('processFinancingOptions() completed');
				
				if (optionsResult) {
					registerLog(`Successfully processed ${optionsResult.result?.length || 0} financing options`);
					registerLog(`Financing Options Result: ${JSON.stringify(optionsResult, null, 2)}`);
				} else {
					registerLog('No financing options found or processing failed');
				}

				// Mark automation as complete to show success animation
				setIsComplete(true);
			} catch (error: any) {
				console.error('ERROR in processFinancingOptions():', error);
				registerLog(` ERROR in processFinancingOptions(): ${error.message}`);
				printLogs();
			}
			
			registerLog(' Second step automation sequence completed.');
			printLogs();
        }

        // Add a small delay to ensure page is fully loaded
        setTimeout(() => {
        	runSecondStepAutomation();
        }, 1000);

	}, [isCaixaPage]); // Removed JSON.stringify(data) to prevent re-runs on data changes

	return (
		<SimulationOverlay
			title="Processando Opções"
			subtitle="Procurando opções de financiamento"
			bankName="Caixa Econômica Federal"
			bankIcon="ibb-caixa"
			isComplete={isComplete}
		>
			<div className="caixa-navigator-second-step">
				<h2>Caixa Second Step Automation Running...</h2>
				<p>Processing financing options...</p>
			</div>
		</SimulationOverlay>
	);
};

// registerLog('[caixaNavigationSecondStep.js] Script loaded. Starting auto-mount...');

// Auto-montar o componente CaixaNavigatorSecondStep usando AutoMountComponent
const AutoMountCaixaNavigatorSecondStep = () => (
	<AutoMountComponent
		Component={CaixaNavigatorSecondStep}
		containerId="caixa-navigator-second-step-root"
		containerStyles={{}}
		logPrefix="caixaNavigationSecondStep.js"
		registerLog={registerLog}
		printLogs={printLogs}
	/>
);

// Inicializar o componente de auto-montagem
const initializeAutoMount = () => {
	const mountPoint = document.createElement('div');
	mountPoint.id = 'auto-mount-second-step-point';
	document.body.appendChild(mountPoint);
	
	const root = createRoot(mountPoint);
	root.render(React.createElement(AutoMountCaixaNavigatorSecondStep));
};

initializeAutoMount();
