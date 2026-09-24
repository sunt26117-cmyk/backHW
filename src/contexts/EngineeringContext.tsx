import React, { createContext, useContext } from 'react';
import { CopilotAnalysisResult, IssueInput, ProjectContext } from '../types';

export interface EngineeringContextValue {
  context: ProjectContext;
  setContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  issue: IssueInput;
  setIssue: React.Dispatch<React.SetStateAction<IssueInput>>;
  result: CopilotAnalysisResult | null;
  setResult: React.Dispatch<React.SetStateAction<CopilotAnalysisResult | null>>;
}

const EngineeringContext = createContext<EngineeringContextValue | null>(null);

export const EngineeringProvider: React.FC<{
  value: EngineeringContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <EngineeringContext.Provider value={value}>
    {children}
  </EngineeringContext.Provider>
);

export function useEngineeringContext(): EngineeringContextValue {
  const value = useContext(EngineeringContext);
  if (!value) {
    throw new Error('useEngineeringContext must be used inside EngineeringProvider');
  }
  return value;
}
