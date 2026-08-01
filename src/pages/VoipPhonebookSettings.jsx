import React from "react";
import VoipPhonebookPanel from "@/components/settings/VoipPhonebookPanel";

export default function VoipPhonebookSettings() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">VoIP.ms Phone Book Integration</h1>
      <VoipPhonebookPanel />
    </div>
  );
}