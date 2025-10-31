import type { Logger } from './BBHelpers';
import { Helpers } from './Helpers';
import { MAX_AUTOMATION_ATTEMPTS } from '../lib/constants';
import { SimulationPayload } from '../lib/SimulationPayload';

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

  static checkForSecondStepErrorDialog(logger: Logger): boolean {
    const errorDialog = document.querySelector('#ui-id-34.ui-dialog-content.ui-widget-content');

    if (errorDialog) {
      const errorText = errorDialog.textContent?.trim();
      log(logger, `Diálogo de erro #ui-id-34 encontrado com o texto: "${errorText}"`);

      if (errorText?.includes('Campo obrigatório não informado')) {
        log(logger, 'Diálogo de erro contém "Campo obrigatório não informado" - fechando diálogo');
        this.closeParentDialog(errorDialog, logger);
        return true;
      }
    }

    const allDialogs = document.querySelectorAll('.ui-dialog-content, [class*="ui-dialog"]');
    for (const dialog of allDialogs) {
      const dialogText = dialog.textContent?.trim();
      if (dialogText?.includes('Campo obrigatório não informado')) {
        log(logger, `Diálogo de erro encontrado com a classe "${dialog.className}" contendo o texto de erro - fechando diálogo`);
        this.closeParentDialog(dialog, logger);
        return true;
      }
    }

    return false;
  }

  static normalizeTipoAmortizacao(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;

    const hasWarning = /ATEN[ÇC][AÃ]O!?/i.test(value);
    const withoutWarning = value
      .replace(/ATEN[ÇC][AÃ]O!?/gi, '')
      .replace(/!/g, ' ');
    const cleaned = withoutWarning
      .replace(/^[\s\-:]+/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) {
      if (!hasWarning) {
        return Helpers.capitalizeWords(value.toLocaleLowerCase('pt-BR'));
      }
      return null;
    }

    return Helpers.capitalizeWords(cleaned.toLocaleLowerCase('pt-BR'));
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

  static async goBackFromErrorPage(logger: Logger): Promise<void> {
    try {
      const backButton = document.querySelector('button[onclick*="voltarTelaEnquadrar"]');
      if (backButton) {
        log(logger, ' Clicando no botão voltar da página de ERRO: button[onclick*="voltarTelaEnquadrar"]');
        (backButton as HTMLElement).click();
        await Helpers.delay(2000);
      } else {
        log(logger, ' Não foi possível encontrar o botão voltar na página de erro.');
      }
    } catch (error: any) {
      log(logger, ` Erro ao voltar da página de erro: ${error.message}`);
    }
  }

  static async goBackFromSuccessPage(logger: Logger): Promise<void> {
    try {
      const backButton = document.querySelector('#botaoVoltar');
      if (backButton) {
        log(logger, ' Clicando no botão voltar da página de SUCESSO: #botaoVoltar');
        (backButton as HTMLElement).click();
        await Helpers.delay(2000);
      } else {
        log(logger, ' Não foi possível encontrar o botão voltar na página de sucesso.');
      }
    } catch (error: any) {
      log(logger, ` Erro ao voltar da página de sucesso: ${error.message}`);
    }
  }

  static async extractTableData(optionName: string, logger: Logger): Promise<ReturnType<typeof SimulationPayload.ensureEntry> | null> {
    try {
      log(logger, ' Procurando por table.simple-table...');
      const table = document.querySelector('table.simple-table');

      if (!table) {
        log(logger, ' Nenhuma table.simple-table encontrada, verificando outros tipos de tabela...');
        const allTables = document.querySelectorAll('table');
        log(logger, ` Encontradas ${allTables.length} tabelas no total`);
        allTables.forEach((t, i) => {
          log(logger, ` Tabela ${i + 1}: class="${t.className}" linhas=${t.querySelectorAll('tr').length}`);
        });
        return null;
      }

      log(logger, ` Tabela de resultados encontrada para a opção "${optionName}" com ${table.querySelectorAll('tr').length} linhas`);

      const rows = table.querySelectorAll('tr');
      const tableData: any = {
        tipo_amortizacao: optionName,
        prazo: null,
        valor_total: null,
        valor_entrada: null,
        juros_nominais: null,
        juros_efetivos: null,
      };

      rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const key = (cells[0].textContent?.trim() || '').toLowerCase();
          const valueCell = cells[1];

          const centerTag = valueCell.querySelector('center');
          const value = (centerTag?.textContent?.trim() || valueCell.textContent?.trim() || '').replace(/\s+/g, ' ');

          log(logger, ` Linha ${rowIndex + 1}: "${key}" = "${value}"`);

          if (key && value) {
            if (key.includes('amortiza')) {
              const candidate = value || optionName;
              tableData.tipo_amortizacao = (candidate || '').trim();
              log(logger, ` Mapeado tipo_amortizacao: ${tableData.tipo_amortizacao}`);
            } else if (key.includes('prazo') && key.includes('escolhido')) {
              tableData.prazo = value;
              log(logger, ` Mapeado prazo: ${tableData.prazo}`);
            } else if (key.includes('financiamento') && key.includes('valor')) {
              tableData.valor_total = value;
              log(logger, ` Mapeado valor_total: ${tableData.valor_total}`);
            } else if (key.includes('entrada') && key.includes('valor')) {
              tableData.valor_entrada = value;
              log(logger, ` Mapeado valor_entrada: ${tableData.valor_entrada}`);
            }
          }
        }
      });

      try {
        log(logger, ' Procurando por taxas de juros usando XPath...');

        const jurosNominaisXPath = "//td[contains(., 'Juros Nominais')]/following-sibling::td/center";
        const jurosNominaisResult = document.evaluate(
          jurosNominaisXPath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );

        if (jurosNominaisResult.singleNodeValue) {
          tableData.juros_nominais = jurosNominaisResult.singleNodeValue.textContent?.trim();
          log(logger, ` Encontrados juros nominais: ${tableData.juros_nominais}`);
        } else {
          log(logger, ' Não foi possível encontrar juros nominais');
        }

        const jurosEfetivosXPath = "//td[contains(., 'Juros Efetivos')]/following-sibling::td/center";
        const jurosEfetivosResult = document.evaluate(
          jurosEfetivosXPath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );

        if (jurosEfetivosResult.singleNodeValue) {
          tableData.juros_efetivos = jurosEfetivosResult.singleNodeValue.textContent?.trim();
          log(logger, ` Encontrados juros efetivos: ${tableData.juros_efetivos}`);
        } else {
          log(logger, ' Não foi possível encontrar juros efetivos');
        }
      } catch (error) {
        log(logger, ` Não foi possível extrair taxas de juros: ${error}`);
      }

      const normalizedTipo = this.normalizeTipoAmortizacao(tableData.tipo_amortizacao);
      if (normalizedTipo !== null) {
        tableData.tipo_amortizacao = normalizedTipo;
        log(logger, ` Tipo de amortização normalizado para "${tableData.tipo_amortizacao}"`);
      } else if (tableData.tipo_amortizacao) {
        tableData.tipo_amortizacao = null;
        log(logger, ' Tipo de amortização limpo resultou vazio. Valor removido para evitar alerta residual.');
      }

      log(logger, ` Dados finais da tabela: ${JSON.stringify(tableData)}`);
      return SimulationPayload.ensureEntry(tableData, 'caixa');
    } catch (error: any) {
      log(logger, ` Erro ao extrair dados da tabela: ${error.message}`);
      return null;
    }
  }
}
