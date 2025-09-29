import React from 'react';
import { createRoot } from 'react-dom/client';
import { CaixaFields } from './methods/Validation';
import './App.css';


declare global {
  interface Window {
    jQuery?: any;
  }
}

let logs: string[] = [];

function registerLog(message: string) {
	logs.push(message);
}

function printLogs() {
	console.clear();
	logs.forEach(msg => console.log(msg));
}

export const CaixaNavigator: React.FC<{ data: Record<string, any> }> = ({ data }) => {

	// Cache for select lookup tables - massive performance boost
	const selectCache = React.useRef<Map<string, {
		lookup: Record<string, string>;
		optionsHash: string;
	}>>(new Map());

	registerLog(` Received data: ${JSON.stringify(data)}`);
	const isCaixaPage = typeof window !== 'undefined' && /\.caixa\.gov\.br$/.test(window.location.hostname);
	// Build fields from raw data
	const { fields, errors } = CaixaFields.buildCaixaFields(data);
	registerLog(` Built fields: ${JSON.stringify(fields)}`);
	if(errors.length > 0) registerLog(` Validation errors: ${JSON.stringify(errors)}`);

	// Utility to wait for a key element before filling (non-throwing)
	function waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
		return new Promise((resolve) => {
			const start = Date.now();
			function check() {
				const el = document.querySelector(selector);
				if (el) return resolve(el);
				if (Date.now() - start > timeout) return resolve(null);
				setTimeout(check, 200);
			}
			check();
		});
	}

	function waitForElementEnabled(selector: string, timeout = 10000): Promise<Element | null> {
		return new Promise((resolve) => {
			const start = Date.now();
			function check() {
				const el = document.querySelector(selector) as HTMLInputElement;
				if (el && !el.disabled) return resolve(el);
				if (Date.now() - start > timeout) return resolve(null);
				setTimeout(check, 200);
			}
			check();
		});
	}
	
	// Utility to simulate natural input with vanilla JS
	async function simulateNaturalInput(selector: string, value: string, delay = 500, retries = 3) {
		for (let i = 0; i < retries; i++) {
			try {
				const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
				if (!el) {
					throw new Error(`Element not found for selector: ${selector}`);
				}

				registerLog(` Simulating input for ${selector} with value "${value}" (Attempt ${i + 1})`);
				const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

				const dispatchEvent = (element: Element, eventName: string) => {
					element.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
				};

				let targetInput = el as HTMLInputElement;
				if (el.tagName === 'SELECT') {
					const comboboxInput = document.querySelector(`#${el.id}_input`) as HTMLInputElement;
					if (comboboxInput) {
						targetInput = comboboxInput;
					}
				}

				targetInput.click();
				targetInput.focus();
				targetInput.value = value;
				dispatchEvent(targetInput, 'input');
				dispatchEvent(targetInput, 'change');
				// dispatchEvent(targetInput, 'keydown'); // Removed this generic keydown
				await wait(delay);

				const enterEventDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
				const enterEventPress = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
				const enterEventUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });

				registerLog(` Simulating "Enter" key press (1st time) for ${selector}.`);
				targetInput.dispatchEvent(enterEventDown);
				targetInput.dispatchEvent(enterEventPress);
				targetInput.dispatchEvent(enterEventUp);
				await wait(200);

				registerLog(` Simulating "Enter" key press (2nd time) for ${selector}.`);
				targetInput.dispatchEvent(enterEventDown);
				targetInput.dispatchEvent(enterEventPress);
				targetInput.dispatchEvent(enterEventUp);
				
				// Also trigger a change event on the original select if it exists
				if (el.tagName === 'SELECT') {
					dispatchEvent(el, 'change');
				}

				targetInput.blur();

				await wait(delay);

				let finalValue = '';
				if (el.tagName === 'SELECT') {
					// For comboboxes, the visible value is in the _input element
					const comboboxInput = document.querySelector(`#${el.id}_input`) as HTMLInputElement;
					if (comboboxInput) {
						finalValue = comboboxInput.value;
					} else {
						// Fallback for standard selects
						finalValue = (el as HTMLSelectElement).value;
					}
				} else {
					// For standard inputs
					finalValue = (el as HTMLInputElement).value;
				}

				if (finalValue.trim() !== '') {
					registerLog(` Success: ${selector} has a value "${finalValue}". Assuming success.`);
					printLogs();
					return; // Success, exit retry loop
				} else {
					throw new Error(`Failed to verify value for ${selector}. Field is empty.`);
				}
			} catch (error: any) {
				registerLog(` Attempt ${i + 1} failed for ${selector}: ${error.message}`);
				printLogs();
				if (i === retries - 1) {
					throw new Error(` All ${retries} attempts failed for selector: ${selector}`);
				}
				await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retrying
			}
		}
	}

	async function simulateAutocomplete(selector: string, value: string, delay = 500) {
		try {
			const el = document.querySelector(selector) as HTMLSelectElement;
			if (!el) {
				throw new Error(`Element not found for selector: ${selector}`);
			}

			registerLog(` Setting ${selector} directly with value "${value}"`);
			const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

			const dispatchEvent = (element: Element, eventName: string) => {
				element.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
			};

			// Get cached lookup table or build it (massive performance boost!)
			const options = el.querySelectorAll('option');
			const optionsHash = Array.from(options).map(opt => opt.value + ':' + opt.textContent).join('|');
			
			let cityLookup: Record<string, string>;
			const cached = selectCache.current.get(selector);
			
			if (cached && cached.optionsHash === optionsHash) {
				// Cache hit! Use existing lookup table
				cityLookup = cached.lookup;
				registerLog(` Using cached lookup table for ${selector} (${Object.keys(cityLookup).length} cities)`);
			} else {
				// Cache miss - build new lookup table
				cityLookup = {};
				registerLog(` Building new lookup table for ${selector} (${options.length} options)...`);
				
				for (let i = 0; i < options.length; i++) {
					const option = options[i];
					const optionText = option.textContent?.trim().toUpperCase() || '';
					const optionValue = option.value;
					if (optionText && optionValue) {
						cityLookup[optionText] = optionValue;
					}
				}
				
				// Cache the result
				selectCache.current.set(selector, {
					lookup: cityLookup,
					optionsHash: optionsHash
				});
				registerLog(` Cached lookup table with ${Object.keys(cityLookup).length} cities`);
			}

			// Normalize the city name to uppercase for lookup
			const normalizedValue = value.trim().toUpperCase();
			// Fast lookup - try exact match first
			let optionValue = cityLookup[normalizedValue];
			let matchedCity = normalizedValue;

			// If no exact match, try optimized partial matching
			if (!optionValue) {
				// Fast partial matching - pre-extract keys to avoid repeated Object.keys calls
				const cityNames = Object.keys(cityLookup);
				
				// Try substring matches (most common case) - optimized loop
				for (let i = 0; i < cityNames.length; i++) {
					const cityName = cityNames[i];
					if (cityName.includes(normalizedValue)) {
						optionValue = cityLookup[cityName];
						matchedCity = cityName;
						break;
					}
				}
				
				// If still no match, try reverse contains (less common)
				if (!optionValue) {
					for (let i = 0; i < cityNames.length; i++) {
						const cityName = cityNames[i];
						if (normalizedValue.includes(cityName)) {
							optionValue = cityLookup[cityName];
							matchedCity = cityName;
							break;
						}
					}
				}
				
				if (optionValue) {
					registerLog(` Found match: "${normalizedValue}" → "${matchedCity}"`);
				}
			}

			if (!optionValue) {
				// Log available cities for debugging
				const availableCities = Object.keys(cityLookup).slice(0, 10).join(', ');
				registerLog(` Available cities (first 10): ${availableCities}...`);
				throw new Error(`City "${value}" not found in available options`);
			}

			// Set the select element value directly
			el.value = optionValue;
			dispatchEvent(el, 'change');

			// Also update the input field if it's a combobox
			const comboboxInputId = el.getAttribute('inputid') || `${el.id}_input`;
			const comboboxInput = document.querySelector(`#${comboboxInputId}`) as HTMLInputElement;
			if (comboboxInput) {
				comboboxInput.value = matchedCity;
				dispatchEvent(comboboxInput, 'input');
				dispatchEvent(comboboxInput, 'change');
			}

			await wait(delay);

			// Verify the selection
			const selectedOption = el.selectedOptions[0];
			if (selectedOption && selectedOption.value === optionValue) {
				registerLog(` Success: Set ${selector} to "${selectedOption.text}" (value: ${optionValue})`);
				printLogs();
			} else {
				throw new Error(`Failed to set value for ${selector}`);
			}

		} catch (error: any) {
			registerLog(` Failed to set ${selector}: ${error.message}`);
			printLogs();
			throw error;
		}
	}

	// Function to process all financing options and extract data
	async function processFinancingOptions(): Promise<any> {
		registerLog(' ##### processFinancingOptions() CALLED - FUNCTION IS EXECUTING #####');
		registerLog(` Current URL: ${window.location.href}`);
		registerLog(` Page title: ${document.title}`);
		
		try {
			registerLog(' ##### processFinancingOptions() CALLED - FUNCTION IS EXECUTING #####');
			
			// Wait for page to be fully loaded
			registerLog('⏳  Waiting 2 seconds for page to be fully loaded...');
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			// First, let's check if we're on the right page
			const passo3 = document.querySelector('#passo3');
			registerLog(` Found #passo3 element: ${!!passo3}`);
			
			if (!passo3) {
				console.error(' #passo3 not found - we might not be on the options page');
				return null;
			}
			
			// Use simple selector: just get all js-form-next links without filtering
			registerLog(' Searching for financing option links...');
			
			// Just select every js-form-next element (no filtering)
			const optionLinks = document.querySelectorAll('a.js-form-next');
			registerLog(` Found ${optionLinks.length} js-form-next links (no filtering applied)`);
			
			
			// Log each link for debugging
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
				
				// Skip "clique aqui" links
				if (optionName.toLowerCase().includes('clique aqui')) {
					registerLog(` Skipping "clique aqui" link: "${optionName}"`);
					continue;
				}

				registerLog(` ===== Processing option ${i + 1}/${optionLinks.length}: "${optionName}" =====`);
				
				try {
					// Execute the JS destruction script BEFORE clicking
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
					
					// More aggressive clicking approach
					registerLog(` Attempting to click link...`);
					
					// Try multiple click approaches
					let clickSuccess = false;
					
					// Approach 1: Direct click
					try {
						link.click();
						registerLog(` Direct click successful`);
						printLogs();
						clickSuccess = true;
					} catch (error) {
						registerLog(` Direct click failed: ${error}`);
					}
					
					// Approach 2: Execute the onclick directly if direct click failed
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
					
					// Approach 3: Dispatch click event
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
					await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time

					// Check what happened after clicking
					registerLog(` Analyzing page response...`);

					// Check for error messages first
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
							
							// Skip generic simulation disclaimers
							if (errorText.includes('os resultados obtidos representam apenas uma simulação') ||
								errorText.includes('caso tenha feito opção pelo crédito imobiliário')) {
								registerLog(` Skipping generic disclaimer error`);
								continue;
							}

							// If we found a relevant error (income insufficient, etc.)
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

					// If no error, look for results table
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

					// Go back to options page
					registerLog(` Going back to options page...`);
					printLogs();
					await goBackToOptionsPage();

				} catch (error: any) {
					registerLog(` Error processing option "${optionName}": ${error.message}`);
					printLogs();
					// Try to go back anyway
					await goBackToOptionsPage();
				}
			}

			lendingOptions.if = "caixa";
			return lendingOptions.result.length > 0 ? lendingOptions : null;

		} catch (error: any) {
			registerLog(` Failed to process financing options: ${error.message}`);
			printLogs();
			return null;
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
						// Map keys to our structure
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
			const backSelectors = [
				'button[onclick*="voltarTelaEnquadrar"]',
				'#botaoVoltar',
				'button.js-form-prev',
				'a[onclick*="voltarTelaEnquadrar"]'
			];

			for (const selector of backSelectors) {
				const backButton = document.querySelector(selector);
				if (backButton) {
					registerLog(` Clicking back button: ${selector}`);
					(backButton as HTMLElement).click();
					registerLog(` Back navigation successful`);
					printLogs();
					await new Promise(resolve => setTimeout(resolve, 1000));
					return;
				}
			}

			registerLog(` No back button found, trying browser back`);
			window.history.back();
			await new Promise(resolve => setTimeout(resolve, 1000));

		} catch (error: any) {
			registerLog(` Error going back: ${error.message}`);
			printLogs();
		}
	}
	
	React.useEffect(() => {
		if (!isCaixaPage) {
			registerLog(' Not on caixa.gov.br, skipping automation');
			return;
		}
		
		// Detect which page we're on and run appropriate step
		const currentUrl = window.location.href;
		const hasFirstPageElements = document.querySelector('#valorImovel');
		const hasSecondPageElements = document.querySelector('#dataNascimento');
		const hasOptionsPageElements = document.querySelector('#passo3');
		
		registerLog(` Page detection - URL: ${currentUrl}`);
		registerLog(` First page elements: ${!!hasFirstPageElements}`);
		registerLog(` Second page elements: ${!!hasSecondPageElements}`);
		registerLog(` Options page elements: ${!!hasOptionsPageElements}`);
		
		// Determine what step to run based on page content
		if (hasFirstPageElements && !hasSecondPageElements && !hasOptionsPageElements) {
			registerLog(' Detected: First page - running step 1');
			runFirstPageAutomation();
		} else if (hasSecondPageElements && !hasOptionsPageElements) {
			registerLog(' Detected: Second page - running step 2');  
			runSecondPageAutomation();
		} else if (hasOptionsPageElements) {
			registerLog(' Detected: Options page - running step 3');
			runOptionsPageAutomation();
		} else {
			registerLog(' Detected: Unknown page or results page - waiting');
			// This could be a results page or transition page, just wait
		}
		
	}, [isCaixaPage, JSON.stringify(fields)]);

	// Individual automation functions for each page
	const runFirstPageAutomation = async () => {
		try {
			registerLog(' Starting first page automation...');
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			const firstPageKeyElement = await waitForElement('#valorImovel');
			if (!firstPageKeyElement) {
				registerLog(' First page form not ready yet.');
				return;
			}
			
			registerLog(' First page ready. Filling fields.');
			printLogs();
			await fillFirstPage(fields);
			
			const nextButton1 = await waitForElement('#btn_next1'); 
			if (!nextButton1) {
				registerLog(' Next button not found on first page.');
				return;
			}
			registerLog(' Clicking "Próxima etapa".');
			(nextButton1 as HTMLElement).click();
		} catch (error: any) {
			registerLog(` First page automation error: ${error.message}`);
			printLogs();
		}
	};

	const runSecondPageAutomation = async () => {
		try {
			registerLog(' Starting second page automation...');
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			const secondPageKeyElement = await waitForElement('#dataNascimento');
			if (!secondPageKeyElement) {
				registerLog(' Second page form not ready yet.');
				return;
			}
			
			registerLog(' Second page ready. Filling fields.');
			printLogs();
			await fillSecondPage(fields);
			
			const nextButton2 = await waitForElement('#btn_next2');
			if (!nextButton2) {
				registerLog(' Next button not found on second page.');
				return;
			}
			registerLog(' Clicking "Próxima etapa" to go to options.');
			(nextButton2 as HTMLElement).click();
		} catch (error: any) {
			registerLog(` Second page automation error: ${error.message}`);
			printLogs();
		}
	};

	const runOptionsPageAutomation = async () => {
		try {
			registerLog(' Starting options page automation...');
			registerLog('🎯 ========== PROCESSING FINANCING OPTIONS ==========');
			printLogs();
			
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			const optionsResult = await processFinancingOptions();
			registerLog('✅ processFinancingOptions() completed');
			
			if (optionsResult) {
				registerLog(`🎉 Successfully processed ${optionsResult.result?.length || 0} financing options`);
				registerLog(`📊 Financing Options Result: ${JSON.stringify(optionsResult, null, 2)}`);
			} else {
				registerLog('❌ No financing options found or processing failed');
			}
			printLogs();
		} catch (error: any) {
			registerLog(` Options page automation error: ${error.message}`);
			printLogs();
		}
	};
	
	const capitalizeWords = (str: string) => {
		if (!str) return '';
		return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
	};

	async function fillFirstPage(fields: Record<string, any>) {
		registerLog(' Filling first page...');
		registerLog(' Clicking radio button for PF...');

		// Select person type (always Física)
		registerLog(' Selecting person type: Física');
		const selector = '#pessoaF';
		const el = document.querySelector(selector) as HTMLInputElement;
		if (el) {
			el.click();
			await new Promise(resolve => setTimeout(resolve, 1500)); // Longer wait
		} else {
			registerLog(` Person type radio button not found: ${selector}`);
		}

		if (fields.tipo_imovel) {
			registerLog(` Filling #tipoImovel with category: ${fields.tipo_imovel}`);
			await simulateNaturalInput('#tipoImovel', capitalizeWords(fields.tipo_imovel));
		}

		registerLog(' Waiting for #grupoTipoFinanciamento to become enabled...');
		await waitForElementEnabled('#grupoTipoFinanciamento_input');

		if (fields.categoria_imovel) {
			registerLog(` Filling #grupoTipoFinanciamento with specific type: ${fields.categoria_imovel}`);
			await simulateNaturalInput('#grupoTipoFinanciamento_input', capitalizeWords(fields.categoria_imovel));
		}

		// Fill valor_imovel
		if (fields.valor_imovel) {
			await simulateNaturalInput('#valorImovel', fields.valor_imovel);
		}

		// Fill UF
		if (fields.uf) {
			await simulateNaturalInput('#uf', fields.uf.toUpperCase());
		}

		// Fill cidade
		if (fields.cidade) {
			// This also depends on the UF selection.
			await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5s for dependent dropdown to populate
			registerLog(` Filling cidade: ${fields.cidade}`);
			await simulateAutocomplete('#cidade', fields.cidade.toUpperCase());
		}

		// Fill possui_imovel checkbox
		if (fields.possui_imovel === 'sim') {
			registerLog(' Checking possui_imovel');
			const checkbox = document.querySelector('#imovelCidade') as HTMLInputElement;
			if (checkbox && !checkbox.checked) {
				checkbox.click();
				await new Promise(resolve => setTimeout(resolve, 1500)); // Longer wait
			} else {
				registerLog(' imovelCidade checkbox not found or already checked');
			}
		}
		registerLog(' Finished filling first page.');
	}
	
	async function fillSecondPage(fields: Record<string, any>) {
		registerLog(' Filling second page...');
		
		// Fill data_nascimento
		if (fields.data_nascimento) {
			await simulateNaturalInput('#dataNascimento', fields.data_nascimento);
		}
		
		// Fill renda_familiar
		if (fields.renda_familiar) {
			await simulateNaturalInput('#rendaFamiliarBruta', fields.renda_familiar);
		}
		
		// Fill beneficiado_fgts checkbox
		if (fields.beneficiado_fgts === 'sim') {
			registerLog(' Checking beneficiado_fgts');
			const checkbox = document.querySelector('#vaContaFgtsS') as HTMLInputElement;
			if (checkbox && !checkbox.checked) {
				checkbox.click();
				await new Promise(resolve => setTimeout(resolve, 1500)); // Longer wait
			} else {
				registerLog(' vaContaFgtsS checkbox not found or already checked');
			}
		}
		registerLog(' Finished filling second page.');
	}
	
	return (
		<div className="caixa-navigator">
			<h2>Caixa Automation Running...</h2>
			<p>Check the logs in the extension popup.</p>
		</div>
	);
};

registerLog('[caixaNavigation.js] Script loaded. Starting auto-mount...');

(function() {
	async function main() {
		try {
			const data = (window as any).__CAIXA_AUTO_MOUNT_DATA;
			if (data) {
				registerLog('[caixaNavigation.js] Auto-mounting with pre-seeded data.');
				printLogs();
				
				const container = document.createElement('div');
				container.id = 'caixa-navigator-root';
				container.style.position = 'fixed';
				container.style.top = '10px';
				container.style.right = '10px';
				container.style.zIndex = '9999';
				container.style.backgroundColor = 'white';
				container.style.border = '1px solid black';
				container.style.padding = '10px';
				document.body.appendChild(container);
				
				const root = createRoot(container);
				root.render(React.createElement(CaixaNavigator, { data }));

			} else {
				registerLog('[caixaNavigation.js] No pre-seeded data found.');
			}
		} catch (e: any) {
			// Use both logging methods for maximum visibility on errors
			console.error(`[caixaNavigation.js] Auto-mount failed: ${e.message}`, e);
			registerLog(`[caixaNavigation.js] Auto-mount failed: ${e.message}`);
			printLogs();
		}
	}

	main();
})();
