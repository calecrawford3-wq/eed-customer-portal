import { useEffect, useState } from 'react';

export default function DebugServiceWorker() {
  const [workers, setWorkers] = useState([]);
  const [cacheList, setCacheList] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    checkServiceWorkers();
    checkCaches();
  }, []);

  const checkServiceWorkers = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      setWorkers(registrations);
      console.log('Service Workers found:', registrations);
    }
  };

  const checkCaches = async () => {
    if ('caches' in window) {
      const names = await caches.keys();
      setCacheList(names);
      console.log('Caches found:', names);
    }
  };

  const unregisterAll = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        const unregistered = await reg.unregister();
        console.log('Unregistered:', reg.scope, unregistered);
      }
      setMessage('✓ All service workers unregistered');
      checkServiceWorkers();
    }
  };

  const clearAllCaches = async () => {
    if ('caches' in window) {
      const names = await caches.keys();
      for (const name of names) {
        await caches.delete(name);
        console.log('Deleted cache:', name);
      }
      setMessage('✓ All caches cleared');
      checkCaches();
    }
  };

  const clearAppData = async () => {
    await unregisterAll();
    await clearAllCaches();
    
    // Clear localStorage/sessionStorage
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear cookies (basic approach)
    document.cookie.split(";").forEach(c => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    
    setMessage('✓ FULL CLEANUP COMPLETE - Reload page now');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6 text-red-600">🛠️ Debug Service Worker & Cache</h1>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900">
            <strong>To diagnose public route redirect issue:</strong>
          </p>
          <ol className="list-decimal ml-5 mt-2 text-sm text-blue-900">
            <li>Check if Service Workers or Caches exist below</li>
            <li>Click "CLEAR EVERYTHING" to remove all cached app shells</li>
            <li>Reload page after clearing</li>
            <li>Visit public estimate link again in all browsers/devices</li>
          </ol>
        </div>

        {message && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
            {message}
          </div>
        )}

        <div className="space-y-6">
          {/* Service Workers */}
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">Service Workers: {workers.length}</h2>
            {workers.length === 0 ? (
              <p className="text-gray-500">✓ No service workers registered</p>
            ) : (
              <ul className="space-y-2">
                {workers.map((w, i) => (
                  <li key={i} className="text-sm bg-gray-100 p-2 rounded">
                    <strong>{w.scope}</strong>
                    <br />
                    State: {w.active ? '🟢 Active' : '⚪ Inactive'}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Caches */}
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">Caches: {cacheList.length}</h2>
            {cacheList.length === 0 ? (
              <p className="text-gray-500">✓ No caches found</p>
            ) : (
              <ul className="space-y-2">
                {cacheList.map((name, i) => (
                  <li key={i} className="text-sm bg-gray-100 p-2 rounded">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className="border-t pt-6 space-y-3">
            <button
              onClick={unregisterAll}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded"
            >
              Unregister All Service Workers
            </button>
            <button
              onClick={clearAllCaches}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded"
            >
              Clear All Caches
            </button>
            <button
              onClick={clearAppData}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              🔥 CLEAR EVERYTHING (Full Cleanup)
            </button>
          </div>
        </div>

        <div className="mt-6 text-sm text-gray-600">
          <p><strong>After clearing:</strong></p>
          <ol className="list-decimal ml-5 mt-2">
            <li>Close all browser tabs with the app open</li>
            <li>Reload this page</li>
            <li>Try public estimate link again</li>
            <li>Test on mobile in private/incognito mode</li>
          </ol>
        </div>
      </div>
    </div>
  );
}