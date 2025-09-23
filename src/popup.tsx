import React from 'react';
import { useState } from 'react';
import './App.css';
import { createRoot } from 'react-dom/client';

const Popup = () => {

    function startSimulation() {
        chrome.tabs.create({ url: "https://www.caixa.gov.br/simule-habitacao" });
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const url = tabs[0].url;
        })
    }

    const [isInCaixa, setIsInCaixa] = useState(null);
    if (isInCaixa) {

    }


    return (
            <div className="h-full w-full bg-main-green">
            <h1>Hello from React! 👋</h1>
            <p>This UI is rendered by React.</p>
            <button onClick={startSimulation}>
                Click Me
            </button>
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