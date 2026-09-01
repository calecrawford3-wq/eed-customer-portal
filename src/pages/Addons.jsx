import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Sparkles, Pencil, Trash2, MoreVertical, FolderPlus, Package, Wrench, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import AddonDialog from "@/components/addons/AddonDialog";
import { toast } from "sonner";

export default function Addons() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [addonDialogOpen, setAddonDialogOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");

  const { data: categories = [], isLoading: catLoading } = useQuery({
    queryKey: ["addonCategories"],
    queryFn: () => base44.entities.AddonCategory.list("-created_date", 200),
  });

  const { data: addons = [], isLoading: addonLoading } = useQuery({
    queryKey: ["addons"],
    queryFn: () => base44.entities.Addon.list("-created_date", 500),
  });

  const createAddonMut = useMutation({
    mutationFn: (data) => base44.entities.Addon.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["addons"] }); setAddonDialogOpen(false); setEditingAddon(null); },
  });
  const updateAddonMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Addon.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["addons"] }); setAddonDialogOpen(false); setEditingAddon(null); },
  });
  const deleteAddonMut = useMutation({
    mutationFn: (id) => base44.entities.Addon.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["addons"] }),
  });

  const createCatMut = useMutation({
    mutationFn: (data) => base44.entities.AddonCategory.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["addonCategories"] }); setCategoryDialogOpen(false); setNewCategoryName(""); setNewCategoryDesc(""); toast.success("Category created"); },
  });
  const deleteCatMut = useMutation({
    mutationFn: (id) => base44.entities.AddonCategory.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["addonCategories"] }); qc.invalidateQueries({ queryKey: ["addons"] }); setSelectedCategory(""); },
  });

  const handleSaveAddon = (data) => {
    if (editingAddon) updateAddonMut.mutate({ id: editingAddon.id, data });
    else createAddonMut.mutate(data);
  };

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) { toast.error("Category name required"); return; }
    createCatMut.mutate({ name: newCategoryName.trim(), description: newCategoryDesc.trim(), status: "active" });
  };

  const activeCategories = categories.filter(c => c.status !== "archived");
  const filteredAddons = addons.filter(a =>
    a.status !== "archived" &&
    (!selectedCategory || a.category_id === selectedCategory) &&
    (!search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.description?.toLowerCase().includes(search.toLowerCase()))
  );

  const selectedCatName = categories.find(c => c.id === selectedCategory)?.name || "All Addons";

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Addons</h1>
          <p className="text-slate-500 mt-1">Preset optional add-ons customers can choose in their estimate</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>
            <FolderPlus className="w-4 h-4 mr-2" /> New Category
          </Button>
          <Button onClick={() => { setEditingAddon(null); setAddonDialogOpen(true); }} className="bg-[#e20404] hover:bg-[#c00303] text-white">
            <Plus className="w-4 h-4 mr-2" /> New Addon
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Categories sidebar */}
        <div className="lg:col-span-1">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">Categories</p>
              {catLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <div className="space-y-0.5">
                  <button
                    onClick={() => setSelectedCategory("")}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${!selectedCategory ? "bg-[#e20404] text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    All Addons ({addons.filter(a => a.status !== "archived").length})
                  </button>
                  {activeCategories.map(c => {
                    const count = addons.filter(a => a.category_id === c.id && a.status !== "archived").length;
                    return (
                      <div key={c.id} className="flex items-center group">
                        <button
                          onClick={() => setSelectedCategory(c.id)}
                          className={`flex-1 text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedCategory === c.id ? "bg-[#e20404] text-white" : "text-slate-600 hover:bg-slate-100"}`}
                        >
                          {c.name} ({count})
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity"><MoreVertical className="w-3.5 h-3.5" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-red-600" onClick={() => { if (confirm(`Delete category "${c.name}"? Addons in it will remain but lose their category link.`)) deleteCatMut.mutate(c.id); }}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete Category
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Addons grid */}
        <div className="lg:col-span-3">
          <div className="relative max-w-md mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder={`Search ${selectedCatName}...`} value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>

          {addonLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
            </div>
          ) : filteredAddons.length === 0 ? (
            <div className="text-center py-16">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-medium text-slate-900">No addons found</h3>
              <p className="text-slate-500 mt-1">{search ? "Try adjusting your search" : "Create your first addon"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAddons.map(addon => {
                const partCount = (addon.line_items || []).length;
                const laborCount = (addon.labor_items || []).length;
                const machCount = (addon.machining_items || []).length;
                return (
                  <Card key={addon.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">{addon.category_name || "Uncategorized"}</Badge>
                            {addon.price_override != null && <Badge className="bg-purple-100 text-purple-700 border-0 text-[10px]">Flat ${Number(addon.price_override).toFixed(2)}</Badge>}
                          </div>
                          <p className="text-sm font-medium text-slate-900 mt-1.5">{addon.name}</p>
                          {addon.description && <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{addon.description}</p>}
                          <div className="flex gap-3 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {partCount}</span>
                            <span className="flex items-center gap-1"><Wrench className="w-3 h-3" /> {laborCount}</span>
                            <span className="flex items-center gap-1"><Cog className="w-3 h-3" /> {machCount}</span>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingAddon(addon); setAddonDialogOpen(true); }}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => { if (confirm(`Delete addon "${addon.name}"?`)) deleteAddonMut.mutate(addon.id); }}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AddonDialog
        open={addonDialogOpen}
        onClose={() => { setAddonDialogOpen(false); setEditingAddon(null); }}
        addon={editingAddon}
        onSave={handleSaveAddon}
        isPending={createAddonMut.isPending || updateAddonMut.isPending}
      />

      {/* New Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Addon Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="e.g., Yamaha, Suzuki, Honda" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={newCategoryDesc} onChange={e => setNewCategoryDesc(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleCreateCategory} disabled={createCatMut.isPending}>
              {createCatMut.isPending ? "Creating..." : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}