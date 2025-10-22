import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { LogViewer } from './LogViewer';
import { useAutomation } from './methods/startAutomation';
import LoginScreen from './LoginScreen';
import SuccessAnimation from './SuccessAnimation';
import { isDevMode } from './config';
import './App.css';

const Popup: React.FC = () => {
    const { startSimulation, clearLogs, isOnCaixaPage } = useAutomation();
    const [simulationResult, setSimulationResult] = useState<any>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
    const [isDev, setIsDev] = useState<boolean>(false);
    const [showSuccess, setShowSuccess] = useState<boolean>(false);
    const [justLoggedIn, setJustLoggedIn] = useState<boolean>(false);

    useEffect(() => {
        checkAuthentication();
        loadDevMode();
    }, []);

    const loadDevMode = async () => {
        const devMode = await isDevMode();
        setIsDev(devMode);
    };

    const checkAuthentication = async () => {
        try {
            const result = await chrome.storage.local.get(['authToken', 'authExpiry']);
            if (result.authToken && result.authExpiry && new Date().getTime() < result.authExpiry) {
                setIsAuthenticated(true);
            }
        } catch (error) {
            console.log('[popup] No existing auth found', error);
        } finally {
            setIsCheckingAuth(false);
        }
    };

    const handleAuthenticated = () => {
        setJustLoggedIn(true);
        setIsAuthenticated(true);
    };

    useEffect(() => {
        if (isAuthenticated && justLoggedIn) {
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 1500);
            setJustLoggedIn(false);
        }
    }, [isAuthenticated, justLoggedIn]);

    const handleLogout = async () => {
        await chrome.storage.local.remove(['authToken', 'authExpiry', 'sessionData', 'simulationResult']);
        setIsAuthenticated(false);
        setSimulationResult(null);
    };

    useEffect(() => {
        chrome.storage.local.get(['simulationResult'], (result) => {
            if (result.simulationResult) {
                setSimulationResult(result.simulationResult);
            }
        });

        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            if (changes.simulationResult) {
                setSimulationResult(changes.simulationResult.newValue);
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);

        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
        };
    }, []);

    let content;
    if (isCheckingAuth) {
        content = (
            <div className="h-full w-full bg-gray-700 p-6 flex items-center justify-center text-white">
                <div className="text-center">
                    <svg className="animate-spin h-8 w-8 text-white mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p>Verificando autenticação...</p>
                </div>
            </div>
        );
    } else if (!isAuthenticated) {
        content = <LoginScreen onAuthenticated={handleAuthenticated} />;
    } else {
        content = (
            <div className="h-full w-full bg-gray-700 p-6 flex flex-col text-white overflow-scroll scrollbar-dark">
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                    <h1 className="text-2xl font-bold">Simulador Habitacional</h1>
                    <button 
                        onClick={handleLogout}
                        className="bg-red-500 hover:bg-red-600 text-white pl-3 pr-3 pt-1 pb-1 rounded text-sm transition-colors"
                    >
                        Sair
                    </button>
                </div>

                <div className="flex-1 flex flex-col gap-4 min-h-0">
                    <div className="flex items-center justify-center flex-shrink-0 flex-grow-0 basis-1/6">
                        <p className="text-center text-lg opacity-90">Aguardando solicitação de simulação...</p>
                    </div>

                    {isDev && simulationResult && (
                        <div className="bg-gray-800 rounded-lg p-2 border border-gray-600 flex flex-col overflow-scroll scrollbar-dark flex-grow flex-shrink basis-1/2 max-h-52">
                            <h4 className="text-xs font-bold text-gray-400 mb-1 pl-2 pr-2 flex-shrink-0">Last Simulation Result (Dev Mode)</h4>
                            <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                                {JSON.stringify(simulationResult, null, 2)}
                            </pre>
                        </div>
                    )}

                    {isDev && (
                        <div className="flex flex-col flex-shrink-0 flex-grow-0 basis-1/3 overflow-scroll scrollbar-dark">
                            <LogViewer onClear={clearLogs} />
                        </div>
                    )}
                </div>
                <SuccessAnimation show={showSuccess} text="Login realizado!" />
            </div>
        );
    }

    return content;
};

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>
);