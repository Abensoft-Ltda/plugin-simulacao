import React from 'react';
import { createRoot } from 'react-dom/client';
import { AutoMountComponent } from './AutoMountComponent';
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

					// Check what happened after clicking
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

			// Send the final result back to the background script with retry logic using window.postMessage bridge
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
							
							// Send message via bridge
							window.postMessage({
								type: 'CAIXA_TO_BACKGROUND',
								messageId: messageId,
								payload: { action: "simulationResult", payload: lendingOptions }
							}, '*');
							
							// Timeout after 5 seconds
							setTimeout(() => {
								window.removeEventListener('message', responseHandler);
								reject(new Error('Response timeout'));
							}, 5000);
						});
						
						// If we get here, the message was sent successfully
						registerLog('Message sent successfully, breaking retry loop');
						break;
						
					} catch (e: any) {
						registerLog(`Exception while sending results (attempt ${i + 1}): ${e.message}`);
						console.error('Exception sending results:', e);
						
						if (i === retries - 1) {
							// Last attempt failed, try storing directly in localStorage as fallback
							registerLog('All retry attempts failed, storing in localStorage as fallback...');
							try {
								localStorage.setItem('caixa_simulation_result', JSON.stringify(lendingOptions));
								registerLog('Results stored in localStorage as fallback');
							} catch (storageError: any) {
								registerLog(`Failed to store in localStorage: ${storageError.message}`);
							}
						} else {
							// Wait before retrying
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
			const tableData: any = {};

			rows.forEach((row, rowIndex) => {
				const cells = row.querySelectorAll('td');
				if (cells.length >= 2) {
					const key = cells[0].textContent?.trim();
					const value = cells[1].textContent?.trim();
					
					registerLog(` Row ${rowIndex + 1}: "${key}" = "${value}"`);
					
					if (key && value) {
						if (key.includes('amortização')) {
							tableData.tipo_amortizacao = `${value} ${optionName}`;
							registerLog(` Mapped amortization: ${tableData.tipo_amortizacao}`);
						} else if (key === 'Prazo escolhido') {
							tableData.prazo = value;
						} else if (key === 'Valor do financiamento') {
							tableData.valor_total = value;
						} else if (key === 'Valor da entrada') {
							tableData.valor_entrada = value;
						}
					}
				}
			});

			// Extract interest rates with better selectors
			try {
				registerLog(` Looking for interest rates...`);
				
				// Try multiple approaches to find interest rates
				const jurosNominaisSelectors = [
					'td:contains("Juros Nominais") + td center',
					'td:contains("Juros Nominais") ~ td center', 
					'td[contains(.,"Juros Nominais")] + td center',
					'//td[contains(.,"Juros Nominais")]/following-sibling::td/center'
				];
				
				let jurosNominais = null;
				for (const selector of jurosNominaisSelectors.slice(0, 2)) { // Skip XPath for now
					jurosNominais = document.querySelector(selector);
					if (jurosNominais) break;
				}
				
				if (jurosNominais) {
					tableData.juros_nominais = jurosNominais.textContent?.trim();
					registerLog(` Found juros nominais: ${tableData.juros_nominais}`);
				} else {
					registerLog(` Could not find juros nominais`);
				}

				let jurosEfetivos = null;
				const jurosEfetivosSelectors = [
					'td:contains("Juros Efetivos") + td center',
					'td:contains("Juros Efetivos") ~ td center'
				];
				
				for (const selector of jurosEfetivosSelectors) {
					jurosEfetivos = document.querySelector(selector);
					if (jurosEfetivos) break;
				}
				
				if (jurosEfetivos) {
					tableData.juros_efetivos = jurosEfetivos.textContent?.trim();
					registerLog(` Found juros efetivos: ${tableData.juros_efetivos}`);
				} else {
					registerLog(` Could not find juros efetivos`);
				}

			} catch (error) {
				registerLog(` Could not extract interest rates: ${error}`);
			}

			registerLog(` Final table data: ${JSON.stringify(tableData)}`);
			return Object.keys(tableData).length > 0 ? tableData : null;

		} catch (error: any) {
			registerLog(` Error extracting table data: ${error.message}`);
			printLogs();
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
		
		registerLog('[CaixaNavigatorSecondStep] Second step component loaded for financing options processing');
		printLogs();
		
		const runSecondStepAutomation = async () => {
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
			} catch (error: any) {
				console.error('ERROR in processFinancingOptions():', error);
				registerLog(` ERROR in processFinancingOptions(): ${error.message}`);
				printLogs();
			}
			
			registerLog(' Second step automation sequence completed.');
			printLogs();
        }

        runSecondStepAutomation();
		
	}, [isCaixaPage, JSON.stringify(data)]);
	
	return (
		<div className="caixa-navigator-second-step">
			<h2>Caixa Second Step Automation Running...</h2>
			<p>Processing financing options...</p>
		</div>
	);
};

registerLog('[caixaNavigationSecondStep.js] Script loaded. Starting auto-mount...');

// Auto-mount the CaixaNavigatorSecondStep component
const AutoMountCaixaNavigatorSecondStep = () => (
	<AutoMountComponent
		Component={CaixaNavigatorSecondStep}
		containerId="caixa-navigator-second-step-root"
		containerStyles={{
			backgroundColor: 'lightblue',
			border: '2px solid blue'
		}}
		logPrefix="caixaNavigationSecondStep.js"
		registerLog={registerLog}
		printLogs={printLogs}
	/>
);

// Initialize the auto-mount component
const initializeAutoMount = () => {
	const mountPoint = document.createElement('div');
	mountPoint.id = 'auto-mount-second-step-point';
	document.body.appendChild(mountPoint);
	
	const root = createRoot(mountPoint);
	root.render(React.createElement(AutoMountCaixaNavigatorSecondStep));
};

initializeAutoMount();

(function() {
	async function main() {
		try {
			const data = (window as any).__CAIXA_AUTO_MOUNT_DATA;
			if (data) {
				registerLog('[CaixaNavigatorSecondStep] Auto-mounting with pre-seeded data.');
				printLogs();
				
				const container = document.createElement('div');
				container.id = 'caixa-navigator-second-step-root';
				container.style.position = 'fixed';
				container.style.top = '10px';
				container.style.right = '10px';
				container.style.zIndex = '9999';
				container.style.backgroundColor = 'lightblue';
				container.style.border = '1px solid blue';
				container.style.padding = '10px';
				document.body.appendChild(container);
				
				const root = createRoot(container);
				root.render(React.createElement(CaixaNavigatorSecondStep, { data }));

			} else {
				registerLog('[CaixaNavigatorSecondStep] No pre-seeded data found.');
			}
		} catch (e: any) {
			console.error(`[CaixaNavigatorSecondStep] Auto-mount failed: ${e.message}`, e);
			registerLog(`[CaixaNavigatorSecondStep] Auto-mount failed: ${e.message}`);
			printLogs();
		}
	}

	main();
})();