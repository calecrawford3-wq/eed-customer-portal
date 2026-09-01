import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CannedItemsEditor from "@/components/specsheets/CannedItemsEditor";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export default function AddonDialog({ open, onClose, addon, onSave, isPending }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState({ line_items: [], labor_items: [], machining_items: [] });

  const { data: categories = [] } = useQuery({
    queryKey: ["addonCategories"],
    queryFn: () => base44.entities.AddonCategory.list("-created_date", 200),
  });

  useEffect(() => {
    if (addon) {
      setName(addon.name || "");
      setDescription(addon.description || "");
      setCategoryId(addon.category_id || "");
      setPriceOverride(addon.price_override != null ? String(addon.price_override) : "");
      setStatus(addon.status || "active");
      setNotes(addon.notes || "");
      setItems({
        line_items: addon.line_items || [],
        labor_items: addon.labor_items || [],
        machining_items: addon.machining_items || [],
      });
    } else {
      setName("");
      setDescription("");
      setCategoryId("");
      setPriceOverride("");
      setStatus("active");
      setNotes("");
      setItems({ line_items: [], labor_items: [], machining_items: [] });
    }
  }, [addon, open]);

  const handleSave = () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!categoryId) { toast.error("Please select a category"); return; }
    const cat = categories.find(c => c.id === categoryId);
    const po = priceOverride === "" ? null : Number(priceOverride);
    onSave({
      name: name.trim(),
      description: description.trim(),
      category_id: categoryId,
      category_name: cat?.name || "",
      line_items: items.line_items || [],
      labor_items: items.labor_items || [],
      machining_items: items.machining_items || [],
      price_override: po,
      status,
      notes: notes.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{addon ? "Edit Addon" : "New Addon"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Port & Polish" />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c.status !== "archived").map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description shown in the estimate picker..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Price Override (optional)</Label>
              <Input
                type="number"
                value={priceOverride}
                onChange={e => setPriceOverride(e.target.value)}
                placeholder="Leave blank to sum item prices"
                min="0"
                step="0.01"
              />
              <p className="text-xs text-slate-400">Set a flat price; otherwise the addon price is the sum of its parts/labor/machining at add time.</p>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <CannedItemsEditor cannedItems={items} onChange={setItems} showMachining />
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes..." rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} className="bg-[#e20404] hover:bg-[#c00303] text-white" disabled={!name.trim() || isPending}>
              {addon ? "Save Changes" : "Create Addon"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}