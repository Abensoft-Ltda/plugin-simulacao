import React, { useState, useEffect } from 'react';

interface SimulationOverlayProps {
	title?: string;
	subtitle?: string;
	bankName?: string;
	bankIcon?: string;
	isComplete?: boolean;
	children: React.ReactNode;
}

export const SimulationOverlay: React.FC<SimulationOverlayProps> = ({
	title = "Automação em Andamento",
	subtitle = "Processando simulação...",
	bankName = "Banco",
	bankIcon = "ibb-caixa",
	isComplete = false,
	children
}) => {
	const [isWatching, setIsWatching] = useState(false);
	const [showSuccess, setShowSuccess] = useState(false);

	// Show success animation when complete
	useEffect(() => {
		if (isComplete) {
			setShowSuccess(true);
		}
	}, [isComplete]);

	// Load bank icons CSS
	useEffect(() => {
		const linkId = 'bank-icons-css';
		if (!document.getElementById(linkId)) {
			const link = document.createElement('link');
			link.id = linkId;
			link.rel = 'stylesheet';
			link.href = 'https://cdn.jsdelivr.net/gh/matheusmcuba/icones-bancos-brasileiros@1.1/dist/all.css';
			document.head.appendChild(link);
		}
	}, []);

	if (isWatching) {
		// Show the component without the overlay - using proper gray theme
		return (
			<div className="fixed top-4 right-4 z-[999999] max-w-md max-h-[90vh] overflow-auto bg-gray-800 border-2 border-gray-600 rounded-lg p-4 shadow-2xl">
				<button
					onClick={() => setIsWatching(false)}
					className="absolute top-2 right-2 px-3 py-1 bg-red-500 hover:bg-red-600 text-white border-none rounded text-xs font-bold z-[1000000] transition-colors"
				>
					Ocultar
				</button>
				<div className="mt-8" style={{ color: 'white !important' }}>
					<style>{`
						.mt-8 * { color: white !important; }
					`}</style>
					{children}
				</div>
			</div>
		);
	}

	// Show success animation when complete
	if (showSuccess) {
		return (
			<div className="fixed inset-0 w-screen h-screen bg-gray-700 z-[999999] flex items-center justify-center transition-opacity duration-500 ease-in-out">
				<div className="text-center">
					<div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 transform transition-all duration-700 ease-out scale-110 animate-pulse">
						<svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
							<path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
						</svg>
					</div>
					<p className="text-lg font-medium" style={{ color: 'white' }}>{`Simulação concluída - ${bankName}`}</p>
				</div>
			</div>
		);
	}

	// Show the full-screen overlay matching popup.tsx style
	return (
		<div className="fixed inset-0 w-screen h-screen bg-gray-700 z-[999999] flex flex-col items-center justify-center p-6">
			{/* Animated Bank Icon */}
			<div className="mb-6 animate-pulse">
				<div className="w-32 h-32 bg-gray-800 rounded-full flex justify-center items-center shadow-2xl border-4 border-gray-600">
					<i className={`${bankIcon} text-[70px]`} style={{ lineHeight: 1, filter: 'brightness(2.5) contrast(1.2)' }}></i>
				</div>
			</div>

			{/* Title - WHITE TEXT */}
			<h1 className="text-4xl font-bold mb-3 text-center drop-shadow-lg" style={{ color: 'white' }}>
				{title}
			</h1>

			{/* Subtitle - WHITE TEXT */}
			<p className="text-lg mb-2 text-center drop-shadow-md" style={{ color: 'white' }}>
				{subtitle}
			</p>

			{/* Bank Name - WHITE TEXT */}
			<p className="text-sm mb-8 text-center drop-shadow-md" style={{ color: 'white' }}>
				{bankName}
			</p>

			{/* Watch Process Button - DARK GRAY TEXT */}
			<button
				onClick={() => setIsWatching(true)}
				className="px-8 py-3 bg-main-green hover:bg-green-600 border-none rounded-lg text-base font-bold cursor-pointer shadow-lg transition-all duration-300 ease-in-out hover:scale-105"
				style={{ color: '#1f2937' }}
			>
				Exibir processo de simulação
			</button>

			{/* Loading Spinner - WHITE */}
			<div className="mt-10 flex gap-2">
				<div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
				<div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
				<div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
			</div>
		</div>
	);
};
