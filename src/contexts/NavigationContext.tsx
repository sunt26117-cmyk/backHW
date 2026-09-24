import React, { createContext, useContext } from 'react';

export interface NavigationContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export const NavigationProvider: React.FC<
  NavigationContextValue & { children: React.ReactNode }
> = ({ activeTab, setActiveTab, children }) => (
  <NavigationContext.Provider value={{ activeTab, setActiveTab }}>
    {children}
  </NavigationContext.Provider>
);

export function useNavigation(): NavigationContextValue {
  const value = useContext(NavigationContext);
  if (!value) {
    throw new Error('useNavigation must be used inside NavigationProvider');
  }
  return value;
}
