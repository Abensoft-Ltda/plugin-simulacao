import { getConfig } from '../config';
import { writeLog } from './logger';

type StoredAuthData = {
  authToken?: string;
  authExpiry?: number;
  sessionData?: Record<string, string>;
};

interface AuthServiceOptions {
  logPrefix?: string;
}

export class AuthService {
  private readonly logPrefix: string;

  constructor(options: AuthServiceOptions = {}) {
    this.logPrefix = options.logPrefix ?? '[AuthService]';
  }

  buildExtractAuthScript(): () => void {
    return function extractAuthInstaller() {
      const extractAuth = () => {
        const allCookies = document.cookie.split(';');

        const getCookie = (name: string): string | null => {
          const cookie = allCookies.find(item => item.trim().startsWith(`${name}=`));
          return cookie ? cookie.split('=').slice(1).join('=').trim() : null;
        };

        const getCookieByPattern = (pattern: string): { name: string | null; value: string | null } => {
          const cookie = allCookies.find(item => item.trim().includes(pattern));
          if (!cookie) return { name: null, value: null };
          const trimmed = cookie.trim();
          const eqIndex = trimmed.indexOf('=');
          return {
            name: trimmed.substring(0, eqIndex),
            value: trimmed.substring(eqIndex + 1),
          };
        };

        const cotonicSid = getCookie('cotonic-sid');
        const zAuth = getCookie('z.auth');

        if (cotonicSid && zAuth) {
          const hjSession = getCookieByPattern('_hjSession_');
          const hjSessionUser = getCookieByPattern('_hjSessionUser_');

          const sessionData: Record<string, string | null> = {
            'cotonic-sid': cotonicSid,
            'z.auth': zAuth,
            'z.lang': getCookie('z.lang'),
            'z.tz': getCookie('z.tz'),
            timezone: getCookie('timezone'),
            cf_clearance: getCookie('cf_clearance'),
          };

          if (hjSession.name && hjSession.value) {
            sessionData[hjSession.name] = hjSession.value;
          }
          if (hjSessionUser.name && hjSessionUser.value) {
            sessionData[hjSessionUser.name] = hjSessionUser.value;
          }

          const cleanedSessionData: Record<string, string> = {};
          Object.entries(sessionData).forEach(([key, value]) => {
            if (typeof value === 'string' && value.length > 0) {
              cleanedSessionData[key] = value;
            }
          });

          const authData = {
            authToken: zAuth,
            authExpiry: Date.now() + 24 * 60 * 60 * 1000,
            sessionData: cleanedSessionData,
          };

          window.postMessage({
            type: 'SUPERLEME_TO_BACKGROUND',
            payload: { action: 'storeAuth', authData },
          }, '*');
        }
      };

      extractAuth();
      setInterval(extractAuth, 2000);
    };
  }

  async validate(): Promise<boolean> {
    try {
      const config = await getConfig();

      if (config.isDevelopment) {
        this.log('Ambiente de desenvolvimento detectado - pulando validação de autenticação');
        return true;
      }

      const authData = await this.getStoredAuthData();

      if (!authData.sessionData || !authData.authToken) {
        this.log('Nenhum dado de autenticação encontrado no storage');
        return false;
      }

      if (authData.authExpiry && Date.now() > authData.authExpiry) {
        this.log('Token de autenticação expirado');
        await this.cleanStorage();
        return false;
      }

      const apiUrl = `${config.urlSuperleme}api/model/sl_cad_interacao_simulacao/get/acessos_agrupados_json`;

      this.log('Validando autenticação com o servidor...');

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (authData.sessionData) {
        const cookieParts: string[] = [];

        for (const [cookieName, cookieValue] of Object.entries(authData.sessionData)) {
          if (cookieValue) {
            cookieParts.push(`${cookieName}=${cookieValue}`);
          }
        }

        if (cookieParts.length > 0) {
          headers.Cookie = cookieParts.join('; ');
        }
      }

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers,
        credentials: 'include',
        mode: 'cors',
      });

      if (response.ok) {
        this.log('Autenticação validada com sucesso');
        return true;
      }

      this.log(`Falha na validação de autenticação. Status: ${response.status}`);
      await this.cleanStorage();
      return false;
    } catch (error) {
      this.log(`Erro na validação de autenticação: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async store(authData: StoredAuthData): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(authData, () => {
        if (chrome.runtime.lastError) {
          const message = chrome.runtime.lastError.message || 'Erro desconhecido ao salvar autenticação';
          this.log(`Erro ao salvar dados de autenticação: ${message}`);
          reject(new Error(message));
        } else {
          this.log('Dados de autenticação armazenados com sucesso');
          resolve();
        }
      });
    });
  }

  async cleanStorage(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove(['sessionData', 'authToken', 'authExpiry'], () => {
        this.log('Dados de autenticação removidos do storage');
        resolve();
      });
    });
  }

  async getStoredAuthData(): Promise<StoredAuthData> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['sessionData', 'authToken', 'authExpiry'], (result) => {
        resolve(result as StoredAuthData);
      });
    });
  }

  private log(message: string) {
    writeLog(`${this.logPrefix} ${message}`);
  }
}
