import React from 'react';
import * as ReactDOMClient from 'react-dom/client';

interface AutoMountNavigatorOptions {
  containerId: string;
  dataKey?: string;
  logPrefix: string;
  registerLog: (message: string) => void;
  printLogs?: () => void;
  containerStyles?: Partial<CSSStyleDeclaration>;
}

export function autoMountNavigator<T extends Record<string, any>>(
  Component: React.ComponentType<{ data: T }>,
  {
    containerId,
    dataKey = '__CAIXA_AUTO_MOUNT_DATA',
    logPrefix,
    registerLog,
    printLogs,
    containerStyles,
  }: AutoMountNavigatorOptions,
): void {
  try {
    const data = (window as any)[dataKey] as T | undefined;

    if (data) {
      registerLog(`[${logPrefix}] Auto-mounting with pre-seeded data.`);
      printLogs?.();

      let container = document.getElementById(containerId) as HTMLElement | null;
      if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        if (containerStyles) {
          Object.assign(container.style, containerStyles);
        }
        document.body.appendChild(container);
      }

      const root = ReactDOMClient.createRoot(container);
      root.render(React.createElement(Component, { data }));
    } else {
      registerLog(`[${logPrefix}] No pre-seeded data found.`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${logPrefix}] Auto-mount failed: ${message}`, error);
    registerLog(`[${logPrefix}] Auto-mount failed: ${message}`);
    printLogs?.();
  }
}
