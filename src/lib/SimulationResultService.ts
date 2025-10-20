import { getConfig } from '../config';
import { writeLog } from './logger';
import { SimulationPayload, buildSimulationPayload } from './SimulationPayload';

interface SimulationResultServiceOptions {
  logPrefix?: string;
}

type AuthData = {
  sessionData?: Record<string, string>;
  authToken?: string;
  authExpiry?: number;
};

export class SimulationResultService {
  private readonly logPrefix: string;

  constructor(options: SimulationResultServiceOptions = {}) {
    this.logPrefix = options.logPrefix ?? '[SimulationResultService]';
  }

  async sendResultsToServer(simId: string, ifId: string, scrapedResults: any): Promise<any> {
    try {
      const payload = buildSimulationPayload(scrapedResults, ifId);

      if (!payload.hasEntries()) {
        payload.addFailure(`${SimulationPayload.normalizeIf(ifId)}: resultado vazio`);
      }

      const payloadJSON = payload.toJSON();

      const processedData = {
        target: payloadJSON.if,
        status: payloadJSON.status,
        data: {
          result: payloadJSON.result,
        },
      };

      this.log(`Resultados originais: ${JSON.stringify(scrapedResults, null, 2)}`);
      this.log(`Resultados processados: ${JSON.stringify(processedData, null, 2)}`);

      const simulationResult = {
        sim_id: simId,
        if_id: ifId,
        api_data: processedData,
      };

      this.log(`Armazenando resultado da simulação: sim_id=${simId}, if_id=${ifId}`);
      await this.storeResult(simulationResult);

      const config = await getConfig();
      const baseUrl = config.urlSuperleme;
      const apiUrl = `${baseUrl}api/model/sl_cad_interacao_simulacao/post/insert_simulacao`;

      this.log('Preparando envio de resultados ao servidor');
      this.log(`URL base: ${baseUrl}`);
      this.log(`URL completa da API: ${apiUrl}`);
      this.log(`Ambiente: ${config.isDevelopment ? 'desenvolvimento' : 'produção'}`);

      const authData = await this.getAuthData();
      this.log('Dados de autenticação recuperados do storage');
      this.log(`Possui sessionData: ${!!authData.sessionData}`);
      this.log(`Possui authToken: ${!!authData.authToken}`);

      if (authData.sessionData) {
        this.log(`Cookies disponíveis: ${Object.keys(authData.sessionData).join(', ')}`);
      }

      const headers = this.buildHeaders(authData.sessionData);

      const requestBody = {
        sim_id: simId,
        if_id: ifId,
        api_data: processedData,
      };

      this.log(`Corpo da requisição: ${JSON.stringify(requestBody, null, 2)}`);

      console.log(`${this.logPrefix} Iniciando fetch...`, {
        url: apiUrl,
        method: 'POST',
        headers,
        body: requestBody,
      });

      let response: Response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          credentials: 'include',
          mode: 'cors',
        });
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.warn(`${this.logPrefix} Fetch lançou erro que será ignorado:`, fetchError);
        this.log(`Fetch lançou erro que será ignorado: ${message}`);
        return { ignored: true, reason: 'fetch-error', message };
      }

      this.log(`Fetch concluído. Status: ${response.status}`);
      this.log(`Status text: ${response.statusText}`);
      this.log(`Headers da resposta: ${JSON.stringify([...response.headers.entries()])}`);

      if (response.ok) {
        const contentType = response.headers.get('Content-Type') || '';

        if (contentType.includes('application/json')) {
          const responseData = await response.json();
          console.log(`${this.logPrefix} Resultados enviados com sucesso. Resposta:`, responseData);
          this.log(`Resultados enviados com sucesso. Resposta: ${JSON.stringify(responseData)}`);
          return responseData;
        }

        const responseText = await response.text();
        console.log(`${this.logPrefix} Resultados enviados com sucesso. Resposta (texto):`, responseText);
        this.log(`Resultados enviados com sucesso. Resposta (texto): ${responseText}`);
        return { text: responseText };
      }

      const errorText = await response.text();
      if (response.status === 500 && errorText.toLowerCase().includes('timeout')) {
        console.warn(`${this.logPrefix} Servidor retornou timeout que será ignorado. Status:`, response.status, 'Body:', errorText);
        this.log(`Servidor retornou timeout que será ignorado. Status: ${response.status}, Body: ${errorText}`);
        return { ignored: true, status: response.status };
      }

      console.error(`${this.logPrefix} Servidor retornou erro. Status:`, response.status, 'Erro:', errorText);
      this.log(`Erro do servidor. Status: ${response.status}, Erro: ${errorText}`);
      throw new Error(`Erro do servidor ${response.status}: ${errorText}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error(`${this.logPrefix} Erro ao enviar resultados:`, error);
      this.log(`Erro ao enviar resultados: ${errorMessage}`);
      this.log(`Tipo do erro: ${error instanceof TypeError ? 'TypeError' : typeof error}`);

      if (errorStack) {
        this.log(`Stack do erro: ${errorStack}`);
      }

      if (error instanceof TypeError && errorMessage.includes('fetch')) {
        console.warn(`${this.logPrefix} Erro de rede/CORS - servidor pode estar inacessível ou sem headers apropriados.`);
        this.log('Provável erro de rede/CORS. O servidor pode estar inacessível ou sem headers apropriados.');
      }

      throw error;
    }
  }

  private log(message: string) {
    writeLog(`${this.logPrefix} ${message}`);
  }

  private storeResult(simulationResult: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ simulationResult }, () => {
        if (chrome.runtime.lastError) {
          this.log(`Erro ao salvar resultado: ${chrome.runtime.lastError.message}`);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.log('Resultado armazenado com sucesso no chrome.storage.local');
          resolve();
        }
      });
    });
  }

  private getAuthData(): Promise<AuthData> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['sessionData', 'authToken'], (result) => {
        resolve(result as AuthData);
      });
    });
  }

  private buildHeaders(sessionData?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'pt-BR,pt;q=0.9',
      'Content-Type': 'application/json',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      priority: 'u=0, i',
      'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };

    if (!sessionData) {
      this.log('ATENÇÃO: Nenhum sessionData encontrado - requisição pode falhar na autenticação');
      return headers;
    }

    const cookieParts: string[] = [];
    const cookieOrder = ['_hjSessionUser_3537769', 'cf_clearance', 'cotonic-sid', 'startHidden', 'timezone', 'z.auth', 'z.lang', 'z.tz'];

    for (const cookieName of cookieOrder) {
      if (sessionData[cookieName]) {
        cookieParts.push(`${cookieName}=${sessionData[cookieName]}`);
      }
    }

    for (const [cookieName, cookieValue] of Object.entries(sessionData)) {
      if (cookieValue && !cookieOrder.includes(cookieName)) {
        cookieParts.push(`${cookieName}=${cookieValue}`);
      }
    }

    if (cookieParts.length > 0) {
      headers.Cookie = cookieParts.join('; ');
      this.log(`Header Cookie montado com ${cookieParts.length} cookies`);
      this.log(`Cookies utilizados: ${Object.keys(sessionData).filter((key) => sessionData[key]).join(', ')}`);
    } else {
      this.log('Nenhum cookie adicionado aos headers');
    }

    return headers;
  }
}
