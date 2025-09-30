// Global configuration based on extension install type
interface Config {
    isDevelopment: boolean;
    urlSuperleme: string;
    webhookSiteUrl: string | null;
}

let globalConfig: Config | null = null;

export const getConfig = async (): Promise<Config> => {
    if (globalConfig) {
        return globalConfig;
    }

    try {
        const info = await chrome.management.getSelf();
        const isDevelopment = info.installType === 'development';
        
        globalConfig = {
            isDevelopment,
            urlSuperleme: isDevelopment 
                ? 'https://superleme.abensoft:8443/' 
                : 'https://www.superleme.com.br/',
            webhookSiteUrl: isDevelopment 
                ? 'https://webhook.site/cc5e18bd-39cd-4cea-99d3-82e2f9ed294a' 
                : null
        };
        
        return globalConfig;
    } catch (error) {
        console.error('Error loading config:', error);
        // Fallback to production config
        globalConfig = {
            isDevelopment: false,
            urlSuperleme: 'https://www.superleme.com.br/',
            webhookSiteUrl: null
        };
        return globalConfig;
    }
};

export const isDevMode = async (): Promise<boolean> => {
    const config = await getConfig();
    return config.isDevelopment;
};