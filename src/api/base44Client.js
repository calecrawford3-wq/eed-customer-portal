import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// Public client for unauthenticated routes (no token, no auth requirements)
export const base44Public = createClient({
  appId,
  token: null, // No authentication token
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});