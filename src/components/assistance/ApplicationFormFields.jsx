import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

// Renders the sections and questions of the active EngineAssistanceTemplate.
// Adding or replacing the template changes what appears here without code.
export default function ApplicationFormFields({ sections = [], answers, setAnswers, errors = {}, disabled = false }) {
  const change = (key, value) => setAnswers((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key} className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">{section.title}</h3>
            {section.description && <p className="text-sm text-slate-500 mt-0.5">{section.description}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(section.fields || []).map((field) => {
              const wide = field.type === "textarea" || field.type === "file";
              const value = answers[field.key] ?? "";
              const error = errors[field.key];
              return (
                <div key={field.key} className={wide ? "sm:col-span-2" : ""}>
                  <Label htmlFor={`f-${field.key}`} className="text-sm font-medium text-slate-700">
                    {field.label}
                    {field.required && <span className="text-[#e20404]"> *</span>}
                  </Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={`f-${field.key}`}
                      value={value}
                      disabled={disabled}
                      maxLength={field.max_length || 2500}
                      onChange={(e) => change(field.key, e.target.value)}
                      className="mt-1.5 min-h-28"
                      placeholder={field.help || ""}
                    />
                  ) : field.type === "select" ? (
                    <Select value={value} disabled={disabled} onValueChange={(v) => change(field.key, v)}>
                      <SelectTrigger id={`f-${field.key}`} className="mt-1.5">
                        <SelectValue placeholder="Choose one" />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options || []).map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "checkbox" ? (
                    <div className="mt-2 flex items-start gap-2">
                      <Checkbox id={`f-${field.key}`} checked={!!value} disabled={disabled} onCheckedChange={(v) => change(field.key, v === true)} />
                      <label htmlFor={`f-${field.key}`} className="text-sm text-slate-600">{field.help || field.label}</label>
                    </div>
                  ) : (
                    <Input
                      id={`f-${field.key}`}
                      type={field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "phone" ? "tel" : field.type === "date" ? "date" : "text"}
                      value={value}
                      disabled={disabled}
                      maxLength={field.max_length || 200}
                      onChange={(e) => change(field.key, e.target.value)}
                      className="mt-1.5"
                      placeholder={field.help || ""}
                    />
                  )}
                  {field.help && field.type !== "textarea" && field.type !== "checkbox" && <p className="text-xs text-slate-500 mt-1">{field.help}</p>}
                  {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}