import React from 'react';
import {base44} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {LogOut} from 'lucide-react';

export function StaffSignOut(){
 const signOut=()=>base44.auth.logout(window.location.origin+'/PortalAccess?mode=signin');
 return <Button type="button" variant="outline" onClick={signOut} className="gap-2"><LogOut className="h-4 w-4"/>Sign Out</Button>;
}
