import { useEffect, useState } from 'react';
import { getStoreConfig } from '../services/localDb';
import { storeConfig as defaultStoreConfig } from '../config/storeConfig';

export default function useStoreConfig() {
  const [config, setConfig] = useState(defaultStoreConfig);

  useEffect(() => {
    let isMounted = true;

    const loadConfig = async () => {
      try {
        const savedConfig = await getStoreConfig();
        if (isMounted) setConfig(savedConfig);
      } catch (error) {
        console.error('Failed to load store configuration:', error);
      }
    };

    const handleStoreConfigChange = () => loadConfig();
    loadConfig();
    window.addEventListener('pharmacydbchange', handleStoreConfigChange);

    return () => {
      isMounted = false;
      window.removeEventListener('pharmacydbchange', handleStoreConfigChange);
    };
  }, []);

  return config;
}
