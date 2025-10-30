import type { Logger } from './BBHelpers';
import { Helpers } from './Helpers';
import { MAX_AUTOMATION_ATTEMPTS } from '../lib/constants';

const log = (logger: Logger, message: string) => {
  logger.registerLog(message);
};

const flush = (logger: Logger) => {
  logger.printLogs();
};

export class CaixaHelpers {
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
        const el = document.querySelector(selector) as HTMLInputElement;
        if (el && !el.disabled) return resolve(el);
        if (Date.now() - start > timeout) return resolve(null);
        setTimeout(check, 200);
      }
      check();
    });
  }

  static closeParentDialog(node: Element | null, logger: Logger): void {
    if (!node) return;
    const dialogContainer = node.closest('.ui-dialog') as HTMLElement | null;
    const closeButton = dialogContainer?.querySelector('.ui-dialog-titlebar-close') as HTMLButtonElement | null;

    if (closeButton) {
      closeButton.click();
      log(logger, ' Diálogo de erro fechado pelo botão de fechar do título.');
    } else if (dialogContainer) {
      dialogContainer.style.display = 'none';
      log(logger, ' Ocultado contêiner do diálogo (botão de fechar não encontrado).');
    }
  }

  static checkForErrorDialog(logger: Logger): void {
    const allDialogs = document.querySelectorAll('.ui-dialog-content, [class*="ui-dialog"]');
    for (const dialog of allDialogs) {
      const dialogText = dialog.textContent?.trim();
      if (dialogText?.includes('Campo obrigatório não informado')) {
        log(logger, `Diálogo de erro encontrado com a classe "${dialog.className}" contendo o texto de erro - fechando e tentando novamente`);
        this.closeParentDialog(dialog, logger);
        throw new Error("Diálogo de 'Campo obrigatório não informado' detectado.");
      }
    }
  }

  static async setInstantValue(selector: string, value: string, logger: Logger, isSelect = false): Promise<void> {
    const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
    if (!el) {
      log(logger, ` Elemento não encontrado: ${selector}`);
      return;
    }

    log(logger, ` Definindo ${selector} instantaneamente para: "${value}"`);

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
  }

  static async simulateNaturalInput(
    selector: string,
    value: string,
    logger: Logger,
    delay = 500,
    retries = MAX_AUTOMATION_ATTEMPTS
  ): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
        if (!el) {
          throw new Error(`Elemento não encontrado para o seletor: ${selector}`);
        }

        log(logger, ` Simulando input para ${selector} com valor "${value}" (Tentativa ${i + 1})`);

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
        await wait(delay);

        const enterEventDown = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });
        const enterEventPress = new KeyboardEvent('keypress', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });
        const enterEventUp = new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });

        log(logger, ` Simulando "Enter" (1ª vez) para ${selector}.`);
        targetInput.dispatchEvent(enterEventDown);
        targetInput.dispatchEvent(enterEventPress);
        targetInput.dispatchEvent(enterEventUp);
        await wait(200);

        log(logger, ` Simulando "Enter" (2ª vez) para ${selector}.`);
        targetInput.dispatchEvent(enterEventDown);
        targetInput.dispatchEvent(enterEventPress);
        targetInput.dispatchEvent(enterEventUp);

        if (el.tagName === 'SELECT') {
          dispatchEvent(el, 'change');
        }

        targetInput.blur();

        await wait(delay);

        let finalValue = '';
        if (el.tagName === 'SELECT') {
          const comboboxInput = document.querySelector(`#${el.id}_input`) as HTMLInputElement;
          if (comboboxInput) {
            finalValue = comboboxInput.value;
          } else {
            finalValue = (el as HTMLSelectElement).value;
          }
        } else {
          finalValue = (el as HTMLInputElement).value;
        }

        if (finalValue.trim() !== '') {
          log(logger, ` Sucesso: ${selector} tem o valor "${finalValue}". Assumindo sucesso.`);
          flush(logger);
          return;
        } else {
          throw new Error(`Falha ao verificar valor para ${selector}. Campo está vazio.`);
        }
      } catch (error: any) {
        log(logger, ` Tentativa ${i + 1} falhou para ${selector}: ${error.message}`);
        flush(logger);
        if (i === retries - 1) {
          throw new Error(` Todas as ${retries} tentativas falharam para o seletor: ${selector}`);
        }
        await Helpers.delay(1000);
      }
    }
  }

  static async simulateAutocomplete(
    selector: string,
    value: string,
    logger: Logger,
    selectCache: Map<string, { lookup: Record<string, string>; optionsHash: string }>,
    delay = 500
  ): Promise<void> {
    try {
      const el = document.querySelector(selector) as HTMLSelectElement;
      if (!el) {
        throw new Error(`Elemento não encontrado para o seletor: ${selector}`);
      }

      log(logger, ` Preparando seleção de ${selector} com valor "${value}"`);
      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      const dispatchEvent = (element: Element, eventName: string) => {
        element.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
      };

      const options = el.querySelectorAll('option');
      const optionsHash = Array.from(options)
        .map(opt => opt.value + ':' + opt.textContent)
        .join('|');

      let cityLookup: Record<string, string>;
      const cached = selectCache.get(selector);

      if (cached && cached.optionsHash === optionsHash) {
        cityLookup = cached.lookup;
        log(logger, ` Usando cache de pesquisa para ${selector} (${Object.keys(cityLookup).length} cidades)`);
      } else {
        cityLookup = {};
        log(logger, ` Construindo nova tabela de pesquisa para ${selector} (${options.length} opções)...`);

        for (let i = 0; i < options.length; i++) {
          const option = options[i];
          const optionText = option.textContent?.trim().toUpperCase() || '';
          const optionValue = option.value;
          if (optionText && optionValue) {
            cityLookup[optionText] = optionValue;
          }
        }

        selectCache.set(selector, {
          lookup: cityLookup,
          optionsHash: optionsHash,
        });
        log(logger, ` Cache de pesquisa salvo com ${Object.keys(cityLookup).length} cidades`);
      }

      const normalizedValue = value.trim().toUpperCase();
      let optionValue = cityLookup[normalizedValue];
      let matchedCity = normalizedValue;

      if (!optionValue) {
        const cityNames = Object.keys(cityLookup);

        for (let i = 0; i < cityNames.length; i++) {
          const cityName = cityNames[i];
          if (cityName.includes(normalizedValue)) {
            optionValue = cityLookup[cityName];
            matchedCity = cityName;
            break;
          }
        }

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
          log(logger, ` Correspondência encontrada: "${normalizedValue}" → "${matchedCity}"`);
        }
      }

      if (!optionValue) {
        const availableCities = Object.keys(cityLookup).slice(0, 10).join(', ');
        log(logger, ` Cidades disponíveis (10 primeiras): ${availableCities}...`);
        throw new Error(`Cidade "${value}" não encontrada nas opções disponíveis`);
      }

      const comboboxInputId = el.getAttribute('inputid') || `${el.id}_input`;
      const comboboxInput = document.querySelector(`#${comboboxInputId}`) as HTMLInputElement;
      let usedClick = false;

      if (comboboxInput) {
        comboboxInput.focus();
        comboboxInput.value = '';
        dispatchEvent(comboboxInput, 'input');

        const typeKey = async (char: string) => {
          const key = char;
          const upper = char.toUpperCase();
          const code = upper >= 'A' && upper <= 'Z'
            ? `Key${upper}`
            : char === ' '
              ? 'Space'
              : undefined;
          comboboxInput.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }));
          comboboxInput.value = `${comboboxInput.value}${char}`;
          dispatchEvent(comboboxInput, 'input');
          comboboxInput.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true, cancelable: true }));
          await wait(40);
        };

        for (const char of matchedCity) {
          await typeKey(char);
        }

        const menuId = comboboxInput.getAttribute('aria-owns');
        let suggestion: HTMLElement | null = null;
        for (let attempt = 0; attempt < 10 && !suggestion; attempt++) {
          await wait(120);
          let menu: HTMLElement | null = null;
          if (menuId) {
            menu = document.getElementById(menuId) as HTMLElement | null;
          }
          if (!menu) {
            menu = document.querySelector(".ui-autocomplete:not([style*='display: none'])") as HTMLElement | null;
          }
          if (!menu) {
            continue;
          }
          const items = Array.from(menu.querySelectorAll('li.ui-menu-item')) as HTMLElement[];
          const normalizedTarget = matchedCity.toUpperCase();
          suggestion = items.find(item => (item.textContent?.trim().toUpperCase() || '').includes(normalizedTarget)) || null;
        }

        if (suggestion) {
          log(logger, ` Clicando na sugestão "${suggestion.textContent?.trim().toUpperCase()}" para ${selector}`);
          const clickable = (suggestion.querySelector('a') as HTMLElement | null) || suggestion;
          clickable.click();
          usedClick = true;
          await wait(delay);
        } else {
          log(logger, ` Nenhuma sugestão encontrada para ${selector}. Usando seleção direta.`);
        }
      } else {
        log(logger, ` Input do combobox não encontrado para ${selector}. Usando seleção direta.`);
      }

      if (!usedClick) {
        el.value = optionValue;
        dispatchEvent(el, 'change');
        if (comboboxInput) {
          comboboxInput.value = matchedCity;
          dispatchEvent(comboboxInput, 'input');
          dispatchEvent(comboboxInput, 'change');
        }
        await wait(delay);
      } else {
        dispatchEvent(el, 'change');
      }

      const selectedOption = el.selectedOptions[0];
      if (selectedOption && selectedOption.value === optionValue) {
        log(logger, ` Sucesso: Definido ${selector} para "${selectedOption.text}" (valor: ${optionValue})`);
        flush(logger);
      } else {
        throw new Error(`Falha ao definir o valor para ${selector}`);
      }
    } catch (error: any) {
      log(logger, ` Falha ao definir ${selector}: ${error.message}`);
      flush(logger);
      throw error;
    }
  }
}

