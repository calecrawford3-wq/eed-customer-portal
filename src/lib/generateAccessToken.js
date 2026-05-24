/**
 * Generate a secure random access token for public document viewing
 * @returns {string} A 32-character random hex token
 */
export function generateAccessToken() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}