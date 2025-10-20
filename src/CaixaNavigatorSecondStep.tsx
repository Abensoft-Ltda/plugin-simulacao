import React from 'react';
import { SimulationOverlay } from './SimulationOverlay';
import './App.css';
import { SimulationPayload } from './lib/SimulationPayload';
import { autoMountNavigator } from './lib/autoMountNavigator';

let logs: string[] = [];

function registerLog(message: string) {
	const timestampedMessage = `${message} -- [${new Date().toLocaleTimeString()}]`;
	logs.push(timestampedMessage);
}

function printLogs() {
	console.clear();
	logs.forEach(msg => console.log(msg));
}

function checkForErrorDialog(): boolean {
	const errorDialog = document.querySelector('#ui-id-34.ui-dialog-content.ui-widget-content');

	if (errorDialog) {
		const errorText = errorDialog.textContent?.trim();
		registerLog(`Found error dialog #ui-id-34 with text: "${errorText}"`);

		if (errorText?.includes('Campo obrigatório não informado')) {
			registerLog('Error dialog contains "Campo obrigatório não informado" - refreshing page');
			window.location.reload();
			return true;
		}
	}

	const allDialogs = document.querySelectorAll('.ui-dialog-content, [class*="ui-dialog"]');
	for (const dialog of allDialogs) {
		const dialogText = dialog.textContent?.trim();
		if (dialogText?.includes('Campo obrigatório não informado')) {
			registerLog(`Found error dialog with class "${dialog.className}" containing error text - refreshing page`);
			window.location.reload();
			return true;
		}
	}

	return false;
}

