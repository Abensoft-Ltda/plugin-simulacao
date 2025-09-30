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

	// Function to process all financing options and extract data is now in CaixaNavigatorSecondStep.tsx
	
	
	React.useEffect(() => {
		if (!isCaixaPage) {
			registerLog(' Not on caixa.gov.br, skipping automation');
			return;
		}
		registerLog(' useEffect triggered for automation.');
		
		const runAutomation = async () => {
			registerLog(' Starting automation sequence.');
			
			// --- Wait for page to be ready ---
			registerLog(' Waiting 2 seconds for page to fully load...');
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			// --- Step 1: Fill the first page ---
			registerLog(' Waiting for the first form to be ready...');
			const firstPageKeyElement = await waitForElement('#valorImovel');
			if (!firstPageKeyElement) {
				registerLog(' Automation failed: First page form did not load.');
				return;
			}
			registerLog(' First page ready. Filling fields.');
			printLogs();
			await fillFirstPage(fields);
			
			const nextButton1 = await waitForElement('#btn_next1'); 
			if (!nextButton1) {
				registerLog(' Automation failed: "Next" button not found on first page.');
				return;
			}
			registerLog(' Clicking "Próxima etapa".');
			(nextButton1 as HTMLElement).click();
			await new Promise(resolve => setTimeout(resolve, 2000)); // Longer wait after click
			
			// --- Step 3: Fill the second page ---
			registerLog(' Waiting for the second form to be ready...');
			const secondPageKeyElement = await waitForElement('#dataNascimento'); // A field on the second page
			if (!secondPageKeyElement) {
				registerLog(' Automation failed: Second page form did not load.');
				return;
			}
			registerLog(' Second page ready. Filling fields.');
			printLogs();
			await fillSecondPage(fields);
			
			const nextButton2 = await waitForElement('#btn_next2'); // Updated ID from HTML
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
		
	}, [isCaixaPage, JSON.stringify(fields)]);
	
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
