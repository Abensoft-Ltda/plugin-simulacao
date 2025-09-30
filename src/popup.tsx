import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { LogViewer } from './LogViewer';
import { useAutomation } from './methods/startAutomation';
import LoginScreen from './LoginScreen';
import './App.css';

const Popup: React.FC = () => {
    const { startSimulation, clearLogs, isOnCaixaPage } = useAutomation();
    const [simulationResult, setSimulationResult] = useState<any>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

    useEffect(() => {
        checkAuthentication();
    }, []);

    const checkAuthentication = async () => {
        try {
            const result = await chrome.storage.local.get(['authToken', 'authExpiry']);
            if (result.authToken && result.authExpiry && new Date().getTime() < result.authExpiry) {
                setIsAuthenticated(true);
            }
        } catch (error) {
            console.log('No existing auth found');
        } finally {
            setIsCheckingAuth(false);
        }
    };

    const handleAuthenticated = () => {
        setIsAuthenticated(true);
    };

    const handleLogout = async () => {
        await chrome.storage.local.remove(['authToken', 'authExpiry', 'sessionData']);
        setIsAuthenticated(false);
        setSimulationResult(null);
    };

    useEffect(() => {
        console.log('[popup] Checking for existing simulation result...');
        chrome.storage.local.get(['simulationResult'], (result) => {
            console.log('[popup] Storage result:', result);
            console.log('[popup] Storage keys:', Object.keys(result));
            console.log('[popup] Has simulationResult?', 'simulationResult' in result);
            console.log('[popup] SimulationResult value:', result.simulationResult);
            
            if (result.simulationResult) {
                console.log('[popup] Found existing result, setting state');
                setSimulationResult(result.simulationResult);
            } else {
                console.log('[popup] No existing result found in chrome.storage');
                chrome.storage.local.get(null, (allData) => {
                    console.log('[popup] All storage data:', allData);
                });
                
                try {
                    const fallbackResult = localStorage.getItem('caixa_simulation_result');
                    if (fallbackResult) {
                        console.log('[popup] Found result in localStorage fallback');
                        const parsedResult = JSON.parse(fallbackResult);
                        setSimulationResult(parsedResult);
                        
                        chrome.storage.local.set({ simulationResult: parsedResult }, () => {
                            console.log('[popup] Moved fallback result to chrome.storage');
                            localStorage.removeItem('caixa_simulation_result');
                        });
                    } else {
                        console.log('[popup] No fallback result found in localStorage either');
                    }
                } catch (e) {
                    console.log('[popup] Error checking localStorage fallback:', e);
                }
            }
        });

        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            console.log('[popup] Storage changed:', changes);
            if (changes.simulationResult) {
                console.log('[popup] Simulation result changed:', changes.simulationResult.newValue);
                setSimulationResult(changes.simulationResult.newValue);
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);

        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
        };
    }, []);

    // Show loading while checking authentication
    if (isCheckingAuth) {
        return (
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
    }

    // Show login screen if not authenticated
    if (!isAuthenticated) {
        return <LoginScreen onAuthenticated={handleAuthenticated} />;
    }

    const clearResults = () => {
        chrome.storage.local.remove(['simulationResult']);
        setSimulationResult(null);
    };

    const testStorage = () => {
        const testData = { test: true, message: "This is a test result" };
        console.log('[popup] Setting test data:', testData);
        chrome.storage.local.set({ simulationResult: testData }, () => {
            console.log('[popup] Test data stored');
        });
    };

    if (simulationResult) {
        return (
            <div className="h-full w-full bg-gray-700 p-6 flex flex-col text-white">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold">Resultados da Simulação</h3>
                    <div className="flex gap-2">
                        <button 
                            onClick={clearResults}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition-colors"
                        >
                            Limpar
                        </button>
                        <button 
                            onClick={handleLogout}
                            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
                        >
                            Sair
                        </button>
                    </div>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-4 flex-1 overflow-hidden">
                    <div className="h-full overflow-auto">
                        <pre className="text-xs text-green-400 whitespace-pre-wrap break-words">
                            {JSON.stringify(simulationResult, null, 2)}
                        </pre>
                    </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-600">
                    <button 
                        onClick={() => setSimulationResult(null)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
                    >
                        Nova Simulação
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-gray-700 p-6 flex flex-col text-white">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold">Simulador Habitacional</h1>
                <button 
                    onClick={handleLogout}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition-colors"
                >
                    Sair
                </button>
            </div>
            <p className="text-center text-sm opacity-80 mb-6">by Abensoft</p>

            {isOnCaixaPage ? (
                <p className="text-center bg-white/10 p-3 rounded-md mb-4">Você já está na página da Caixa. Pronto para simular!</p>
            ) : (
                <p className="text-center text-sm opacity-90 mb-4">Clique abaixo para abrir a página de simulação da Caixa e iniciar a automação.</p>
            )}

            <button 
                onClick={startSimulation}
                className="w-full bg-main-green text-white font-bold py-3 px-4 rounded-lg shadow-lg backdrop-blur-sm 
                transition-all hover:bg-gray-700/90 hover:scale-105 focus:outline-none focus:ring-2 
                focus:ring-offset-2 focus:ring-offset-main-green focus:ring-white mb-4"
            >
                Iniciar Simulação
            </button>

            <button 
                onClick={testStorage}
                style={{marginBottom: '10px', padding: '5px 10px', fontSize: '12px'}}
            >
                Test Storage
            </button>

            <LogViewer onClear={clearLogs} />
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>
);