export const CaixaNavigatorSecondStep: React.FC<{ data: Record<string, any> }> = ({ data }) => {

	const [isComplete, setIsComplete] = React.useState(false);
	const hasSentResultsRef = React.useRef(false);
	const sanitizeFailureMessage = (mensagem: string): string => {
		const cleaned = (mensagem ?? '').toString().trim();
		const normalized = cleaned.length > 0 ? cleaned : 'Erro não especificado';
		const prefix = 'caixa:';
		return normalized.toLowerCase().startsWith(prefix) ? normalized : `${prefix} ${normalized}`;
	};

	const buildFailureEntry = (mensagem: string) => SimulationPayload.ensureEntry({ tipo_amortizacao: sanitizeFailureMessage(mensagem) }, 'caixa');

	const sendFailureResult = async (mensagem: string) => {
		if (hasSentResultsRef.current) {
			return;
		}

		const payload = new SimulationPayload('caixa', 'failure');
		payload.addEntry(buildFailureEntry(mensagem));
		const enviado = await sendResultsWithRetry(payload);

		if (enviado) {
			hasSentResultsRef.current = true;
			setIsComplete(true);
		}
	};

	const sendResultsWithRetry = async (
		payload: SimulationPayload,
		retries = 3
	): Promise<boolean> => {
		const normalized = payload.toJSON();

		for (let attempt = 1; attempt <= retries; attempt++) {
			try {
				registerLog(` Enviando resultado da Caixa ao background (tentativa ${attempt}/${retries})...`);
				printLogs();

				await new Promise<void>((resolve, reject) => {
					let completed = false;

					const responseHandler = (event: MessageEvent) => {
						if (event.source !== window) return;
						if (event.data.type === 'BACKGROUND_TO_CAIXA') {
							window.removeEventListener('message', responseHandler);
							completed = true;
							resolve();
						}
					};

					window.addEventListener('message', responseHandler);

					window.postMessage({
						type: 'CAIXA_TO_BACKGROUND',
						payload: { action: "simulationResult", payload: normalized }
					}, '*');

					setTimeout(() => {
						window.removeEventListener('message', responseHandler);
						if (!completed) {
							reject(new Error('Tempo de resposta esgotado ao enviar resultado da Caixa.'));
						}
					}, 5000);
				});

				registerLog(' Resultado da Caixa enviado com sucesso ao background.');
				printLogs();
				return true;
			} catch (error: any) {
				registerLog(` Falha ao enviar resultado na tentativa ${attempt}: ${error?.message || error}`);
				printLogs();
				if (attempt < retries) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				} else {
					registerLog(' Limite de tentativas de envio atingido para os resultados da Caixa.');
					printLogs();
					try {
						const fallbackKey = 'caixa_simulation_result';
						localStorage.setItem(fallbackKey, JSON.stringify(normalized));
						registerLog(` Resultado armazenado localmente em "${fallbackKey}" como fallback.`);
						printLogs();
					} catch (storageError: any) {
						registerLog(` Falha ao armazenar resultado localmente: ${storageError?.message || storageError}`);
						printLogs();
					}
					return false;
				}
			}
		}

		return false;
	};

	registerLog(`[CaixaNavigatorSecondStep] Received data: ${JSON.stringify(data)}`);
	const isCaixaPage = typeof window !== 'undefined' && /\.caixa\.gov\.br$/.test(window.location.hostname);

	async function processFinancingOptions(): Promise<any> {
		registerLog(` Current URL: ${window.location.href}`);
		registerLog(` Page title: ${document.title}`);

		try {
			// Initial error check
			if (checkForErrorDialog()) {
				const mensagem = 'A página da Caixa apresentou um aviso de erro antes de iniciar a coleta.';
				registerLog(` ${mensagem}`);
				await sendFailureResult(mensagem);
				return null;
			}

			registerLog('Waiting 2 seconds for page to be fully loaded...');
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Check for error dialog after page load
			if (checkForErrorDialog()) {
				const mensagem = 'A página da Caixa apresentou um aviso logo após o carregamento.';
				registerLog(` ${mensagem}`);
				await sendFailureResult(mensagem);
				return null;
			}

			const passo3 = document.querySelector('#passo3');
			registerLog(` Found #passo3 element: ${!!passo3}`);

			if (!passo3) {
				const mensagem = 'A tela de opções da Caixa não carregou totalmente para continuar a simulação.';
				console.error(mensagem);
				registerLog(` ${mensagem}`);
				await sendFailureResult(mensagem);
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
				const mensagem = 'Nenhuma opção de financiamento foi localizada na página da Caixa.';
				console.error(mensagem);
				registerLog(` ${mensagem}`);
				await sendFailureResult(mensagem);
				return null;
			}

			const payload = new SimulationPayload('caixa');

			for (let i = 0; i < optionLinks.length; i++) {
				const link = optionLinks[i] as HTMLAnchorElement;
				const optionName = link.textContent?.trim() || `Option ${i + 1}`;

				if (optionName.toLowerCase().includes('clique aqui')) {
					registerLog(` Skipping "clique aqui" link: "${optionName}"`);
					continue;
				}

				registerLog(` ===== Processing option ${i + 1}/${optionLinks.length}: "${optionName}" =====`);

				// Check for error dialog before processing each option
				if (checkForErrorDialog()) {
					const mensagem = 'A Caixa exibiu um aviso antes de coletar todas as opções.';
					registerLog(` ${mensagem}`);
					await sendFailureResult(mensagem);
					return null;
				}

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

					if (checkForErrorDialog()) {
						const mensagem = `A Caixa exibiu um erro ao abrir a opção "${optionName}".`;
						registerLog(` ${mensagem}`);
						await sendFailureResult(mensagem);
						return null;
					}

					registerLog(` Analyzing page response...`);
					const erroEls = Array.from(document.querySelectorAll('.erro_feedback'));
					registerLog(` Found ${erroEls.length} .erro_feedback elements`);

					let errorFound = false;

					if (erroEls.length > 0) {
						const previousCount = payload.entryCount();

						for (const e of erroEls) {
							const txtRaw = (e.textContent || '').trim();
							if (!txtRaw) continue;

							const elementId = e.id?.toLowerCase() || '';
							if (elementId.includes('divobservacao') || elementId.includes('divtextoexplicativo')) {
								registerLog(` Ignorando erro com ID informativo (${e.id}): ${txtRaw.substring(0, 200)}`);
								continue;
							}

							registerLog(` Captured erro_feedback: ${txtRaw.substring(0, 400)}`);
							payload.addEntry(buildFailureEntry(txtRaw));
						}

						errorFound = payload.entryCount() > previousCount;
					}

					if (!errorFound) {
						if (erroEls.length > 0) {
							registerLog(` Nenhum erro relevante encontrado nas mensagens. Tentando extrair tabela de resultados.`);
						} else {
							registerLog(` No .erro_feedback found; attempting to extract result table`);
						}
						const tableData = await extractTableData(optionName);
						if (tableData) {
							registerLog(` Successfully extracted table data`);
							printLogs();
							payload.addEntry(tableData);
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

			if (!payload.hasEntries()) {
				registerLog(' Nenhuma informação válida foi coletada nas opções da Caixa (resultado vazio).');
				printLogs();
			}

			const enviado = await sendResultsWithRetry(payload);
			hasSentResultsRef.current = enviado;
			return payload.toJSON();

		} catch (error: any) {
			const mensagem = `Falha ao processar as opções da Caixa: ${error.message}`;
			registerLog(` ${mensagem}`);
			printLogs();
			await sendFailureResult(mensagem);
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

					const centerTag = valueCell.querySelector('center');
					const value = (centerTag?.textContent?.trim() || valueCell.textContent?.trim() || '').replace(/\s+/g, ' ');

					registerLog(` Row ${rowIndex + 1}: "${key}" = "${value}"`);

					if (key && value) {

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
			return SimulationPayload.ensureEntry(tableData, 'caixa');

		} catch (error: any) {
			registerLog(` Error extracting table data: ${error.message}`);
			return null;
		}
	}

	React.useEffect(() => {
		if (!isCaixaPage) {
			registerLog('[CaixaNavigatorSecondStep] Not on caixa.gov.br, skipping automation');
			return;
		}

		if ((window as any).__CAIXA_SECOND_STEP_EXECUTED) {
			registerLog('[CaixaNavigatorSecondStep] Automation already executed, skipping');
			return;
		}


		const errorCheckInterval = setInterval(() => {
			checkForErrorDialog();
		}, 1000);

		registerLog('[CaixaNavigatorSecondStep] Second step component loaded for financing options processing');
		printLogs();

		const runSecondStepAutomation = async () => {
			(window as any).__CAIXA_SECOND_STEP_EXECUTED = true;

			registerLog('About to call processFinancingOptions()...');
			printLogs();

			let finalResult: any = null;
			for (let attempt = 1; attempt <= 2; attempt++) {
				registerLog(` processFinancingOptions attempt ${attempt}/2`);
				try {
					const optionsResult = await processFinancingOptions();
					registerLog(` processFinancingOptions completed (attempt ${attempt})`);
					if (optionsResult) {
						finalResult = optionsResult;
						break;
					} else {
						registerLog(` processFinancingOptions returned no results on attempt ${attempt}`);
					}
				} catch (error: any) {
					registerLog(` ERROR in processFinancingOptions() attempt ${attempt}: ${error?.message || error}`);
					printLogs();
				}

				if (attempt < 2) {
					registerLog(' Waiting before retry...');
					await new Promise(resolve => setTimeout(resolve, 1500));
				}
			}

			if (finalResult) {
				registerLog(`Successfully processed ${finalResult.result?.length || 0} financing options`);
				registerLog(`Financing Options Result: ${JSON.stringify(finalResult, null, 2)}`);
			} else {
				registerLog('All attempts failed to process financing options');
			}

			setIsComplete(true);

			registerLog(' Second step automation sequence completed.');
			printLogs();
		}

		// Add a small delay to ensure page is fully loaded
		setTimeout(() => {
			runSecondStepAutomation();
		}, 1000);

		// Cleanup interval on unmount
		return () => {
			clearInterval(errorCheckInterval);
		};

	}, [isCaixaPage]);

	return (
		<SimulationOverlay
			title="Processando Opções"
			subtitle="Procurando opções de financiamento"
			bankName="Caixa Econômica Federal"
			bankIcon="ibb-caixa"
			isComplete={isComplete}
		>
			<div className="caixa-navigator">
				<h2>Caixa Second Step Automation Running...</h2>
				<p>Processing financing options...</p>
			</div>
		</SimulationOverlay>
	);
};


registerLog('[caixaNavigationSecondStep.js] Script loaded. Starting auto-mount...');

autoMountNavigator(CaixaNavigatorSecondStep, {
	containerId: 'caixa-navigator-second-step-root',
	logPrefix: 'caixaNavigationSecondStep.js',
	registerLog,
	printLogs,
});
