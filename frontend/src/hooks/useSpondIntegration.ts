import { useState, useCallback } from 'react';

export interface SpondGroup {
  id: string;
  name: string;
}

export interface SpondCredentials {
  username: string;
  password: string;
  groupId: string;
}

const initialCredentials: SpondCredentials = {
  username: '',
  password: '',
  groupId: '',
};

export function useSpondIntegration() {
  const [showSetup, setShowSetup] = useState(false);
  const [credentials, setCredentials] = useState<SpondCredentials>(initialCredentials);
  const [groups, setGroups] = useState<SpondGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const updateCredentials = useCallback((updates: Partial<SpondCredentials>) => {
    setCredentials((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetCredentials = useCallback(() => {
    setCredentials(initialCredentials);
    setGroups([]);
  }, []);

  const openSetup = useCallback(() => {
    setShowSetup(true);
  }, []);

  const closeSetup = useCallback(() => {
    setShowSetup(false);
    resetCredentials();
  }, [resetCredentials]);

  return {
    showSetup,
    setShowSetup,
    openSetup,
    closeSetup,
    credentials,
    updateCredentials,
    resetCredentials,
    groups,
    setGroups,
    loadingGroups,
    setLoadingGroups,
    isSyncing,
    setIsSyncing,
  };
}
