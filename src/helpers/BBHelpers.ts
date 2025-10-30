import { Helpers } from './Helpers';
import { MAX_AUTOMATION_ATTEMPTS } from '../lib/constants';

export interface Logger {
  registerLog: (message: string) => void;
  printLogs: () => void;
}

export interface SimulateInputOptions {
  typePerChar?: boolean;
  clearExisting?: boolean;
  perCharDelay?: number;
  finalValueCheck?: (finalValue: string) => boolean;
}

type SelectCacheEntry = {
  lookup: Record<string, string>;
  optionsHash: string;
};

export type SelectCache = Map<string, SelectCacheEntry>;

const log = (logger: Logger, message: string) => {
  logger.registerLog(message);
};

const flush = (logger: Logger) => {
  logger.printLogs();
};

export class BBHelpers {
  static async waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
    return new Promise(resolve => {
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

  static async waitForElementEnabled(selector: string, timeout = 10000): Promise<Element | null> {
    return new Promise(resolve => {
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

  static checkForErrorDialog(logger: Logger): boolean {
    const dialogs = document.querySelectorAll('.validation-message, .toast, .bb-alert');
    for (const dialog of dialogs) {
      const text = dialog.textContent?.trim();
      if (text && /obrigatório|inválido|erro/i.test(text)) {
        log(logger, `Encontrado possível diálogo de erro com o texto: "${text}"`);
        return true;
      }
    }
    return false;
  }

  static async setInstantValue(selector: string, value: string, logger: Logger, isSelect = false): Promise<boolean> {
    const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
    if (!el) {
      log(logger, ` Elemento não encontrado: ${selector}`);
      flush(logger);
      return false;
    }
    log(logger, ` Configurando ${selector} instantaneamente para: "${value}"`);
    if (isSelect) {
      const select = el as HTMLSelectElement;
      const option = Array.from(select.options).find(opt =>
        opt.text.toLowerCase().includes(value.toLowerCase()) ||
        opt.value.toLowerCase().includes(value.toLowerCase())
      );
      if (option) {
        select.value = option.value;
        log(logger, ` Opção selecionada: "${option.text}" (valor: ${option.value})`);
      }
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await Helpers.delay(100);

    const finalValue = isSelect
      ? (el as HTMLSelectElement).value
      : (el as HTMLInputElement).value;

    if (finalValue && finalValue.trim() !== '') {
      log(logger, ` Sucesso: ${selector} agora tem o valor "${finalValue}".`);
      flush(logger);
      return true;
    }

    log(logger, ` Aviso: ${selector} continua vazio após tentativa de configurar para "${value}".`);
    flush(logger);
    return false;
  }

  static async simulateNaturalInput(
    selector: string,
    value: string,
    logger: Logger,
    delay = 500,
    retries = MAX_AUTOMATION_ATTEMPTS,
    options: SimulateInputOptions = {}
  ): Promise<boolean> {
    const {
      typePerChar = false,
      clearExisting = true,
      perCharDelay = 60,
      finalValueCheck,
    } = options;

    for (let i = 0; i < retries; i++) {
      try {
        const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
        if (!el) throw new Error(`Elemento não encontrado para o seletor: ${selector}`);
        log(logger, ` Simulando inserção para ${selector} com valor "${value}" (Tentativa ${i + 1})`);
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
          log(logger, ` Sucesso: ${selector} tem o valor "${finalValue}". Assumindo sucesso.`);
          flush(logger);
          return true;
        } else {
          // Se finalValueCheck não foi fornecido, consideramos sucesso (lógica "cega")
          if (!finalValueCheck) {
            log(logger, ` Sucesso (sem validação): ${selector} foi preenchido.`);
            flush(logger);
            return true;
          }
          throw new Error(`Falha ao verificar valor para ${selector}. O campo está vazio.`);
        }
      } catch (error: any) {
        log(logger, ` Tentativa ${i + 1} falhou para ${selector}: ${error.message}`);
        flush(logger);
        if (i === retries - 1) {
          log(logger, ` Todas as ${retries} tentativas falharam para o seletor: ${selector}`);
          flush(logger);
          return false;
        }
        await Helpers.delay(1000);
      }
    }
    return false;
  }

  static async simulateAutocomplete(
    selector: string,
    value: string,
    logger: Logger,
    selectCache: SelectCache,
    delay = 500
  ): Promise<void> {
    try {
      const el = document.querySelector(selector) as HTMLSelectElement;
      if (!el) throw new Error(`Elemento não encontrado para o seletor: ${selector}`);
      log(logger, ` Configurando ${selector} diretamente com o valor "${value}"`);
      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      const dispatchEvent = (element: Element, eventName: string) => {
        element.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
      };
      const options = el.querySelectorAll('option');
      const optionsHash = Array.from(options).map(opt => opt.value + ':' + opt.textContent).join('|');
      let lookup: Record<string, string>;
      const cached = selectCache.get(selector);
      if (cached && cached.optionsHash === optionsHash) {
        lookup = cached.lookup;
        log(logger, ` Usando tabela de cache para ${selector} (${Object.keys(lookup).length} opções)`);
      } else {
        lookup = {};
        for (let i = 0; i < options.length; i++) {
          const option = options[i];
          const optionText = option.textContent?.trim().toUpperCase() || '';
          const optionValue = option.value;
          if (optionText && optionValue) lookup[optionText] = optionValue;
        }
        selectCache.set(selector, { lookup, optionsHash });
        log(logger, ` Tabela de cache armazenada com ${Object.keys(lookup).length} opções`);
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
        if (optionValue) log(logger, ` Correspondência encontrada: "${normalizedValue}" → "${matched}"`);
      }
      if (!optionValue) {
        const available = Object.keys(lookup).slice(0, 10).join(', ');
        log(logger, ` Opções disponíveis (10 primeiras): ${available}...`);
        throw new Error(`Valor "${value}" não encontrado nas opções`);
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
        log(logger, ` Sucesso: ${selector} configurado para "${selectedOption.text}" (valor: ${optionValue})`);
        flush(logger);
      } else {
        throw new Error(`Falha ao configurar valor para ${selector}`);
      }
    } catch (error: any) {
      log(logger, ` Falha ao configurar ${selector}: ${error.message}`);
      flush(logger);
      throw error;
    }
  }

  static async withSelectors(
    selectors: string[],
    handler: (selector: string) => Promise<boolean>,
    logLabel: string,
    logger: Logger
  ): Promise<boolean> {
    const pendingSelectors: string[] = [];
    const retrySelectors: string[] = [];

    for (const selector of selectors) {
      const existing = document.querySelector(selector);
      if (existing) {
        try {
          const success = await handler(selector);
          if (success) return true;
          retrySelectors.push(selector);
          log(logger, ` Handler relatou falha para ${logLabel} usando seletor "${selector}". Tentando alternativas...`);
          flush(logger);
        } catch (error: any) {
          retrySelectors.push(selector);
          log(logger, ` Erro ao manusear ${logLabel} com seletor "${selector}": ${error.message || error}`);
          flush(logger);
        }
      } else {
        pendingSelectors.push(selector);
      }
    }

    const secondPassSelectors: string[] = [];
    const seen = new Set<string>();
    [...pendingSelectors, ...retrySelectors].forEach((selector) => {
      if (!seen.has(selector)) {
        seen.add(selector);
        secondPassSelectors.push(selector);
      }
    });

    for (const selector of secondPassSelectors) {
      const found = await this.waitForElement(selector, 3000);
      if (found) {
        try {
          const success = await handler(selector);
          if (success) return true;
          log(logger, ` Handler relatou falha para ${logLabel} usando seletor "${selector}" após aguardar. Tentando próxima opção...`);
          flush(logger);
        } catch (error: any) {
          log(logger, ` Erro ao manusear ${logLabel} com seletor "${selector}" após aguardar: ${error.message || error}`);
          flush(logger);
        }
      }
    }

    log(logger, ` Falha ao resolver elemento para ${logLabel}. Seletores tentados: ${selectors.join(', ')}`);
    flush(logger);
    return false;
  }

  static async selectFromDropdown(controlName: string, value: string, logger: Logger): Promise<boolean> {
    const normalizedValue = Helpers.normalizeText(value);
    if (!normalizedValue) {
      log(logger, ` Pulando dropdown ${controlName}: valor vazio`);
      flush(logger);
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
      const enabled = await this.waitForElementEnabled(selector, 8000);
      if (enabled) {
        button = enabled as HTMLElement;
        break;
      }
    }

    if (!button) {
      log(logger, ` Botão do dropdown não encontrado ou habilitado para o controle "${controlName}"`);
      flush(logger);
      return false;
    }

    const fieldRoot = button.closest('bb-select-field') as HTMLElement | null;
    const hiddenInput = fieldRoot?.querySelector('input[formcontrolname], input[type="hidden"]') as HTMLInputElement | null;
    const fieldInput = fieldRoot?.querySelector('input[bbselectinput], input[type="text"], input[role="combobox"], input[aria-autocomplete]') as HTMLInputElement | null;
    const shouldUseSearchInput = Boolean(fieldInput && (controlName === 'municipio' || fieldInput.hasAttribute('aria-autocomplete')));

    const displayValue = controlName === 'uf'
      ? value.toUpperCase()
      : Helpers.capitalizeWords(value);
    const normalizedDisplayValue = Helpers.normalizeText(displayValue);
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
      await Helpers.delay(40);

      for (const char of chars) {
        const keyCode = char.charCodeAt(0);
        const keydown = new KeyboardEvent('keydown', { key: char, code: char, keyCode, which: keyCode, bubbles: true, cancelable: true });
        input.dispatchEvent(keydown);
        const keypress = new KeyboardEvent('keypress', { key: char, code: char, keyCode, which: keyCode, bubbles: true, cancelable: true });
        input.dispatchEvent(keypress);
        input.value = `${input.value}${char}`;
        const inputEvent = typeof InputEvent === 'function'
          ? new InputEvent('input', { bubbles: true, cancelable: true, data: char, inputType: 'insertText' })
          : new Event('input', { bubbles: true, cancelable: true });
        input.dispatchEvent(inputEvent);
        const keyup = new KeyboardEvent('keyup', { key: char, code: char, keyCode, which: keyCode, bubbles: true, cancelable: true });
        input.dispatchEvent(keyup);
        await Helpers.delay(45);
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

        await Helpers.delay(120);
      }

      return gatherOptions();
    };

    const findMatchingOption = (options: HTMLElement[]): HTMLElement | null => {
      for (const option of options) {
        const optionText = Helpers.normalizeText(option.textContent);
        if (!optionText) continue;
        const match = candidateTexts.some(text => optionText === text || optionText.includes(text));
        if (match) return option;
      }
      return null;
    };

    const readButtonDisplayedValue = () => {
      if (fieldRoot) {
        const displayNode = fieldRoot.querySelector('.select-text span, .bb-select-label, .bb-select-value') as HTMLElement | null;
        if (displayNode) return Helpers.normalizeText(displayNode.textContent);
      }
      return Helpers.normalizeText(button.textContent || '');
    };

    const isOverlayOpen = () => {
      const overlayPane = document.querySelector('.cdk-overlay-container .cdk-overlay-pane.bb-select-overlay');
      return !!overlayPane && isElementVisible(overlayPane as HTMLElement);
    };

    ensureHiddenInputValue();

    for (let attempt = 0; attempt < MAX_AUTOMATION_ATTEMPTS; attempt++) {
      button.focus();
      button.click();
      await Helpers.delay(180);

      if (fieldInput && document.activeElement !== fieldInput) {
        fieldInput.focus();
        await Helpers.delay(40);
      }

      let options = await waitForOptions();
      let targetOption = findMatchingOption(options);

      if (!targetOption && fieldInput) {
        await typeIntoInput(fieldInput, displayValue.toUpperCase());
        await Helpers.delay(200);
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
        let normalizedTarget = normalizeOptionElement(targetOption) || targetOption;
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
            const activeSomewhere = focusableOptions.findIndex(opt =>
              opt.classList.contains('active') ||
              opt.getAttribute('aria-selected') === 'true' ||
              opt.matches('[aria-current="true"]')
            );
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
          const hiddenValue = hiddenInput ? Helpers.normalizeText(hiddenInput.value) : '';
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

          pointerEvents.forEach(event => clickableOption.dispatchEvent(event));
          if (typeof clickableOption.click === 'function') clickableOption.click();
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

          await Helpers.delay(600);
          const { confirmed, overlayStillOpen } = evaluateSelection();
          return confirmed || !overlayStillOpen;
        };

        let selectionConfirmed = false;

        if (targetIndex !== -1 && focusableOptions.length > 0 && !shouldUseSearchInput) {
          const firstOption = focusableOptions[0];
          if (firstOption && document.activeElement !== firstOption) {
            firstOption.focus?.();
            firstOption.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
            firstOption.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
            await Helpers.delay(80);
          }

          if (document.activeElement === button || document.activeElement === document.body) {
            sendNavigationKey('Tab');
            await Helpers.delay(90);
          }

          let currentIndex = getActiveIndex();
          if (currentIndex === -1 && firstOption) {
            currentIndex = matchOptionIndex(firstOption);
          }
          if (currentIndex === -1) {
            sendNavigationKey('Home');
            await Helpers.delay(120);
            currentIndex = getActiveIndex();
          }

          let guard = 0;
          const guardLimit = focusableOptions.length + 5;
          while (guard < guardLimit && currentIndex !== targetIndex) {
            const direction = currentIndex === -1 || currentIndex < targetIndex ? 'ArrowDown' : 'ArrowUp';
            sendNavigationKey(direction);
            await Helpers.delay(120);
            currentIndex = getActiveIndex();
            guard++;
          }

          sendNavigationKey('Enter');
          await Helpers.delay(500);

          const { confirmed, overlayStillOpen } = evaluateSelection();
          selectionConfirmed = confirmed || !overlayStillOpen;
        }

        if (!selectionConfirmed && shouldUseSearchInput && fieldInput) {
          await typeIntoInput(fieldInput, displayValue.toUpperCase());
          await Helpers.delay(200);

          sendNavigationKey('Enter');
          await Helpers.delay(400);
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
          log(logger, ` Navegação por teclado/busca não confirmou a seleção de "${displayValue}". Tentando fallback por clique...`);
          flush(logger);
          if (!normalizedTarget && targetOption) {
            updateTargetReferences(targetOption);
          }
          selectionConfirmed = await triggerOptionSelection(normalizedTarget || targetOption);
        }

        if (selectionConfirmed) {
          log(logger, ` Dropdown "${controlName}" selecionado com valor "${displayValue}"`);
          flush(logger);
          return true;
        }

        log(logger, ` Tentativa de seleção no dropdown "${controlName}" para o valor "${displayValue}" não funcionou. Tentando novamente...`);
        flush(logger);
      } else {
        log(logger, ` Não foi possível encontrar a opção "${displayValue}" na tentativa ${attempt + 1} para o dropdown "${controlName}"`);
        flush(logger);
      }

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true });
      document.dispatchEvent(escapeEvent);
      await Helpers.delay(250);
    }

    log(logger, ` Não foi possível selecionar o valor "${displayValue}" para o dropdown "${controlName}"`);
    flush(logger);
    return false;
  }


  static resolveDesiredPropertyTab(targetFields: Record<string, any>): 'residencial' | 'comercial' {
    const rawValue = typeof targetFields?.tipo_imovel === 'string' ? targetFields.tipo_imovel : '';
    const normalized = Helpers.normalizeText(rawValue);
    if (normalized.includes('comercial')) {
      return 'comercial';
    }
    return 'residencial';
  }

  static async locateSuggestionTabGroup(timeout = 25000): Promise<HTMLElement | null> {
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
            return candidate;
          }
        }
      }
      await Helpers.delay(400);
    }

    return null;
  }

  static async ensurePropertyTabActive(
    tabGroup: HTMLElement,
    desiredTab: 'residencial' | 'comercial',
    logger: Logger
  ): Promise<{ contentRoot: HTMLElement | null; selectedTab: string }> {
    const allTabs = Array.from(tabGroup.querySelectorAll('[role="tab"]')) as HTMLElement[];
    let desiredTabElement: HTMLElement | null = null;
    let currentActiveTab = tabGroup.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement | null;

    // Encontra a aba que queremos clicar
    for (const tab of allTabs) {
      const text = Helpers.normalizeText(tab.textContent);
      if (text.includes(desiredTab)) {
        desiredTabElement = tab;
        break;
      }
    }

    // Se a aba ativa não é a que queremos, clica na aba desejada
    if (desiredTabElement && (!currentActiveTab || currentActiveTab !== desiredTabElement)) {
      log(logger, ` Alternando para a aba "${desiredTab}" antes de extrair os resultados.`);
      flush(logger);
      // Clica na aba, ou no seu título interno se existir
      const clickTarget = desiredTabElement.querySelector('.bb-tab-title') || desiredTabElement;

      clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      // Usa o método .click() se disponível, senão dispara um evento de clique
      if (typeof (clickTarget as HTMLElement).click === 'function') {
        (clickTarget as HTMLElement).click();
      } else {
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }

      await Helpers.delay(450); // Aguarda a animação de troca de aba
      currentActiveTab = desiredTabElement; // Assume que o clique foi bem-sucedido e atualiza a referência
    }

    // Se ainda não há referência de aba ativa (ex: página acabou de carregar), usa a aba desejada se encontrada, ou a primeira
    if (!currentActiveTab) {
      currentActiveTab = desiredTabElement || allTabs[0];
    }

    // Se ainda assim não encontramos *nenhuma* aba, temos um problema.
    if (!currentActiveTab) {
      log(logger, `Não foi possível encontrar nenhuma aba para ativar.`);
      flush(logger);
      // Retorna o pai do tabGroup como último recurso para busca, já que o painel é provavelmente um irmão
      return { contentRoot: tabGroup.parentElement, selectedTab: desiredTab };
    }

    // Determina o nome em string ("residencial" ou "comercial") da aba *realmente* selecionada
    const activeTabText = Helpers.normalizeText(currentActiveTab.textContent);
    const selectedTab = activeTabText.includes('comercial') ? 'comercial' : 'residencial';

    // Encontra o painel pelo ID 'aria-controls'
    // O painel NÃO é filho do tabGroup, está vinculado por um ID.
    const panelId = currentActiveTab.getAttribute('aria-controls');
    if (panelId) {
      // Painéis são controlados a nível de documento pelo ID, não pela hierarquia DOM
      const panel = document.getElementById(panelId);
      if (panel instanceof HTMLElement) {
        log(logger, `Encontrado painel da aba ativa #${panelId} para a aba "${selectedTab}"`);
        flush(logger);
        return { contentRoot: panel, selectedTab };
      }
    }

    // Se a busca por ID falhar, é um erro.
    log(logger, `Não foi possível encontrar o painel pelo ID "${panelId}" para a aba "${selectedTab}". Retornando o pai do tabGroup como último recurso.`);
    flush(logger);
    // Retorna o pai do tabGroup, já que o painel é provavelmente um irmão.
    return { contentRoot: tabGroup.parentElement, selectedTab };
  }

  static extractCardResultsFromRoot(
    contentRoot: HTMLElement,
    selectedTab: string,
    entryCurrencyValue: string
  ): Array<Record<string, any>> {
    const cardSelector = 'bb-card, .bb-card, bb-card-default, bb-sugestao-card, custom-card div[id="card"], custom-card .m-3.p-3, custom-card [data-card]';
    // Se o contentRoot for nulo, busca no documento inteiro como último recurso
    const searchContext = contentRoot || document.body;
    const rawCards = Array.from(searchContext.querySelectorAll(cardSelector));
    const seen = new Set<Element>();
    const cards = rawCards.filter(card => {
      if (seen.has(card)) return false;
      seen.add(card);
      return true;
    });
    const results: Array<Record<string, any>> = [];

    cards.forEach((card, index) => {
      // Gerar o nome da opção com base na aba e no índice
      const optionName = `${Helpers.capitalizeWords(selectedTab)} Opção ${index + 1}`;

      const entry: Record<string, any> = {
        tipo_amortizacao: optionName,
        tab_origem: selectedTab,
        valor_entrada: entryCurrencyValue,
      };

      const hasStructuredBody = Boolean(card.querySelector('.bb-card-body'));

      if (hasStructuredBody) {
        // Bloco para cards com estrutura .bb-card-body
        const parcelaNode = card.querySelector('bb-title h1, h1');
        if (parcelaNode) {
          entry.parcela = parcelaNode.textContent?.replace(/\s+/g, ' ').trim();
        }

        const fields = Array.from(card.querySelectorAll('.bb-card-body .info-item, .bb-card-body .info'));
        fields.forEach(field => {
          const label = Helpers.normalizeText(field.querySelector('.info-label, .label')?.textContent);
          const value = field.querySelector('.info-value, .value')?.textContent?.trim() || '';
          if (!label) return;

          if (label.includes('parcela')) entry.parcela = value;
          if (label.includes('juros efetivo')) entry.juros_efetivos = value;
          if (label.includes('juros nominal')) entry.juros_nominais = value;
          if (label.includes('prazo')) entry.prazo = value;
          if (label.includes('valor total')) entry.valor_total = value;
          if (label.includes('valor solicitado')) {
            entry.valor_total = value;
            entry.valor_solicitado = value;
          }
          if (label.includes('taxa de juros')) {
            entry.taxa_juros = value;
            entry.juros_nominais = entry.juros_nominais || value;
          }
          if (label.includes('entrada')) entry.valor_entrada = value || entryCurrencyValue;
        });

      } else {
        // Bloco para a estrutura de card fornecida no HTML (custom-card)
        const parcelaValue = card.querySelector('bb-title h1, h1')?.textContent?.replace(/\s+/g, ' ').trim();
        if (parcelaValue) {
          entry.parcela = parcelaValue;
        }

        const infoRows = Array.from(card.querySelectorAll('.d-flex.justify-content-between'));
        infoRows.forEach(row => {
          const labelNode = row.querySelector('bb-caption, .bb-caption, label, span');
          const valueNode = row.querySelector('bb-label, .bb-label, label + span, label + strong, span + span');
          const label = Helpers.normalizeText(labelNode?.textContent);
          const value = valueNode?.textContent?.replace(/\s+/g, ' ').trim() || '';
          if (!label || !value) return;

          if (label.includes('valor solicitado')) {
            entry.valor_total = value;
            entry.valor_solicitado = value;
          }
          if (label.includes('prazo')) entry.prazo = value;
          if (label.includes('taxa de juros')) {
            entry.taxa_juros = value;
            entry.juros_nominais = value;
          }
          if (label.includes('entrada')) {
            entry.valor_entrada = value;
          }
        });
      }

      results.push(entry);
    });

    return results;
  }


  static extractCustomSummary(summaryContainer: HTMLElement): Record<string, any> | null {
    const chipElements = Array.from(summaryContainer.querySelectorAll('bb-text-chip'));
    if (chipElements.length === 0) {
      return null;
    }

    const infoMap: Record<string, string> = {};

    chipElements.forEach(chip => {
      const descriptionAttr = chip.getAttribute('description');
      const descriptionText = chip.querySelector('.description')?.textContent || descriptionAttr || '';
      const valueText = chip.querySelector('.content')?.textContent || chip.textContent || '';
      const key = Helpers.normalizeText(descriptionText);
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
      tipo_amortizacao: `Opção com prazo de ${prazo}\n
                                  Valor das parcelas: ${parcela}` ,
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

  static resolveEntryNumeric(fields: Record<string, any>): number | null {
    return Helpers.parseMonetaryCandidate(fields?.valor_entrada);
  }

  static resolveValorImovelNumeric(fields: Record<string, any>): number | null {
    return Helpers.parseMonetaryCandidate(fields?.valor_imovel);
  }

  static resolveCustomValorDigits(fields: Record<string, any>): string {
    const numeric = this.resolveEntryNumeric(fields);
    if (numeric === null) return '';
    return String(Math.round(numeric * 100));
  }

  static resolveCustomPrazo(fields: Record<string, any>): string {
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

  static async runCustomSimulationFlow(
    targetFields: Record<string, any>,
    entryDigits: string,
    entryCurrency: string | null,
    logger: Logger,
    selectCache: SelectCache
  ): Promise<Record<string, any> | null> {
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
          const candidate = await this.waitForElementEnabled(selector, 8000);
          if (!candidate) continue;
          const text = Helpers.normalizeText((candidate as HTMLElement).textContent);
          if (text.includes('fazer do meu jeito') || selector === '#botao' || selector === 'button#botao') {
            customButton = candidate as HTMLElement;
            break;
          }
        }

        if (customButton) {
          log(logger, ' Clicando no botão "Fazer do meu jeito" para abrir o formulário personalizado.');
          flush(logger);
          customButton.click();
          await Helpers.delay(500);
        } else {
          log(logger, ' Botão de simulação personalizada não encontrado ou desabilitado.');
          flush(logger);
          return null;
        }
      }

      formHost = await this.waitForElement('custom-form-fazer-do-meu-jeito form#form, custom-form-fazer-do-meu-jeito form', 20000) as HTMLElement | null;
      if (!formHost) {
        log(logger, ' Formulário de simulação personalizada não encontrado.');
        flush(logger);
        return null;
      }

      (formHost as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      await Helpers.delay(400);

      let valorDigits = entryDigits || this.resolveCustomValorDigits(targetFields);
      let prazoDigits = this.resolveCustomPrazo(targetFields);
      let currentEntryCurrency = entryCurrency;

      if (!valorDigits) {
        log(logger, ' Pulando simulação personalizada: valor_entrada/valor_imovel não fornecido.');
        flush(logger);
        return null;
      }

      if (!prazoDigits) {
        log(logger, ' Pulando simulação personalizada: informação de prazo não fornecida.');
        flush(logger);
        return null;
      }

      const propertyValue = this.resolveValorImovelNumeric(targetFields);
      if (valorDigits && propertyValue !== null && Number.isFinite(propertyValue) && propertyValue > 0) {
        const minEntryValue = propertyValue * 0.05;
        const maxEntryValue = propertyValue * 0.55;
        const minDigits = Math.round(minEntryValue * 100);
        const maxDigits = Math.round(maxEntryValue * 100);
        const minDisplay = Helpers.formatCurrencyFromCents(String(minDigits));
        const maxDisplay = Helpers.formatCurrencyFromCents(String(maxDigits));
        log(logger, ` Faixa prevista para a entrada: ${minDisplay} – ${maxDisplay} (5% a 55% do valor do imóvel).`);
        flush(logger);
        const valorNumeric = Number(valorDigits) / 100;
        let adjustReason: string | null = null;
        let adjustedValue = valorNumeric;
        if (valorNumeric < minEntryValue) {
          adjustedValue = minEntryValue;
          adjustReason = 'mínimo de 5% do valor do imóvel';
        } else if (valorNumeric > maxEntryValue) {
          adjustedValue = maxEntryValue;
          adjustReason = 'máximo de 55% do valor do imóvel';
        }
        if (adjustReason) {
          const adjustedDigits = String(Math.round(adjustedValue * 100));
          const adjustedDisplay = Helpers.formatCurrencyFromCents(adjustedDigits);
          log(logger, ` Ajustando valor de entrada para ${adjustedDisplay} (${adjustReason}).`);
          flush(logger);
          valorDigits = adjustedDigits;
          currentEntryCurrency = adjustedDisplay;
        }
      }

      const PRAZO_MAX = 238;
      if (prazoDigits) {
        const prazoNumeric = Number(prazoDigits);
        if (Number.isFinite(prazoNumeric) && prazoNumeric > PRAZO_MAX) {
          log(logger, ` Ajustando prazo da simulação personalizada para ${PRAZO_MAX} meses (limite detectado).`);
          flush(logger);
          prazoDigits = String(PRAZO_MAX);
        }
      }

      await this.withSelectors(
        [
          'custom-form-fazer-do-meu-jeito bb-money-field[formcontrolname="valor"] input',
          'custom-form-fazer-do-meu-jeito input[placeholder="0,00"]',
          'bb-money-field[formcontrolname="valor"] input',
          '#form bb-money-field input'
        ],
        async (selector) => this.simulateNaturalInput(
          selector,
          valorDigits,
          logger,
          120,
          1, // Tenta preencher apenas uma vez
          {
            typePerChar: true,
            clearExisting: true,
            perCharDelay: 70
            // Nenhuma validação de valor final
          }
        ),
        'Custom Valor',
        logger
      );

      // Não verifica se o valor foi preenchido, continua cegamente

      await this.withSelectors(
        [
          'custom-form-fazer-do-meu-jeito input[formcontrolname="prazo"]',
          'custom-form-fazer-do-meu-jeito input[inputmode="numeric"]',
          '#form input[formcontrolname="prazo"]',
          '#form input[placeholder*="prazo"]'
        ],
        async (selector) => this.simulateNaturalInput(
          selector,
          prazoDigits,
          logger,
          120,
          1, // Tenta preencher apenas uma vez
          {
            typePerChar: true,
            clearExisting: true,
            perCharDelay: 80
            // Nenhuma validação de valor final
          }
        ),
        'Custom Prazo',
        logger
      );

      // Não verifica se o prazo foi preenchido, continua cegamente

      const advanceButton = await this.waitForElementEnabled('#botao-segundo, button#botao-segundo, custom-form-fazer-do-meu-jeito button.bb-button.primary', 8000);
      if (!advanceButton) {
        log(logger, ' Botão de avançar da simulação personalizada não está disponível.');
        flush(logger);
        return null;
      }

      (advanceButton as HTMLElement).click();
      await Helpers.delay(1500);

      const summaryHost = await this.waitForElement('bb-card-body resumo, resumo, custom-resumo, resumo[ng-reflect-title]', 20000);
      if (!summaryHost) {
        log(logger, ' Resumo da simulação personalizada não detectado após avançar.');
        flush(logger);
        return null;
      }

      const summary = this.extractCustomSummary(summaryHost as HTMLElement);
      if (summary) {
        log(logger, ' Resumo da simulação personalizada capturado.');
        flush(logger);
      } else {
        log(logger, ' Falha ao analisar o conteúdo do resumo da simulação personalizada.');
        flush(logger);
      }

      if (summary) {
        const finalEntryValue = currentEntryCurrency ?? (valorDigits ? Helpers.formatCurrencyFromCents(valorDigits) : 'R$ 0,00');
        summary.valor_entrada = finalEntryValue;
      }

      return summary;
    } catch (error: any) {
      log(logger, ` Fluxo de simulação personalizada gerou uma exceção: ${error?.message || error}`);
      flush(logger);
      return null;
    }
  }
}