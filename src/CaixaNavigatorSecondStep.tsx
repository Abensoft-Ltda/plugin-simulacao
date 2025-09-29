import React from 'react';
import { createRoot } from 'react-dom/client';
import { AutoMountComponent } from './AutoMountComponent';
import './App.css';

let logs: string[] = [];

function registerLog(message: string) {
	logs.push(message);
}

function printLogs() {
	console.clear();
	logs.forEach(msg => console.log(msg));
}

export const CaixaNavigatorSecondStep: React.FC<{ data: Record<string, any> }> = ({ data }) => {
	
	registerLog(`[CaixaNavigatorSecondStep] Received data: ${JSON.stringify(data)}`);
	const isCaixaPage = typeof window !== 'undefined' && /\.caixa\.gov\.br$/.test(window.location.hostname);
	
	React.useEffect(() => {
		if (!isCaixaPage) {
			registerLog('[CaixaNavigatorSecondStep] Not on caixa.gov.br, skipping automation');
			return;
		}
		
		registerLog('[CaixaNavigatorSecondStep] Second step component loaded for financing options processing');
		printLogs();
		
		// Add your second step automation logic here
		// This could be processing financing options, extracting data, etc.
		
	}, [isCaixaPage, JSON.stringify(data)]);
	
	return (
		<div className="text-xs space-y-1">
			<div className="font-medium text-green-700">🎯 Second Step</div>
			<div className="text-gray-600">Processing options...</div>
			<div className="text-xs text-gray-500">URL: {window.location.pathname.split('/').pop()}</div>
		</div>
	);
};

registerLog('[caixaNavigationSecondStep.js] Script loaded. Starting auto-mount...');

// Auto-mount the CaixaNavigatorSecondStep component
const AutoMountCaixaNavigatorSecondStep = () => (
	<AutoMountComponent
		Component={CaixaNavigatorSecondStep}
		containerId="caixa-navigator-second-step-root"
		containerClasses="fixed bottom-4 left-4 z-50 bg-green-50/95 backdrop-blur-sm border border-green-200 rounded-lg p-3 text-sm shadow-lg max-w-sm"
		logPrefix="caixaNavigationSecondStep.js"
		registerLog={registerLog}
		printLogs={printLogs}
	/>
);

// Initialize the auto-mount component
const initializeAutoMount = () => {
	const mountPoint = document.createElement('div');
	mountPoint.id = 'auto-mount-second-step-point';
	document.body.appendChild(mountPoint);
	
	const root = createRoot(mountPoint);
	root.render(React.createElement(AutoMountCaixaNavigatorSecondStep));
};

initializeAutoMount();

(function() {
	async function main() {
		try {
			const data = (window as any).__CAIXA_AUTO_MOUNT_DATA;
			if (data) {
				registerLog('[CaixaNavigatorSecondStep] Auto-mounting with pre-seeded data.');
				printLogs();
				
				const container = document.createElement('div');
				container.id = 'caixa-navigator-second-step-root';
				container.style.position = 'fixed';
				container.style.top = '10px';
				container.style.right = '10px';
				container.style.zIndex = '9999';
				container.style.backgroundColor = 'lightblue';
				container.style.border = '1px solid blue';
				container.style.padding = '10px';
				document.body.appendChild(container);
				
				const root = createRoot(container);
				root.render(React.createElement(CaixaNavigatorSecondStep, { data }));

			} else {
				registerLog('[CaixaNavigatorSecondStep] No pre-seeded data found.');
			}
		} catch (e: any) {
			console.error(`[CaixaNavigatorSecondStep] Auto-mount failed: ${e.message}`, e);
			registerLog(`[CaixaNavigatorSecondStep] Auto-mount failed: ${e.message}`);
			printLogs();
		}
	}

	main();
})();