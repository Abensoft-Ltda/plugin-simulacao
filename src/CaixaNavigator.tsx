import React from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import { SimulationOverlay } from './SimulationOverlay';

declare global {
  interface Window {
    jQuery?: any;
  }
}

let logs: string[] = [];

function registerLog(message: string) {
	const timestampedMessage = `${message} -- [${new Date().toLocaleTimeString()}]`;
	logs.push(timestampedMessage);
}

function printLogs() {
	console.clear();
	logs.forEach(msg => console.log(msg));
}

export const CaixaNavigator: React.FC<{ data: Record<string, any> }> = ({ data }) => {

	// Cache for select lookup tables
	const selectCache = React.useRef<Map<string, {
		lookup: Record<string, string>;
		optionsHash: string;
	}>>(new Map());

	registerLog(` Received data: ${JSON.stringify(data)}`);
	const isCaixaPage = typeof window !== 'undefined' && /\.caixa\.gov\.br$/.test(window.location.hostname);

	const fields = data.fields;
	registerLog(` Using fields: ${JSON.stringify(fields)}`);

	// Utility to wait for a key element before filling
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

	// Check for error dialog and refresh if found
	function checkForErrorDialog(): boolean {
		// Check for the specific error dialog
		const errorDialog = document.querySelector('#ui-id-34.ui-dialog-content.ui-widget-content');
		
		if (errorDialog) {
			const errorText = errorDialog.textContent?.trim();
			registerLog(`Found error dialog #ui-id-34 with text: "${errorText}"`);
			
			// Check if it contains the specific error message
			if (errorText?.includes('Campo obrigatório não informado')) {
				registerLog('Error dialog contains "Campo obrigatório não informado" - refreshing page');
				window.location.reload();
				return true;
			}
		}
		
		// Also check for any dialog with the specific text (in case ID changes)
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
	
	// Instant value setter for all input types
	async function setInstantValue(selector: string, value: string, isSelect = false) {
		const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
		if (!el) {
			registerLog(` Element not found: ${selector}`);
			return;
		}
		
		registerLog(` Setting ${selector} instantly to: "${value}"`);
		
		if (isSelect) {
			// For select elements, find the option and set it
			const select = el as HTMLSelectElement;
			const option = Array.from(select.options).find(opt => 
				opt.text.toLowerCase().includes(value.toLowerCase()) || 
				opt.value.toLowerCase().includes(value.toLowerCase())
			);
			if (option) {
				select.value = option.value;
				registerLog(` Selected option: "${option.text}" (value: ${option.value})`);
			}
		} else {
			// For regular inputs
			el.value = value;
		}
		
		el.dispatchEvent(new Event('change', { bubbles: true }));
		el.dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise(resolve => setTimeout(resolve, 100)); // Minimal delay
	}
	
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
					// Para comboboxes, o valor visível está no elemento _input
					const comboboxInput = document.querySelector(`#${el.id}_input`) as HTMLInputElement;
					if (comboboxInput) {
						finalValue = comboboxInput.value;
					} else {
						// Fallback para selects padrão
						finalValue = (el as HTMLSelectElement).value;
					}
				} else {
					// Para inputs padrão
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

	// Função para processar todas as opções de financiamento e extrair dados agora está em CaixaNavigatorSecondStep.tsx

	React.useEffect(() => {
		if (!isCaixaPage) {
			registerLog(' Not on caixa.gov.br, skipping automation');
			return;
		}
		
		// Start periodic error dialog monitoring
		const errorCheckInterval = setInterval(() => {
			checkForErrorDialog();
		}, 1000); // Check every second
		
		registerLog(' useEffect triggered for automation.');
		
		const runAutomation = async () => {
			registerLog(' Starting automation sequence.');
			
			// Initial error check
			if (checkForErrorDialog()) {
				registerLog(' Error dialog detected during initial check - page will refresh');
				return;
			}
			
			// --- Aguardar página estar pronta ---
			registerLog(' Waiting 2 seconds for page to fully load...');
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			// Check for error dialog after page load
			if (checkForErrorDialog()) {
				registerLog(' Error dialog detected after page load - page will refresh');
				return;
			}
			
			// --- Etapa 1: Preencher a primeira página ---
			registerLog(' Waiting for the first form to be ready...');
			const firstPageKeyElement = await waitForElement('#valorImovel');
			if (!firstPageKeyElement) {
				registerLog(' Automation failed: First page form did not load.');
				return;
			}
			registerLog(' First page ready. Filling fields.');
			printLogs();
			await fillFirstPage(fields);
			
			// Check for error dialog after filling first page
			if (checkForErrorDialog()) {
				registerLog(' Error dialog detected after filling first page - page will refresh');
				return;
			}
			
			const nextButton1 = await waitForElement('#btn_next1'); 
			if (!nextButton1) {
				registerLog(' Automation failed: "Next" button not found on first page.');
				return;
			}
			registerLog(' Clicking "Próxima etapa".');
			(nextButton1 as HTMLElement).click();
			await new Promise(resolve => setTimeout(resolve, 2000)); // Espera maior após o clique

			// Check for error dialog after clicking next button
			if (checkForErrorDialog()) {
				registerLog(' Error dialog detected after clicking next button - page will refresh');
				return;
			}

			// --- Etapa 3: Preencher a segunda página ---
			registerLog(' Waiting for the second form to be ready...');
			const secondPageKeyElement = await waitForElement('#dataNascimento'); // Um campo na segunda página
			if (!secondPageKeyElement) {
				registerLog(' Automation failed: Second page form did not load.');
				return;
			}
			registerLog(' Second page ready. Filling fields.');
			printLogs();
			await fillSecondPage(fields);
			
			// Check for error dialog after filling second page
			if (checkForErrorDialog()) {
				registerLog(' Error dialog detected after filling second page - page will refresh');
				return;
			}
			
			const nextButton2 = await waitForElement('#btn_next2'); // ID atualizado do HTML
			if (!nextButton2) {
				registerLog(' Automation failed: "Next" button not found on second page.');
				return;
			}
			registerLog(' Clicking "Próxima etapa" to go to options.');
			(nextButton2 as HTMLElement).click();
			
			registerLog(' Automation sequence for first part completed. Second part will be handled by CaixaNavigatorSecondStep.tsx');
			printLogs();
		};
		
		runAutomation().catch(err => {
			registerLog(` A critical error stopped the automation: ${err}`);
			printLogs();
		});
		
		// Cleanup interval on unmount
		return () => {
			clearInterval(errorCheckInterval);
		};
		
	}, [isCaixaPage, JSON.stringify(fields)]);
	
	const capitalizeWords = (str: string) => {
		if (!str) return '';
		return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
	};

	async function fillFirstPage(fields: Record<string, any>) {
		registerLog(' Filling first page...');
		registerLog(' Clicking radio button for PF...');

		// Selecionar tipo de pessoa (sempre Física)
		registerLog(' Selecting person type: Física');
		const selector = '#pessoaF';
		const el = document.querySelector(selector) as HTMLInputElement;
		if (el) {
			el.click();
			await new Promise(resolve => setTimeout(resolve, 1500)); // Espera maior
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

		// Preencher valor_imovel
		if (fields.valor_imovel) {
			await simulateNaturalInput('#valorImovel', fields.valor_imovel);
		}

		// Preencher UF
		if (fields.uf) {
			await simulateNaturalInput('#uf', fields.uf.toUpperCase());
		}

		// Preencher cidade
		if (fields.cidade) {
			// Isso também depende da seleção de UF.
			await new Promise(resolve => setTimeout(resolve, 1500)); // Aguardar 1.5s para o dropdown dependente ser populado
			registerLog(` Filling cidade: ${fields.cidade}`);
			await simulateAutocomplete('#cidade', fields.cidade.toUpperCase());
		}

		// Preencher checkbox possui_imovel
		if (fields.possui_imovel === 'sim') {
			registerLog(' Checking possui_imovel');
			const checkbox = document.querySelector('#imovelCidade') as HTMLInputElement;
			if (checkbox && !checkbox.checked) {
				checkbox.click();
				await new Promise(resolve => setTimeout(resolve, 1500)); // Espera maior
			} else {
				registerLog(' imovelCidade checkbox not found or already checked');
			}
		}
		registerLog(' Finished filling first page.');
	}
	
	async function fillSecondPage(fields: Record<string, any>) {
		registerLog(' Filling second page...');
		
		// Preencher data_nascimento
		if (fields.data_nascimento) {
			await setInstantValue('#dataNascimento', fields.data_nascimento);
		}
		
		// Preencher renda_familiar
		if (fields.renda_familiar) {
			await simulateNaturalInput('#rendaFamiliarBruta', fields.renda_familiar);
		}
		
		// Preencher checkbox beneficiado_fgts
		if (fields.beneficiado_fgts === 'sim') {
			registerLog(' Checking beneficiado_fgts');
			const checkbox = document.querySelector('#vaContaFgtsS') as HTMLInputElement;
			if (checkbox && !checkbox.checked) {
				checkbox.click();
				await new Promise(resolve => setTimeout(resolve, 1500)); // Espera maior
			} else {
				registerLog(' vaContaFgtsS checkbox not found or already checked');
			}
		}
		registerLog(' Finished filling second page.');
	}
	
	return (
		<SimulationOverlay
			title="Simulação Caixa"
			subtitle="Preenchendo formulário automaticamente"
			bankName="Caixa Econômica Federal"
			bankIcon="ibb-caixa"
		>
			<div className="caixa-navigator">
				<h2>Caixa Automation Running...</h2>
				<p>Check the logs in the extension popup.</p>
			</div>
		</SimulationOverlay>
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
				
			document.getElementById('caixa-navigator-host')?.remove();

			const host = document.createElement('div');
			host.id = 'caixa-navigator-host';
			document.body.appendChild(host);
			// Necessário para impedir que o CSS da página substitua o CSS da simulação
			const shadowRoot = host.attachShadow({ mode: 'open' });
			const styleLink = document.createElement('link');
			styleLink.rel = 'stylesheet';
			const appCssHref = typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('App.css') : 'App.css';
			styleLink.href = appCssHref;
			shadowRoot.appendChild(styleLink);

				const container = document.createElement('div');
				container.id = 'caixa-navigator-root';
				shadowRoot.appendChild(container);
				
				const root = createRoot(container);
				root.render(React.createElement(CaixaNavigator, { data }));

			} else {
				registerLog('[caixaNavigation.js] No pre-seeded data found.');
			}
		} catch (e: any) {
			console.error(`[caixaNavigation.js] Auto-mount failed: ${e.message}`, e);
			registerLog(`[caixaNavigation.js] Auto-mount failed: ${e.message}`);
			printLogs();
		}
	}

	main();
})();
