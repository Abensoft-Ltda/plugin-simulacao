import React, { useState, useEffect } from "react";
import { getConfig } from "./config";

interface LoginScreenProps {
  onAuthenticated: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated }) => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  useEffect(() => {
    setIsAnimating(true);
    handleAuthenticate();

    // Listen for storage changes - simple and direct
    const handleStorageChange = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes.authToken && changes.authToken.newValue) {
        console.log("[LoginScreen] Auth token detected, authenticating...");
        onAuthenticated();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [onAuthenticated]);

  const checkExistingAuth = async () => {
    try {
      console.log("[LoginScreen] Checking existing auth...");
      const result = await chrome.storage.local.get([
        "authToken",
        "authExpiry",
        "sessionData",
      ]);
      console.log("[LoginScreen] Stored auth data:", result);
      console.log("[LoginScreen] Current time:", new Date().getTime());
      console.log("[LoginScreen] Token expiry:", result.authExpiry);
      console.log(
        "[LoginScreen] Time until expiry:",
        result.authExpiry
          ? (result.authExpiry - new Date().getTime()) / 1000 / 60
          : "no expiry"
      );

      if (
        result.authToken &&
        result.authExpiry &&
        new Date().getTime() < result.authExpiry
      ) {
        console.log("[LoginScreen] Valid auth found, auto-logging in...");
        onAuthenticated();
        return;
      } else {
        if (!result.authToken) {
          console.log("[LoginScreen] No authToken found");
        }
        if (!result.authExpiry) {
          console.log("[LoginScreen] No authExpiry found");
        }
        if (result.authExpiry && new Date().getTime() >= result.authExpiry) {
          console.log("[LoginScreen] Token expired");
        }
      }

      console.log("[LoginScreen] Cleaning up invalid auth...");
      await cleanLocalStorage();
    } catch (error) {
      console.log("[LoginScreen] No existing auth found:", error);
      await cleanLocalStorage();
    }
  };

  const cleanLocalStorage = async () => {
    await chrome.storage.local.remove([
      "authToken",
      "authExpiry",
      "sessionData",
      "lastValidated",
      "validatedSession",
    ]);
  };

  const handleAuthenticate = async () => {
    setIsAuthenticating(true);

    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const config = await getConfig();

      if (tabs[0]?.url?.includes("superleme")) {
        // Execute script to get cookies from Superleme
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id! },
          args: [config.urlSuperleme],
          func: (urlSuperleme: string) => {
            // Check if we're on the Superleme page
            if (window.location.href.includes(urlSuperleme)) {
              // Get cookies
              const allCookies = document.cookie.split(";");

              const getCookie = (name: string) => {
                const cookie = allCookies.find((cookie) =>
                  cookie.includes(name)
                );
                return cookie ? cookie.split("=")[1] : null;
              };

              const cotonicSid = getCookie("cotonic-sid");
              const zAuth = getCookie("z.auth");
              const zLang = getCookie("z.lang");
              const zTz = getCookie("z.tz");
              const timezone = getCookie("timezone");

              return {
                cotonicSid,
                zAuth,
                zLang,
                zTz,
                timezone,
              };
            }
            return null;
          },
        });

        const cookieData = results[0].result;

        if (cookieData && cookieData.cotonicSid && cookieData.zAuth) {
          console.log(
            "[LoginScreen] Cookies extracted successfully:",
            cookieData
          );

          // Store auth data
          const authData = {
            authToken: cookieData.zAuth,
            authExpiry: new Date().getTime() + 24 * 60 * 60 * 1000, // 24 hours
            sessionData: cookieData,
          };

          console.log("[LoginScreen] Storing auth data...");
          await chrome.storage.local.set(authData);

          console.log("[LoginScreen] Sending to background script...");

          try {
            (chrome.runtime.sendMessage as any)({
              action: "cotonicSid",
              value: cookieData,
            }).catch?.(() => {});
          } catch (_) {
            // ignore errors when runtime/sendMessage isn't available synchronously
          }

          console.log("[LoginScreen] Authentication successful!");
          onAuthenticated();
        } else {
          throw new Error("Authentication cookies not found");
        }
      } else {
        setShowLoginPrompt(true);
      }
    } catch (error) {
      console.error("Authentication failed:", error);
      alert("Falha na autenticação. Por favor, tente novamente.");
      await cleanLocalStorage();
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLoginPromptYes = async () => {
    const config = await getConfig();
    chrome.tabs.create({
      url: `${config.urlSuperleme}`,
      active: true,
    });
    try {
      (chrome.runtime.sendMessage as any)({
        action: "keepSidebarOpen",
      }).catch?.(() => {});
    } catch (_) {
    }
    setShowLoginPrompt(false);
  };

  const handleLoginPromptNo = () => {
    setShowLoginPrompt(false);
  };

  const handleSupport = () => {
    chrome.tabs.create({
      url: "mailto:suporte@abensoft.com.br?subject=Suporte%20Simulador%20Habitacional",
      active: true,
    });
  };

  const logout = async () => {
    await cleanLocalStorage();
    window.location.reload();
  };

  return (
    <div
      className={`h-full w-full bg-gray-700 gap-5 p-6 flex flex-col text-white transition-all duration-500 ${
        isAnimating ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      {showLoginPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg max-w-sm mx-4">
            <h3 className="text-lg font-bold mb-4">Login Necessário</h3>
            <p className="text-sm mb-6">
              Você precisa fazer login no Superleme para continuar. Deseja abrir
              a página de login?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleLoginPromptYes}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white pt-2 pb-2 pl-4 pr-4 rounded transition-colors"
              >
                Sim
              </button>
              <button
                onClick={handleLoginPromptNo}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white pt-2 pb-2 pl-4 pr-4 rounded transition-colors"
              >
                Não
              </button>
            </div>
          </div>
        </div>
      )}
      <form
        className="flex flex-col items-center justify-center flex-1 space-y-6"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="flex justify-center items-center">
          <img
            src="images/icone_deauth.png"
            alt="Ícone de Autenticação"
            className={`w-16 h-16 sm:w-20 sm:h-20 md:w-[90px] md:h-[90px] transition-transform duration-300 ${
              isAuthenticating ? "animate-pulse scale-110" : "hover:scale-105"
            }`}
          />
        </div>

        <div className="w-full max-w-sm flex justify-center">
          <button
            type="button"
            onClick={handleAuthenticate}
            disabled={isAuthenticating}
            className="w-full bg-main-green hover:bg-green-600 disabled:bg-gray-500 text-white font-bold pt-3 pb-3 pl-4 pr-4 rounded-md transition-all duration-200 flex justify-center items-center transform hover:scale-105 active:scale-95"
          >
            {isAuthenticating ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Autenticando...
              </>
            ) : (
              "Autenticar"
            )}
          </button>
        </div>

        <p className="text-base text-center text-gray-300">
          Faça a autenticação para autorizar o preenchimento automático.
        </p>
      </form>

      <hr className="w-full h-px bg-gray-300 border-none" />

      <p className="text-base text-center">
        Precisa de ajuda?{" "}
        <button
          onClick={handleSupport}
          className="text-green-400 underline font-bold hover:text-green-300 transition-colors"
        >
          Clique aqui para falar com nosso suporte
        </button>
      </p>
    </div>
  );
};

export default LoginScreen;
