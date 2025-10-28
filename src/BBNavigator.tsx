import React from 'react';
import './App.css';
import { SimulationOverlay } from './SimulationOverlay';
import { SimulationPayload } from './lib/SimulationPayload';
import { autoMountNavigator } from './lib/autoMountNavigator';
import { BankMessenger } from './lib/BankMessenger';
import { MAX_AUTOMATION_ATTEMPTS } from './lib/constants';

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function maskCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatCurrencyFromCents(value: string): string {
  const numeric = Number(value) / 100;
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function capitalizeWords(str: string): string {
  if (!str) return '';
  return str
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const BBNavigator: React.FC<{ data: Record<string, any> }> = ({ data }) => {

  // Cache for select lookup tables
  const selectCache = React.useRef<Map<string, {
    lookup: Record<string, string>;
    optionsHash: string;
  }>>(new Map());
  const hasSentResultsRef = React.useRef(false);

  registerLog(` Received data: ${JSON.stringify(data)}`);
  const isBBPage = typeof window !== 'undefined' && /bb.com.br$/.test(window.location.hostname);

  const fields = data.fields;
  registerLog(` Using fields: ${JSON.stringify(fields)}`);
  const [isComplete, setIsComplete] = React.useState(false);

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
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) {
          const isDisabled = (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true';
          const hasDisabledClass = el.classList.contains('bb-field-disabled') || el.classList.contains('disabled');
          if (!isDisabled && !hasDisabledClass) return resolve(el);
        }
        if (Date.now() - start > timeout) return resolve(null);
        setTimeout(check, 200);
      }
      check();
    });
  }

  function checkForErrorDialog(): boolean {
    // Banco do Brasil likely shows inline validation messages; keep generic checks
    const dialogs = document.querySelectorAll('.validation-message, .toast, .bb-alert');
    for (const dialog of dialogs) {
      const text = dialog.textContent?.trim();
      if (text && /obrigatório|inválido|erro/i.test(text)) {
        registerLog(`Found possible error dialog with text: "${text}"`);
        // don't reload automatically for BB, just log
        return true;
      }
    }
    return false;
  }


  async function setInstantValue(selector: string, value: string, isSelect = false): Promise<boolean> {
    const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
    if (!el) {
      registerLog(` Element not found: ${selector}`);
      printLogs();
      return false;
    }
    registerLog(` Setting ${selector} instantly to: "${value}"`);
    if (isSelect) {
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
      el.value = value;
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));

    const finalValue = isSelect
      ? (el as HTMLSelectElement).value
      : (el as HTMLInputElement).value;

    if (finalValue && finalValue.trim() !== '') {
      registerLog(` Success: ${selector} now has value "${finalValue}".`);
      printLogs();
      return true;
    }

    registerLog(` Warning: ${selector} is still empty after attempting to set it to "${value}".`);
    printLogs();
    return false;
  }

  interface SimulateInputOptions {
    typePerChar?: boolean;
    clearExisting?: boolean;
    perCharDelay?: number;
    finalValueCheck?: (finalValue: string) => boolean;
  }

  async function simulateNaturalInput(
    selector: string,
    value: string,
    delay = 500,
    retries = MAX_AUTOMATION_ATTEMPTS,
    options: SimulateInputOptions = {}
  ): Promise<boolean> {
    const { typePerChar = false, clearExisting = true, perCharDelay = 60, finalValueCheck } = options;
    for (let i = 0; i < retries; i++) {
      try {
        const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
        if (!el) throw new Error(`Element not found for selector: ${selector}`);
        registerLog(` Simulating input for ${selector} with value "${value}" (Attempt ${i + 1})`);
        const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        const dispatchEvent = (element: Element, eventName: string) => {
          element.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
        };
        let targetInput = el as HTMLInputElement;
        if (el.tagName === 'SELECT') {
          const comboboxInput = document.querySelector(`#${el.id}_input`) as HTMLInputElement;
          if (comboboxInput) targetInput = comboboxInput;
        }
        targetInput.click();
        targetInput.focus();

        if (typePerChar) {
          if (clearExisting) {
            targetInput.value = '';
            const clearEvent = typeof InputEvent === 'function'
              ? new InputEvent('input', { bubbles: true, cancelable: true, data: '', inputType: 'deleteContentBackward' })
              : new Event('input', { bubbles: true, cancelable: true });
            targetInput.dispatchEvent(clearEvent);
            await wait(30);
          }
          for (const char of value) {
            const keyDown = new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true });
            targetInput.dispatchEvent(keyDown);
            targetInput.value = `${targetInput.value}${char}`;
            const inputEvent = typeof InputEvent === 'function'
              ? new InputEvent('input', { bubbles: true, cancelable: true, data: char, inputType: 'insertText' })
              : new Event('input', { bubbles: true, cancelable: true });
            targetInput.dispatchEvent(inputEvent);
            const keyUp = new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true });
            targetInput.dispatchEvent(keyUp);
            await wait(perCharDelay);
          }
          dispatchEvent(targetInput, 'change');
        } else {
          targetInput.value = value;
          dispatchEvent(targetInput, 'input');
          dispatchEvent(targetInput, 'change');
        }

        await wait(delay);
        const enterEventDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
        const enterEventPress = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
        const enterEventUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
        targetInput.dispatchEvent(enterEventDown);
        targetInput.dispatchEvent(enterEventPress);
        targetInput.dispatchEvent(enterEventUp);
        await wait(200);
        targetInput.dispatchEvent(enterEventDown);
        targetInput.dispatchEvent(enterEventPress);
        targetInput.dispatchEvent(enterEventUp);
        if (el.tagName === 'SELECT') dispatchEvent(el, 'change');
        targetInput.blur();
        await wait(delay);
        let finalValue = '';
        if (el.tagName === 'SELECT') {
          const comboboxInput = document.querySelector(`#${el.id}_input`) as HTMLInputElement;
          finalValue = comboboxInput ? comboboxInput.value : (el as HTMLSelectElement).value;
        } else {
          finalValue = (el as HTMLInputElement).value;
        }
        const success = finalValueCheck ? finalValueCheck(finalValue) : finalValue.trim() !== '';

        if (success) {
          registerLog(` Success: ${selector} has a value "${finalValue}". Assuming success.`);
          printLogs();
          return true;
        } else {
          throw new Error(`Failed to verify value for ${selector}. Field is empty.`);
        }
      } catch (error: any) {
        registerLog(` Attempt ${i + 1} failed for ${selector}: ${error.message}`);
        printLogs();
        if (i === retries - 1) {
          registerLog(` All ${retries} attempts failed for selector: ${selector}`);
          printLogs();
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return false;
  }

  async function simulateAutocomplete(selector: string, value: string, delay = 500) {
    try {
      const el = document.querySelector(selector) as HTMLSelectElement;
      if (!el) throw new Error(`Element not found for selector: ${selector}`);
      registerLog(` Setting ${selector} directly with value "${value}"`);
      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      const dispatchEvent = (element: Element, eventName: string) => {
        element.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
      };
      const options = el.querySelectorAll('option');
      const optionsHash = Array.from(options).map(opt => opt.value + ':' + opt.textContent).join('|');
      let lookup: Record<string, string>;
      const cached = selectCache.current.get(selector);
      if (cached && cached.optionsHash === optionsHash) {
        lookup = cached.lookup;
        registerLog(` Using cached lookup table for ${selector} (${Object.keys(lookup).length} options)`);
      } else {
        lookup = {};
        for (let i = 0; i < options.length; i++) {
          const option = options[i];
          const optionText = option.textContent?.trim().toUpperCase() || '';
          const optionValue = option.value;
          if (optionText && optionValue) lookup[optionText] = optionValue;
        }
        selectCache.current.set(selector, { lookup, optionsHash });
        registerLog(` Cached lookup table with ${Object.keys(lookup).length} options`);
      }
      const normalizedValue = value.trim().toUpperCase();
      let optionValue = lookup[normalizedValue];
      let matched = normalizedValue;
      if (!optionValue) {
        const keys = Object.keys(lookup);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (k.includes(normalizedValue)) { optionValue = lookup[k]; matched = k; break; }
        }
        if (!optionValue) {
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (normalizedValue.includes(k)) { optionValue = lookup[k]; matched = k; break; }
          }
        }
        if (optionValue) registerLog(` Found match: "${normalizedValue}" → "${matched}"`);
      }
      if (!optionValue) {
        const available = Object.keys(lookup).slice(0, 10).join(', ');
        registerLog(` Available options (first 10): ${available}...`);
        throw new Error(`Value "${value}" not found in options`);
      }
      el.value = optionValue;
      dispatchEvent(el, 'change');
      const comboboxInputId = el.getAttribute('inputid') || `${el.id}_input`;
      const comboboxInput = document.querySelector(`#${comboboxInputId}`) as HTMLInputElement;
      if (comboboxInput) {
        comboboxInput.value = matched;
        dispatchEvent(comboboxInput, 'input');
        dispatchEvent(comboboxInput, 'change');
      }
      await wait(delay);
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

  async function withSelectors(selectors: string[], handler: (selector: string) => Promise<boolean>, logLabel: string): Promise<boolean> {
    for (const selector of selectors) {
      const existing = document.querySelector(selector);
      if (existing) {
        try {
          const success = await handler(selector);
          if (success) return true;
          registerLog(` Handler reported failure for ${logLabel} using selector "${selector}". Trying alternatives...`);
          printLogs();
        } catch (error: any) {
          registerLog(` Error while handling ${logLabel} with selector "${selector}": ${error.message || error}`);
          printLogs();
        }
      }
    }

    for (const selector of selectors) {
      const found = await waitForElement(selector, 3000);
      if (found) {
        try {
          const success = await handler(selector);
          if (success) return true;
          registerLog(` Handler reported failure for ${logLabel} using selector "${selector}" after waiting. Trying next option...`);
          printLogs();
        } catch (error: any) {
          registerLog(` Error while handling ${logLabel} with selector "${selector}" after waiting: ${error.message || error}`);
          printLogs();
        }
      }
    }

    registerLog(` Failed to resolve element for ${logLabel}. Tried selectors: ${selectors.join(', ')}`);
    printLogs();
    return false;
  }

  async function selectFromDropdown(controlName: string, value: string): Promise<boolean> {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) {
      registerLog(` Skipping dropdown ${controlName}: empty value`);
      printLogs();
      return false;
    }

    const uppercaseControl = controlName.toUpperCase();
    const selectButtonSelectors = [
      `bb-select-field[formcontrolname="${controlName}"] .selectButton`,
      `#select-${controlName} .selectButton`,
      `button[aria-label="${uppercaseControl}"]`,
      `button[aria-labelledby*="${controlName}"]`,
      `button[aria-describedby*="${controlName}"]`,
    ];

    let button: HTMLElement | null = null;
    for (const selector of selectButtonSelectors) {
      const enabled = await waitForElementEnabled(selector, 8000);
      if (enabled) {
        button = enabled as HTMLElement;
        break;
      }
    }

    if (!button) {
      registerLog(` Dropdown button not found or enabled for control "${controlName}"`);
      printLogs();
      return false;
    }

    const fieldRoot = button.closest('bb-select-field') as HTMLElement | null;
    const hiddenInput = fieldRoot?.querySelector('input[formcontrolname], input[type="hidden"]') as HTMLInputElement | null;
    const fieldInput = fieldRoot?.querySelector('input[bbselectinput], input[type="text"], input[role="combobox"], input[aria-autocomplete]') as HTMLInputElement | null;
    const shouldUseSearchInput = Boolean(fieldInput && (controlName === 'municipio' || fieldInput.hasAttribute('aria-autocomplete')));

    const displayValue = controlName === 'uf'
      ? value.toUpperCase()
      : capitalizeWords(value);
    const normalizedDisplayValue = normalizeText(displayValue);
    const candidateTexts = Array.from(new Set([normalizedValue, normalizedDisplayValue].filter(Boolean))) as string[];

    const typeIntoInput = async (input: HTMLInputElement, text: string) => {
      const chars = text.split('');
      input.focus();
      input.value = '';
      const clearEvent = typeof InputEvent === 'function'
        ? new InputEvent('input', { bubbles: true, cancelable: true, data: '', inputType: 'deleteContentBackward' })
        : new Event('input', { bubbles: true, cancelable: true });
      input.dispatchEvent(clearEvent);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await delay(40);

      for (const char of chars) {
        const keydown = new KeyboardEvent('keydown', { key: char, code: char, keyCode: char.charCodeAt(0), which: char.charCodeAt(0), bubbles: true, cancelable: true });
        input.dispatchEvent(keydown);
        const keypress = new KeyboardEvent('keypress', { key: char, code: char, keyCode: char.charCodeAt(0), which: char.charCodeAt(0), bubbles: true, cancelable: true });
        input.dispatchEvent(keypress);
        input.value = `${input.value}${char}`;
        const inputEvent = typeof InputEvent === 'function'
          ? new InputEvent('input', { bubbles: true, cancelable: true, data: char, inputType: 'insertText' })
          : new Event('input', { bubbles: true, cancelable: true });
        input.dispatchEvent(inputEvent);
        const keyup = new KeyboardEvent('keyup', { key: char, code: char, keyCode: char.charCodeAt(0), which: char.charCodeAt(0), bubbles: true, cancelable: true });
        input.dispatchEvent(keyup);
        await delay(45);
      }

      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const ensureHiddenInputValue = () => {
      if (!hiddenInput) return;
      hiddenInput.value = displayValue;
      hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const isElementVisible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      if (Number(style.opacity) === 0) return false;
      return true;
    };

    const optionSelectors = [
      '[role="option"]',
      '.MuiAutocomplete-option',
      '.MuiMenuItem-root',
      '.bb-option',
      '.bb-option button',
      '.mat-option',
      '.mat-option-text',
      '.select-item',
      'li[role="menuitem"]',
      'li[role="option"]',
      'li.menu-item',
      'button[role="menuitem"]',
      'button[role="option"]',
      'a[role="menuitem"]',
      'a[role="option"]',
      'bb-select-option',
      'bb-option-item',
      '[data-option-value]',
      '[data-value]',
    ];

    const containerSelectors = [
      '[role="listbox"]',
      '[role="menu"]',
      '.MuiAutocomplete-listbox',
      '.MuiAutocomplete-paper',
      '.MuiPaper-root',
      '.bb-dropdown-panel',
      '.bb-select-panel',
      '.bb-menu',
      '.selectMenu',
      '.dropdown-menu',
      '.mat-select-panel',
      '.mat-autocomplete-panel',
      '.cdk-overlay-pane',
    ];

    const gatherOptions = (scope?: Document | Element): HTMLElement[] => {
      const searchRoot = scope ?? document;
      const found = new Set<HTMLElement>();
      for (const selector of optionSelectors) {
        const nodes = Array.from(searchRoot.querySelectorAll(selector));
        for (const node of nodes) {
          if (node instanceof HTMLElement && isElementVisible(node)) {
            found.add(node);
          }
        }
      }
      return Array.from(found);
    };

    const getOptionContainers = (): HTMLElement[] => {
      const containers = new Set<HTMLElement>();
      const referencedAttributes = [
        button.getAttribute('aria-controls'),
        button.getAttribute('aria-owns'),
        button.getAttribute('aria-labelledby'),
        button.getAttribute('aria-describedby'),
      ];

      for (const attr of referencedAttributes) {
        if (!attr) continue;
        const ids = attr.split(/\s+/);
        for (const id of ids) {
          const el = document.getElementById(id);
          if (el instanceof HTMLElement && isElementVisible(el)) {
            containers.add(el);
          }
        }
      }

      for (const selector of containerSelectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          if (node instanceof HTMLElement && isElementVisible(node)) {
            containers.add(node);
          }
        }
      }

      if (fieldRoot) containers.add(fieldRoot);

      return Array.from(containers);
    };

    const buttonRect = button.getBoundingClientRect();
    const waitForOptions = async (): Promise<HTMLElement[]> => {
      const timeout = Date.now() + 2500;
      while (Date.now() < timeout) {
        const containers = getOptionContainers();
        let closest: { distance: number; options: HTMLElement[] } | null = null;

        for (const container of containers) {
          const options = gatherOptions(container);
          if (!options.length) continue;
          const rect = container.getBoundingClientRect();
          const distance = Math.hypot(
            (rect.left + rect.width / 2) - (buttonRect.left + buttonRect.width / 2),
            (rect.top + rect.height / 2) - (buttonRect.top + buttonRect.height / 2),
          );
          if (!closest || distance < closest.distance) {
            closest = { distance, options };
          }
        }

        if (closest && closest.options.length) {
          return closest.options;
        }

        const fallback = gatherOptions();
        if (fallback.length) return fallback;

        await delay(120);
      }

      return gatherOptions();
    };

    const findMatchingOption = (options: HTMLElement[]): HTMLElement | null => {
      for (const option of options) {
        const optionText = normalizeText(option.textContent);
        if (!optionText) continue;
        const match = candidateTexts.some(text => optionText === text || optionText.includes(text));
        if (match) return option;
      }
      return null;
    };

    const readButtonDisplayedValue = () => {
      if (fieldRoot) {
        const displayNode = fieldRoot.querySelector('.select-text span, .bb-select-label, .bb-select-value') as HTMLElement | null;
        if (displayNode) return normalizeText(displayNode.textContent);
      }
      return normalizeText(button.textContent || '');
    };

    const isOverlayOpen = () => {
      const overlayPane = document.querySelector('.cdk-overlay-container .cdk-overlay-pane.bb-select-overlay');
      return !!overlayPane && isElementVisible(overlayPane as HTMLElement);
    };

    ensureHiddenInputValue();

    for (let attempt = 0; attempt < MAX_AUTOMATION_ATTEMPTS; attempt++) {
      button.focus();
      button.click();
      await delay(180);

      if (fieldInput && document.activeElement !== fieldInput) {
        fieldInput.focus();
        await delay(40);
      }

      const overlayContainer = document.querySelector('.cdk-overlay-container') as HTMLElement | null;
      const isMunicipio = controlName === 'municipio';
      if (isMunicipio) {
        if (overlayContainer) {
          console.log('[BBNavigator] .cdk-overlay-container contents after opening municipio:', overlayContainer.innerHTML);
        } else {
          console.log('[BBNavigator] .cdk-overlay-container not found after opening municipio.');
        }
      }

      let options = await waitForOptions();
      let targetOption = findMatchingOption(options);

      if (!targetOption && fieldInput) {
        await typeIntoInput(fieldInput, displayValue.toUpperCase());
        await delay(200);
        options = await waitForOptions();
        targetOption = findMatchingOption(options);
      }

      if (targetOption) {
        const normalizeOptionElement = (element: HTMLElement | null): HTMLElement | null => {
          if (!element) return null;
          if (element.matches('a, button, [role="option"], [role="menuitem"]')) return element;
          const focusable = element.querySelector('a, button, [role="option"], [role="menuitem"]') as HTMLElement | null;
          return focusable || element;
        };

        const orderedOptions = [...options];
        orderedOptions.sort((a, b) => {
          if (a === b) return 0;
          const position = a.compareDocumentPosition(b);
          if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        });

        const focusableOptions = orderedOptions.map(option => normalizeOptionElement(option) || option);
        let normalizedTarget = targetOption ? (normalizeOptionElement(targetOption) || targetOption) : null;
        let targetIndex = -1;

        const matchOptionIndex = (element: HTMLElement | null): number => {
          if (!element) return -1;
          for (let i = 0; i < focusableOptions.length; i++) {
            const option = focusableOptions[i];
            if (option === element || option.contains(element) || element.contains(option)) {
              return i;
            }
          }
          return -1;
        };

        const updateTargetReferences = (option: HTMLElement | null) => {
          normalizedTarget = option ? (normalizeOptionElement(option) || option) : null;
          targetIndex = matchOptionIndex(normalizedTarget);
          if (targetIndex === -1) {
            targetIndex = matchOptionIndex(option);
          }
        };

        updateTargetReferences(targetOption);

        const getActiveIndex = (): number => {
          const activeElement = document.activeElement as HTMLElement | null;
          if (fieldInput && activeElement === fieldInput) {
            const activeSomewhere = focusableOptions.findIndex(opt => opt.classList.contains('active') || opt.getAttribute('aria-selected') === 'true' || opt.matches('[aria-current="true"]'));
            if (activeSomewhere !== -1) return activeSomewhere;
          }

          const activeId = button.getAttribute('aria-activedescendant');
          if (activeId) {
            const activeElementById = document.getElementById(activeId) as HTMLElement | null;
            const matchById = matchOptionIndex(activeElementById);
            if (matchById !== -1) return matchById;
          }

          return matchOptionIndex(activeElement);
        };

        const getKeyTarget = (): HTMLElement => {
          if (fieldInput && document.activeElement === fieldInput) {
            return fieldInput;
          }
          const activeElement = document.activeElement;
          if (activeElement instanceof HTMLElement && activeElement !== document.body) {
            return activeElement;
          }
          const fallbackOption = focusableOptions[0];
          if (fallbackOption) return fallbackOption;
          if (fieldInput) return fieldInput;
          return button;
        };

        const dispatchKeySequence = (key: string, code: string, keyCode: number) => {
          const target = getKeyTarget();
          const eventInit: KeyboardEventInit = {
            key,
            code,
            keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true,
          };
          target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
          target.dispatchEvent(new KeyboardEvent('keypress', eventInit));
          target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        };

        const keyCodeMap: Record<'ArrowDown' | 'ArrowUp' | 'Home' | 'Enter' | 'Tab', number> = {
          ArrowDown: 40,
          ArrowUp: 38,
          Home: 36,
          Enter: 13,
          Tab: 9,
        };

        const sendNavigationKey = (key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'Enter' | 'Tab') => {
          dispatchKeySequence(key, key, keyCodeMap[key]);
        };

        const evaluateSelection = () => {
          ensureHiddenInputValue();
          const buttonText = readButtonDisplayedValue();
          const hiddenValue = hiddenInput ? normalizeText(hiddenInput.value) : '';
          const overlayStillOpen = isOverlayOpen();
          const confirmed = candidateTexts.some(text =>
            text &&
            (buttonText === text || buttonText.includes(text) || hiddenValue === text)
          );
          return { confirmed, overlayStillOpen };
        };

        const triggerOptionSelection = async (optionElement: HTMLElement | null) => {
          if (!optionElement) return false;

          const clickableOption = optionElement.matches('button, a, [role="option"], [role="menuitem"], .bb-option, .mat-option, .menu-item')
            ? optionElement
            : (optionElement.closest('button, a, [role="option"], [role="menuitem"], .bb-option, .mat-option, .menu-item') as HTMLElement) || optionElement;
          const menuItem = clickableOption.closest('li[bbmenuitem]') as HTMLElement | null;

          clickableOption.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          clickableOption.focus?.();

          const rect = clickableOption.getBoundingClientRect();
          const clientX = rect.left + rect.width / 2;
          const clientY = rect.top + rect.height / 2;

          const pointerEvents = [
            new PointerEvent('pointerover', { bubbles: true, cancelable: true, pointerType: 'mouse', clientX, clientY }),
            new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse', clientX, clientY }),
            new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX, clientY }),
            new MouseEvent('mouseenter', { bubbles: false, clientX, clientY }),
            new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', clientX, clientY, buttons: 1 }),
            new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX, clientY, button: 0 }),
            new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', clientX, clientY }),
            new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX, clientY, button: 0 }),
            new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY, button: 0 }),
          ];

          if (clickableOption) {
            pointerEvents.forEach(event => clickableOption.dispatchEvent(event));
            if (typeof clickableOption.click === 'function') clickableOption.click();
          }
          if (menuItem) {
            pointerEvents.forEach(event => menuItem.dispatchEvent(event));
            if (typeof menuItem.click === 'function') menuItem.click();
          }

          if (document.activeElement !== clickableOption) {
            clickableOption.focus?.();
          }

          const keyboardEvents = [
            new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }),
            new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }),
          ];
          keyboardEvents.forEach(event => clickableOption.dispatchEvent(event));
          if (menuItem) {
            keyboardEvents.forEach(event => menuItem.dispatchEvent(event));
          }

          await delay(600);
          const { confirmed, overlayStillOpen } = evaluateSelection();
          return confirmed || !overlayStillOpen;
        };

        let selectionConfirmed = false;

        if (targetIndex !== -1 && focusableOptions.length > 0 && !shouldUseSearchInput) {
          const firstOption = focusableOptions[0];
          if (firstOption) {
            if (document.activeElement !== firstOption) {
              firstOption.focus?.();
              firstOption.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
              firstOption.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
              await delay(80);
            }
          }

          if (document.activeElement === button || document.activeElement === document.body) {
            sendNavigationKey('Tab');
            await delay(90);
          }

          let currentIndex = getActiveIndex();
          if (currentIndex === -1 && firstOption) {
            currentIndex = matchOptionIndex(firstOption);
          }
          if (currentIndex === -1) {
            sendNavigationKey('Home');
            await delay(120);
            currentIndex = getActiveIndex();
          }

          let guard = 0;
          const guardLimit = focusableOptions.length + 5;
          while (guard < guardLimit && currentIndex !== targetIndex) {
            const direction = currentIndex === -1 || currentIndex < targetIndex ? 'ArrowDown' : 'ArrowUp';
            sendNavigationKey(direction);
            await delay(120);
            currentIndex = getActiveIndex();
            guard++;
          }

          sendNavigationKey('Enter');
          await delay(500);

          const { confirmed, overlayStillOpen } = evaluateSelection();
          selectionConfirmed = confirmed || !overlayStillOpen;
        }

        if (!selectionConfirmed && shouldUseSearchInput && fieldInput) {
          await typeIntoInput(fieldInput, displayValue.toUpperCase());
          await delay(200);

          sendNavigationKey('Enter');
          await delay(400);
          let selectionState = evaluateSelection();
          selectionConfirmed = selectionState.confirmed || !selectionState.overlayStillOpen;

          if (!selectionConfirmed) {
            options = await waitForOptions();
            targetOption = findMatchingOption(options);
            if (targetOption) {
              updateTargetReferences(targetOption);
              selectionConfirmed = await triggerOptionSelection(normalizedTarget || targetOption);
            }
          }
        }

        if (!selectionConfirmed) {
          registerLog(` Keyboard/search navigation did not confirm selection for "${displayValue}". Attempting pointer fallback...`);
          printLogs();
          if (!normalizedTarget && targetOption) {
            updateTargetReferences(targetOption);
          }
          selectionConfirmed = await triggerOptionSelection(normalizedTarget || targetOption);
        }

        if (selectionConfirmed) {
          registerLog(` Selected dropdown "${controlName}" with value "${displayValue}"`);
          printLogs();
          return true;
        }

        registerLog(` Dropdown "${controlName}" selection attempt for value "${displayValue}" did not stick. Will retry...`);
        printLogs();
      } else {
        registerLog(` Could not find option "${displayValue}" on attempt ${attempt + 1} for dropdown "${controlName}"`);
        printLogs();
      }

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true });
      document.dispatchEvent(escapeEvent);
      await delay(250);
    }

    registerLog(` Unable to select value "${displayValue}" for dropdown "${controlName}"`);
    printLogs();
    return false;
  }

  type PropertyTab = 'residencial' | 'comercial';

  function resolveDesiredPropertyTab(targetFields: Record<string, any>): PropertyTab {
    const rawValue = typeof targetFields?.tipo_imovel === 'string' ? targetFields.tipo_imovel : '';
    const normalized = normalizeText(rawValue);
    if (normalized.includes('comercial')) {
      return 'comercial';
    }
    return 'residencial';
  }

  async function locateSuggestionTabGroup(timeout = 25000): Promise<HTMLElement | null> {
    const selectors = [
      'bb-card-body sugestoes bb-tab-group',
      'sugestoes bb-tab-group',
      'bb-tab-group.bb-tab-group',
      'bb-card-body bb-tab-group',
      'bb-tab-group'
    ];
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      for (const selector of selectors) {
        const candidate = document.querySelector(selector);
        if (candidate instanceof HTMLElement) {
          const hasTabs = candidate.querySelector('[role="tab"]') || candidate.querySelector('.bb-tab-title');
          if (hasTabs) {
            return candidate as HTMLElement;
          }
        }
      }
      await delay(300);
    }

    return null;
  }

  async function ensurePropertyTabActive(tabGroup: HTMLElement, desiredTab: PropertyTab): Promise<{ contentRoot: HTMLElement | null; selectedTab: PropertyTab }> {
    const tabElements = Array.from(tabGroup.querySelectorAll('[role="tab"]')) as HTMLElement[];
    if (tabElements.length === 0) {
      registerLog(' No tab elements found inside Banco do Brasil suggestions tab group.');
      printLogs();
      return { contentRoot: null, selectedTab: desiredTab };
    }

    let targetTab = tabElements.find(tab => normalizeText(tab.textContent).includes(desiredTab));
    if (!targetTab) {
      targetTab = tabElements[0];
    }

    let resolvedTab: PropertyTab = normalizeText(targetTab?.textContent).includes('comercial') ? 'comercial' : 'residencial';

    if (targetTab && targetTab.getAttribute('aria-selected') !== 'true') {
      registerLog(` Switching to "${resolvedTab}" tab before extracting results.`);
      const pointerEvents = [
        new MouseEvent('mouseover', { bubbles: true, cancelable: true }),
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
        new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ];
      pointerEvents.forEach(event => targetTab.dispatchEvent(event));
      if (typeof targetTab.click === 'function') {
        targetTab.click();
      }
      await delay(450);
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      if (targetTab?.getAttribute('aria-selected') === 'true' || targetTab?.classList.contains('active')) break;
      await delay(120);
    }

    const panelId = targetTab?.getAttribute('aria-controls');
    let panel: HTMLElement | null = null;
    if (panelId) {
      panel = document.getElementById(panelId) as HTMLElement | null;
    }

    const searchRoot = (panel || tabGroup.closest('bb-card-body') || tabGroup) as HTMLElement;
    const desiredTitle = capitalizeWords(resolvedTab);
    let contentRoot = searchRoot.querySelector(`bb-tab[title="${desiredTitle}"]`) as HTMLElement | null;

    if (!contentRoot) {
      const candidateTabs = Array.from(searchRoot.querySelectorAll('bb-tab[title]')) as HTMLElement[];
      contentRoot = candidateTabs.find(tab => normalizeText(tab.getAttribute('title') || tab.textContent) === resolvedTab) || null;
    }

    if (!contentRoot && panel) {
      contentRoot = panel;
    }

    return { contentRoot, selectedTab: resolvedTab };
  }

  function extractCardResultsFromRoot(contentRoot: HTMLElement, selectedTab: PropertyTab, entryCurrencyValue: string): Array<Record<string, any>> {
    const textFrom = (element: Element | null | undefined): string => {
      if (!element || !element.textContent) return '';
      return element.textContent.replace(/\s+/g, ' ').trim();
    };

    const cardsContainerCandidates: HTMLElement[] = [];
    const cardsWrapper = contentRoot.querySelector('#cards, div[id="cards"]');
    if (cardsWrapper instanceof HTMLElement) {
      cardsContainerCandidates.push(cardsWrapper);
    }
    cardsContainerCandidates.push(contentRoot);

    const seenCards = new Set<HTMLElement>();
    const cardElements: HTMLElement[] = [];

    for (const container of cardsContainerCandidates) {
      const directCards = Array.from(container.querySelectorAll('div[id="card"]')) as HTMLElement[];
      if (directCards.length > 0) {
        for (const card of directCards) {
          const normalizedCard = card.closest('div[id="card"]') as HTMLElement | null;
          if (normalizedCard && !seenCards.has(normalizedCard)) {
            seenCards.add(normalizedCard);
            cardElements.push(normalizedCard);
          }
        }
      } else {
        const childCandidates = Array.from(container.children) as HTMLElement[];
        for (const child of childCandidates) {
          if (!(child instanceof HTMLElement)) continue;
          if (child.querySelector('bb-caption')) {
            const normalizedCard = child.closest('div[id="card"]') as HTMLElement | null || child;
            if (normalizedCard && !seenCards.has(normalizedCard)) {
              seenCards.add(normalizedCard);
              cardElements.push(normalizedCard as HTMLElement);
            }
          }
        }
      }
    }

    const results: Record<string, any>[] = [];

    cardElements.forEach((card, index) => {
      const headerValue = textFrom(card.querySelector('bb-title h1, bb-title h2, h1, h2'));
      const infoRows = Array.from(card.querySelectorAll('div')).filter(div => div.querySelector('bb-caption'));
      const infoMap: Record<string, string> = {};

      for (const row of infoRows) {
        const captionNode = row.querySelector('bb-caption') as HTMLElement | null;
        if (!captionNode) continue;
        const key = normalizeText(captionNode.textContent);
        if (!key) continue;
        const valueNode = row.querySelector('bb-label, span, strong, p, h1, h2') as HTMLElement | null;
        const value = textFrom(valueNode);
        if (value) {
          infoMap[key] = value;
        }
      }

      if (headerValue && !infoMap['parcela']) {
        infoMap['parcela'] = headerValue;
      }

      const valorSolicitado = infoMap['valor solicitado'] || infoMap['valor total'] || '';
      const prazo = infoMap['prazo'] || '';
      const taxa = infoMap['taxa de juros'] || infoMap['taxa'] || '';
      const parcela = infoMap['parcela'] || headerValue || '';

      if (!valorSolicitado && !prazo && !taxa && !parcela) {
        return;
      }

      const optionLabel = `BB ${capitalizeWords(selectedTab)} opção ${index + 1}`;

      const entry: Record<string, any> = {
        tipo_amortizacao: optionLabel,
        prazo: prazo || null,
        valor_total: valorSolicitado || null,
        valor_entrada: entryCurrencyValue,
        juros_nominais: taxa || null,
        juros_efetivos: taxa || null,
        parcela: parcela || null,
        tab_origem: selectedTab,
        valor_solicitado: valorSolicitado || null,
        taxa_juros: taxa || null,
      };

      results.push(entry);
    });

    return results;
  }

  async function sendFailureResult(message: string): Promise<void> {
    if (hasSentResultsRef.current) {
      return;
    }

    const normalizeFailure = (raw: string | undefined | null): string => {
      const cleaned = (raw ?? '').toString().trim();
      const base = cleaned.length > 0 ? cleaned : 'Não foi possível concluir a simulação no Banco do Brasil.';
      const prefix = 'bb:';
      return base.toLowerCase().startsWith(prefix) ? base : `${prefix} ${base}`;
    };

    const mensagemFinal = normalizeFailure(message);
    const payload = new SimulationPayload('bb', 'failure');
    payload.addFailure(mensagemFinal);

    const messengerResult = await BankMessenger.sendSimulationPayload(payload, {
      logPrefix: 'bbNavigation.js',
      registerLog,
      printLogs,
    });

    hasSentResultsRef.current = true;
    setIsComplete(true);
    registerLog(mensagemFinal);
    if (!messengerResult.confirmed) {
      registerLog(` Confirmação do background não recebida (requestId=${messengerResult.requestId}).`);
    }
    printLogs();
  }

  function resolveEntryNumeric(fields: Record<string, any>): number | null {
    const candidate = fields?.valor_entrada;
    if (candidate === undefined || candidate === null || candidate === '') return null;

    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) return null;
      return candidate;
    }

    const raw = String(candidate).trim();
    if (!raw) return null;

    const trimmed = raw.replace(/[R$\s]/gi, '');
    if (!trimmed) return null;

    if (trimmed.includes('.') && trimmed.includes(',')) {
      const normalized = trimmed.replace(/\./g, '').replace(',', '.');
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed)) return parsed;
    }

    if (trimmed.includes('.') && !trimmed.includes(',')) {
      const decimalMatch = trimmed.match(/\.\d{1,2}$/);
      if (decimalMatch) {
        const parsed = Number(trimmed);
        if (!Number.isNaN(parsed)) return parsed;
      }
      const withoutDots = trimmed.replace(/\./g, '');
      const parsed = Number(withoutDots);
      if (!Number.isNaN(parsed)) return parsed;
    }

    if (!trimmed.includes('.') && trimmed.includes(',')) {
      const normalized = trimmed.replace(',', '.');
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed)) return parsed;
    }

    const digitsOnly = trimmed.replace(/\D/g, '');
    if (!digitsOnly) return null;
    const parsedDigits = Number(digitsOnly);
    if (Number.isNaN(parsedDigits)) return null;
    return parsedDigits;
  }

  function resolveCustomValorDigits(fields: Record<string, any>): string {
    const numeric = resolveEntryNumeric(fields);
    if (numeric === null) return '';
    return String(Math.round(numeric * 100));
  }

  function resolveCustomPrazo(fields: Record<string, any>): string {
    const candidates = [
      fields?.prazo_financiamento,
      fields?.prazo,
      fields?.prazo_desejado
    ];
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      const digits = String(candidate).replace(/\D/g, '');
      if (digits) {
        return digits;
      }
    }
    return '';
  }

  async function runCustomSimulationFlow(targetFields: Record<string, any>, entryDigits: string, entryCurrency: string | null): Promise<Record<string, any> | null> {
    try {
      let formHost = document.querySelector('custom-form-fazer-do-meu-jeito form#form, custom-form-fazer-do-meu-jeito form') as HTMLElement | null;

      if (!formHost) {
        const buttonSelectors = [
          '#botao',
          'button#botao',
          'button.bb-button.secondary',
          'button[aria-label*="meu jeito"]',
          'custom-form-fazer-do-meu-jeito + div button.bb-button.secondary',
        ];

        let customButton: HTMLElement | null = null;
        for (const selector of buttonSelectors) {
          const candidate = await waitForElementEnabled(selector, 8000);
          if (!candidate) continue;
          const text = normalizeText((candidate as HTMLElement).textContent);
          if (text.includes('fazer do meu jeito') || selector === '#botao' || selector === 'button#botao') {
            customButton = candidate as HTMLElement;
            break;
          }
        }

        if (customButton) {
          registerLog(' Clicking "Fazer do meu jeito" button to open custom form.');
          printLogs();
          customButton.click();
          await delay(500);
        } else {
          registerLog(' Custom simulation button not found or disabled.');
          printLogs();
          return null;
        }
      }

      formHost = await waitForElement('custom-form-fazer-do-meu-jeito form#form, custom-form-fazer-do-meu-jeito form', 20000) as HTMLElement | null;
      if (!formHost) {
        registerLog(' Custom simulation form not found.');
        printLogs();
        return null;
      }

      (formHost as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      await delay(400);

      const valorDigits = entryDigits || resolveCustomValorDigits(targetFields);
      const prazoDigits = resolveCustomPrazo(targetFields);

      if (!valorDigits) {
        registerLog(' Skipping custom simulation: no valor_entrada/valor_imovel provided.');
        printLogs();
        return null;
      }

      if (!prazoDigits) {
        registerLog(' Skipping custom simulation: no prazo information provided.');
        printLogs();
        return null;
      }

      const valorFilled = await withSelectors(
        [
          'custom-form-fazer-do-meu-jeito bb-money-field[formcontrolname="valor"] input',
          'custom-form-fazer-do-meu-jeito input[placeholder="0,00"]',
          'bb-money-field[formcontrolname="valor"] input',
          '#form bb-money-field input'
        ],
        async (selector) => simulateNaturalInput(
          selector,
          valorDigits,
          120,
          3,
          {
            typePerChar: true,
            clearExisting: true,
            perCharDelay: 70,
            finalValueCheck: (finalValue) => finalValue.replace(/\D/g, '') === valorDigits
          }
        ),
        'Custom Valor'
      );

      if (!valorFilled) {
        registerLog(' Unable to populate custom value field.');
        printLogs();
        return null;
      }

      const prazoFilled = await withSelectors(
        [
          'custom-form-fazer-do-meu-jeito input[formcontrolname="prazo"]',
          'custom-form-fazer-do-meu-jeito input[inputmode="numeric"]',
          '#form input[formcontrolname="prazo"]',
          '#form input[placeholder*="prazo"]'
        ],
        async (selector) => simulateNaturalInput(
          selector,
          prazoDigits,
          120,
          3,
          {
            typePerChar: true,
            clearExisting: true,
            perCharDelay: 80,
            finalValueCheck: (finalValue) => finalValue.replace(/\D/g, '') === prazoDigits
          }
        ),
        'Custom Prazo'
      );

      if (!prazoFilled) {
        registerLog(' Unable to populate custom prazo field.');
        printLogs();
        return null;
      }

      const advanceButton = await waitForElementEnabled('#botao-segundo, button#botao-segundo, custom-form-fazer-do-meu-jeito button.bb-button.primary', 8000);
      if (!advanceButton) {
        registerLog(' Custom simulation advance button not available.');
        printLogs();
        return null;
      }

      (advanceButton as HTMLElement).click();
      await delay(1500);

      const summaryHost = await waitForElement('bb-card-body resumo, resumo, custom-resumo, resumo[ng-reflect-title]', 20000);
      if (!summaryHost) {
        registerLog(' Custom simulation summary not detected after advancing.');
        printLogs();
        return null;
      }

      const summary = extractCustomSummary(summaryHost as HTMLElement);
      if (summary) {
        registerLog(' Custom simulation summary captured.');
        printLogs();
      } else {
        registerLog(' Failed to parse custom simulation summary content.');
        printLogs();
      }

      if (summary) {
        summary.valor_entrada = entryCurrency ?? 'R$ 0,00';
      }

      return summary;
    } catch (error: any) {
      registerLog(` Custom simulation flow threw an exception: ${error?.message || error}`);
      printLogs();
      return null;
    }
  }

  function extractCustomSummary(summaryContainer: HTMLElement): Record<string, any> | null {
    const chipElements = Array.from(summaryContainer.querySelectorAll('bb-text-chip'));
    if (chipElements.length === 0) {
      return null;
    }

    const infoMap: Record<string, string> = {};

    chipElements.forEach(chip => {
      const descriptionAttr = chip.getAttribute('description');
      const descriptionText = chip.querySelector('.description')?.textContent || descriptionAttr || '';
      const valueText = chip.querySelector('.content')?.textContent || chip.textContent || '';
      const key = normalizeText(descriptionText);
      const value = valueText ? valueText.replace(/\s+/g, ' ').trim() : '';
      if (key) {
        infoMap[key] = value;
      }
    });

    if (Object.keys(infoMap).length === 0) {
      return null;
    }

    const valorSolicitado = infoMap['valor solicitado'] || null;
    const parcela = infoMap['parcela'] || null;
    const prazo = infoMap['prazo'] || null;
    const taxa = infoMap['taxa de juros'] || null;
    const cet = infoMap['custo efetivo total'] || null;

    return {
      tipo_amortizacao: 'BB Simulação personalizada',
      prazo,
      valor_total: valorSolicitado,
      valor_entrada: null,
      juros_nominais: taxa,
      juros_efetivos: cet || taxa,
      parcela,
      tab_origem: 'personalizado',
      valor_solicitado: valorSolicitado,
      taxa_juros: taxa,
      custo_efetivo_total: cet
    };
  }

  async function waitForResultsAndSend(targetFields: Record<string, any>): Promise<void> {
    if (hasSentResultsRef.current) {
      return;
    }

    const desiredTab = resolveDesiredPropertyTab(targetFields);
    registerLog(` Waiting for Banco do Brasil simulation results (expected tab: ${desiredTab}).`);
    printLogs();

    const entryNumeric = resolveEntryNumeric(targetFields);
    const entryDigits = entryNumeric !== null ? String(Math.round(entryNumeric * 100)) : '';
    const entryCurrency = entryNumeric !== null
      ? entryNumeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : null;
    const entryCurrencyValue = entryCurrency ?? 'R$ 0,00';

    const deadline = Date.now() + 60000;

    while (!hasSentResultsRef.current && Date.now() < deadline) {
      const tabGroup = await locateSuggestionTabGroup(5000);
      if (tabGroup) {
        const { contentRoot, selectedTab } = await ensurePropertyTabActive(tabGroup, desiredTab);
        if (contentRoot) {
          const results = extractCardResultsFromRoot(contentRoot, selectedTab, entryCurrencyValue);
          if (results.length > 0) {
            let customSimulation: Record<string, any> | null = null;
            if (entryDigits) {
              try {
                customSimulation = await runCustomSimulationFlow(targetFields, entryDigits, entryCurrency);
                if (customSimulation) {
                  results.push(customSimulation);
                }
              } catch (error: any) {
                registerLog(` Custom simulation flow failed: ${error?.message || error}`);
                printLogs();
              }
            } else {
              registerLog(' Skipping custom simulation step: no valor_entrada available.');
              printLogs();
            }
            const payload = new SimulationPayload('bb');
            payload.addEntries(results);
            const sendResult = await BankMessenger.sendSimulationPayload(payload, {
              logPrefix: 'bbNavigation.js',
              registerLog,
              printLogs,
            });
            hasSentResultsRef.current = true;
            registerLog(` BB simulation results captured (${results.length} opções).`);
            if (!sendResult.confirmed) {
              registerLog(` Confirmação do background não recebida para o BB (requestId=${sendResult.requestId}).`);
            }
            printLogs();
            return;
          } else {
            registerLog(` Suggestion tab "${selectedTab}" did not yield cards yet. Retrying...`);
            printLogs();
          }
        } else {
          registerLog(' Could not resolve Banco do Brasil suggestion content root. Will retry.');
          printLogs();
        }
      }
      await delay(1200);
    }

    if (!hasSentResultsRef.current) {
      const aviso = 'A página do Banco do Brasil demorou para retornar as opções de simulação.';
      registerLog(` ${aviso} Nenhum resultado foi enviado.`);
      printLogs();
      throw new Error(aviso);
    }
  }

  React.useEffect(() => {
    if (!isBBPage) {
      registerLog(' Not on bb.com.br, skipping automation');
      return;
    }

    registerLog(' useEffect triggered for BB automation.');

    let lastFailureMessage: string | null = null;

    const runAutomation = async (): Promise<boolean> => {
      try {
        registerLog(' Iniciando sequência de automação do Banco do Brasil.');
        await delay(3000);

        if (checkForErrorDialog()) {
          throw new Error('A página do Banco do Brasil exibiu avisos antes do início da simulação. Revise os dados e tente novamente.');
        }

        registerLog(' Aguardando o campo CPF ficar disponível...');
        const cpfKeyElement = await waitForElement('bb-text-field[formcontrolname="cpf"] input, input[formcontrolname="cpf"], input[placeholder*="CPF"]');
        if (!cpfKeyElement) {
          throw new Error('Um ou mais campos do Banco do Brasil não carregaram corretamente (CPF não disponível).');
        }

        registerLog(' Primeira etapa pronta. Preenchendo campos.');
        printLogs();

        await fillFirstPage(fields);

        if (checkForErrorDialog()) {
          throw new Error('O Banco do Brasil apresentou avisos de inconsistência nesta etapa da simulação.');
        }

        const nextButton = await waitForElementEnabled('#botao, button#botao, button.bb-button.primary', 8000);
        if (nextButton) {
          registerLog(' Tentando clicar em "Prosseguir".');
          (nextButton as HTMLElement).click();
          await delay(1500);
        } else {
          throw new Error('Não foi possível avançar: o botão "Prosseguir" do Banco do Brasil permaneceu indisponível.');
        }

        registerLog(' Primeira etapa da automação do BB concluída.');
        printLogs();

        await waitForResultsAndSend(fields);
        setIsComplete(true);
        return true;
      } catch (err: any) {
        const mensagem = err instanceof Error ? err.message : String(err);
        const detalhe = mensagem || 'Não foi possível concluir a automação do Banco do Brasil.';
        registerLog(` Falha na automação do BB: ${detalhe}`);
        printLogs();
        lastFailureMessage = detalhe;
        return false;
      }
    };

    (async () => {
      for (let attempt = 1; attempt <= MAX_AUTOMATION_ATTEMPTS; attempt++) {
        registerLog(` Executando tentativa ${attempt}/${MAX_AUTOMATION_ATTEMPTS} da automação do BB`);
        const concluido = await runAutomation();
        if (concluido) {
          registerLog(` Automação do BB finalizada na tentativa ${attempt}`);
          break;
        }
        if (attempt < MAX_AUTOMATION_ATTEMPTS && !hasSentResultsRef.current) {
          await delay(1500);
          registerLog(' Aguardando para tentar novamente a automação do BB...');
        } else {
          registerLog(' Automação do BB não obteve êxito após as tentativas configuradas.');
          break;
        }
      }

      if (!hasSentResultsRef.current && lastFailureMessage) {
        await sendFailureResult(lastFailureMessage);
      }
    })();

  }, [isBBPage, JSON.stringify(fields)]);


  async function fillFirstPage(fields: Record<string, any>) {
    registerLog(' Filling BB first page...');

    const fieldStatus: Record<string, 'filled' | 'failed' | 'missing-data'> = {};

    if (fields.cpf) {
      const cpfDigits = String(fields.cpf).replace(/\D/g, '');
      const cpfValue = maskCPF(String(fields.cpf));
      registerLog(` Prepared CPF value. Digits: "${cpfDigits}", masked: "${cpfValue}"`);
      printLogs();
      const cpfFilled = await withSelectors(
        [
          'bb-text-field[formcontrolname="cpf"] input',
          'input[formcontrolname="cpf"]',
          'input[id*="cpf"]',
          'input[placeholder*="CPF"]'
        ],
        async (selector) => simulateNaturalInput(
          selector,
          cpfDigits,
          120,
          3,
          {
            typePerChar: true,
            clearExisting: true,
            perCharDelay: 80,
            finalValueCheck: (finalValue) => finalValue.replace(/\D/g, '') === cpfDigits,
          }
        ),
        'CPF'
      );
      fieldStatus.cpf = cpfFilled ? 'filled' : 'failed';
      if (!cpfFilled) {
        registerLog(' CPF field could not be validated as filled.');
        printLogs();
      }
    } else {
      registerLog(' Skipping CPF: value not provided in payload.');
      printLogs();
      fieldStatus.cpf = 'missing-data';
    }

    if (fields.valor_imovel) {
      const formattedValue = formatCurrencyFromCents(String(fields.valor_imovel));
      const valorFilled = await withSelectors(
        [
          'bb-money-field[formcontrolname="valor"] input',
          'bb-money-field[formcontrolname="valor"] .bb-textfield-group input',
          'input[formcontrolname="valor"]',
          'input[id*="valor"]',
          '#card-body input[placeholder="0,00"]'
        ],
        async (selector) => {
          return simulateNaturalInput(selector, formattedValue);
        },
        'Valor do imóvel'
      );
      await delay(300);
      fieldStatus.valor_imovel = valorFilled ? 'filled' : 'failed';
      if (!valorFilled) {
        registerLog(' Valor do imóvel field could not be validated as filled.');
        printLogs();
      }
    } else {
      registerLog(' Skipping Valor do imóvel: value not provided in payload.');
      printLogs();
      fieldStatus.valor_imovel = 'missing-data';
    }

    if (fields.uf) {
      const ufFilled = await selectFromDropdown('uf', String(fields.uf));
      await delay(800);
      fieldStatus.uf = ufFilled ? 'filled' : 'failed';
      if (!ufFilled) {
        registerLog(' UF dropdown selection could not be validated.');
        printLogs();
      }
    } else {
      registerLog(' Skipping UF: value not provided in payload.');
      printLogs();
      fieldStatus.uf = 'missing-data';
    }

    if (fields.cidade) {
      const cidadeFilled = await selectFromDropdown('municipio', String(fields.cidade));
      await delay(500);
      fieldStatus.cidade = cidadeFilled ? 'filled' : 'failed';
      if (!cidadeFilled) {
        registerLog(' Município dropdown selection could not be validated.');
        printLogs();
      }
    } else {
      registerLog(' Skipping Município: value not provided in payload.');
      printLogs();
      fieldStatus.cidade = 'missing-data';
    }

    const failedFields = Object.entries(fieldStatus)
      .filter(([, status]) => status === 'failed')
      .map(([name]) => name);

    const missingFields = Object.entries(fieldStatus)
      .filter(([, status]) => status === 'missing-data')
      .map(([name]) => name);

    if (failedFields.length === 0) {
      registerLog(' All tracked fields have been filled successfully.');
    } else {
      registerLog(` Verification complete. Fields pending or empty: ${failedFields.join(', ')}`);
    }

    if (missingFields.length > 0) {
      registerLog(` Fields skipped due to missing data: ${missingFields.join(', ')}`);
    }
    printLogs();

    registerLog(' Finished filling BB first page.');
    printLogs();
  }

  return (
    <SimulationOverlay
      title="Processando opções e obtendo resultados"
      subtitle="Preenchendo formulário automaticamente"
      bankName="Banco do Brasil"
      bankIcon="ibb-banco-brasil"
      isComplete={isComplete}
    >
      <div className="bb-navigator">
        <p>Simulação do Banco do Brasil em processo.</p>
      </div>
    </SimulationOverlay>
  );
};

registerLog('[bbNavigation.js] Script loaded. Starting auto-mount...');

autoMountNavigator(BBNavigator, {
  containerId: 'bb-navigator-root',
  logPrefix: 'bbNavigation.js',
  registerLog,
  printLogs,
});
