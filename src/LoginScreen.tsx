import React, { useState, useEffect } from 'react';

interface LoginScreenProps {
    onAuthenticated: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated }) => {
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        setIsAnimating(true);
        checkExistingAuth();
    }, []);

    const checkExistingAuth = async () => {
        try {
            const result = await chrome.storage.local.get(['authToken', 'authExpiry']);
            if (result.authToken && result.authExpiry && new Date().getTime() < result.authExpiry) {
                onAuthenticated();
            }
        } catch (error) {
            console.log('No existing auth found');
        }
    };

    const handleAuthenticate = async () => {
        setIsAuthenticating(true);
        
        try {
            // Check if we're on the Superleme page and get cookies
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tabs[0]?.url?.includes('superleme')) {
                // Execute script to get cookies from Superleme
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id! },
                    func: () => {
                        const allCookies = document.cookie.split(";");
                        
                        const getCookie = (name: string) => {
                            const cookie = allCookies.find(cookie => cookie.includes(name));
                            return cookie ? cookie.split("=")[1] : null;
                        };

                        return {
                            cotonicSid: getCookie('cotonic-sid'),
                            zAuth: getCookie('z.auth'),
                            zLang: getCookie('z.lang'),
                            zTz: getCookie('z.tz'),
                            timezone: getCookie('timezone')
                        };
                    }
                });

                const cookieData = results[0].result;
                
                if (cookieData.cotonicSid && cookieData.zAuth) {
                    // Store auth data
                    const authData = {
                        authToken: cookieData.zAuth,
                        authExpiry: new Date().getTime() + (24 * 60 * 60 * 1000), // 24 hours
                        sessionData: cookieData
                    };
                    
                    await chrome.storage.local.set(authData);
                    
                    // Successful auth animation
                    setIsAnimating(false);
                    setTimeout(() => {
                        onAuthenticated();
                    }, 300);
                } else {
                    throw new Error('Authentication cookies not found');
                }
            } else {
                // Open Superleme for authentication
                chrome.tabs.create({ 
                    url: 'https://superleme.com.br?ext=superleme',
                    active: true 
                });
            }
        } catch (error) {
            console.error('Authentication failed:', error);
            alert('Falha na autenticação. Por favor, tente novamente.');
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleSupport = () => {
        chrome.tabs.create({ 
            url: 'mailto:suporte@abensoft.com.br?subject=Suporte%20Simulador%20Habitacional',
            active: true 
        });
    };

    return (
        <div className={`h-full w-full bg-gray-700 gap-5 p-6 flex flex-col text-white transition-all duration-500 ${isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <form className="flex flex-col items-center justify-center flex-1 space-y-6" onSubmit={(e) => e.preventDefault()}>
                <div className="flex justify-center items-center">
                    <img 
                        src="images/icone_deauth.png"
                        alt="Ícone de Autenticação"
                        className={`w-16 h-16 sm:w-20 sm:h-20 md:w-[90px] md:h-[90px] transition-transform duration-300 ${isAuthenticating ? 'animate-pulse scale-110' : 'hover:scale-105'}`}
                    />
                </div>

                <div className="w-full max-w-sm flex justify-center">
                    <button
                        type="button"
                        onClick={handleAuthenticate}
                        disabled={isAuthenticating}
                        className="w-full bg-main-green hover:bg-green-600 disabled:bg-gray-500 text-white font-bold py-3 px-4 rounded-md transition-all duration-200 flex justify-center items-center transform hover:scale-105 active:scale-95"
                    >
                        {isAuthenticating ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Autenticando...
                            </>
                        ) : (
                            'Autenticar'
                        )}
                    </button>
                </div>

                <p className="text-base text-center text-gray-300">
                    Faça a autenticação para autorizar o preenchimento automático.
                </p>
            </form>

            <hr className="w-full h-px bg-gray-300 border-none" />

            <p className="text-base text-center">
                Precisa de ajuda?{' '}
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