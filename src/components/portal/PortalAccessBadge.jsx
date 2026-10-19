import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Send, RefreshCw, UserCheck, UserPlus, Clock } from "lucide-react";
import { toast } from "sonner";

/**
 * PortalAccessBadge — shows the customer's portal access status by
 * distinguishing the Customer record from an activated login account.
 *
 * Statuses:
 *   Not Invited   — no portal invite sent (portal_invite_sent = false)
 *   Invited       — invite sent but no User account exists yet
 *   Account Active — User account exists for this customer's email
 *
 * Looks up the User entity (admin only) to check if an account exists.
 * Provides Send Invite / Resend Invite actions.
 */
export default function PortalAccessBadge({ customer, onUpdated }) {
  const [userExists, setUserExists] = useState(null); // null = loading, true/false = result
  const [sending, setSending] = useState(false);

  const email = customer?.email;
  const invited = !!customer?.portal_invite_sent;

  const checkUserExists = async () => {
    if (!email) {
      setUserExists(false);
      return;
    }
    try {
      const res = await base44.entities.User.filter({ email });
      const users = res?.items || res || [];
      setUserExists(users.length > 0);
    } catch {
      // Non-admins can't list users — fall back to invite-sent status only
      setUserExists(null);
    }
  };

  useEffect(() => {
    checkUserExists();
  }, [email, customer?.portal_invite_sent]);

  const handleInvite = async () => {
    if (!email) {
      toast.error("Customer has no email address");
      return;
    }
    setSending(true);
    try {
      await base44.functions.invoke("sendPortalInvite", {
        customerId: customer.id,
        customerEmail: email,
        customerName: `${customer.first_name} ${customer.last_name}`,
      });
      toast.success(`Portal invite sent to ${email}`);
      // Mark as invited locally
      if (onUpdated) onUpdated({ ...customer, portal_invite_sent: true, portal_invite_sent_at: new Date().toISOString() });
      // Re-check user existence after a delay
      setTimeout(checkUserExists, 2000);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send portal invite");
    } finally {
      setSending(false);
    }
  };

  if (!email) {
    return (
      <Badge className="bg-slate-100 text-slate-400 border-0 text-xs">
        <Mail className="w-3 h-3 mr-1" /> No email
      </Badge>
    );
  }

  // Determine status
  let status, color, icon;
  if (userExists === true) {
    status = "Account Active";
    color = "bg-emerald-100 text-emerald-700";
    icon = <UserCheck className="w-3 h-3 mr-1" />;
  } else if (invited) {
    status = "Invited";
    color = "bg-amber-100 text-amber-700";
    icon = <Clock className="w-3 h-3 mr-1" />;
  } else {
    status = "Not Invited";
    color = "bg-slate-100 text-slate-500";
    icon = <UserPlus className="w-3 h-3 mr-1" />;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge className={`${color} border-0 text-xs`}>
        {icon}
        {status}
      </Badge>
      {userExists !== true && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleInvite}
          disabled={sending}
        >
          {invited ? (
            <>
              <RefreshCw className="w-3 h-3 mr-1" />
              {sending ? "Sending..." : "Resend"}
            </>
          ) : (
            <>
              <Send className="w-3 h-3 mr-1" />
              {sending ? "Sending..." : "Invite"}
            </>
          )}
        </Button>
      )}
    </div>
  );
}