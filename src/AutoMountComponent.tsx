import React from 'react';
import { createRoot } from 'react-dom/client';

interface AutoMountComponentProps {
  Component: React.ComponentType<{ data: any }>;
  containerId: string;
  containerStyles?: Partial<CSSStyleDeclaration>;
  logPrefix: string;
  registerLog: (message: string) => void;
  printLogs: () => void;
}

export const AutoMountComponent: React.FC<AutoMountComponentProps> = ({
  Component,
  containerId,
  containerStyles = {},
  logPrefix,
  registerLog,
  printLogs
}) => {
  React.useEffect(() => {
    async function main() {
      try {
        const data = (window as any).__CAIXA_AUTO_MOUNT_DATA;
        if (data) {
          registerLog(`[${logPrefix}] Auto-mounting with pre-seeded data.`);
          printLogs();
          
          const container = document.createElement('div');
          container.id = containerId;
          
          // Only apply custom styles if provided, no defaults
          Object.assign(container.style, containerStyles);

          document.body.appendChild(container);
          
          const root = createRoot(container);
          root.render(React.createElement(Component, { data }));

        } else {
          registerLog(`[${logPrefix}] No pre-seeded data found.`);
        }
      } catch (e: any) {
        // Use both logging methods for maximum visibility on errors
        console.error(`[${logPrefix}] Auto-mount failed: ${e.message}`, e);
        registerLog(`[${logPrefix}] Auto-mount failed: ${e.message}`);
        printLogs();
      }
    }

    main();
  }, [Component, containerId, containerStyles, logPrefix, registerLog, printLogs]);

  return null; // This component doesn't render anything itself
};