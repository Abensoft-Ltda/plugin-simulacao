import React from 'react';
import { createRoot } from 'react-dom/client';
import { LogViewer } from './LogViewer';
import { useAutomation } from './methods/startAutomation';
import './App.css';

const Popup: React.FC = () => {
    const { startSimulation, clearLogs, isOnCaixaPage } = useAutomation();

    return (
        <div className="h-full w-full bg-gray-700 p-6 flex flex-col text-white">
            <h1 className="text-2xl font-bold mb-2 text-center">Simulador Habitacional</h1>
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