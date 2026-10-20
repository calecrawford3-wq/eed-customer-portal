import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function StaffSignOut() {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    await base44.auth.logout(`${window.location.origin}/PortalAccess?mode=signin`);
  };

  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={signOut}
      className="min-h-11"
    >
      <LogOut className="mr-2 h-4 w-4" />
      {busy ? 'Signing out…' : 'Sign Out'}
    </Button>
  );
}

export default StaffSignOut;