"use client";

/** Create a custom food: per-100g nutrition + optional household serving. */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getClient } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/problem";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(2, "Give the food a name"),
  brand: z.string().optional(),
  isLiquid: z.boolean(),
  kcal: z.coerce.number().min(0, "Required").max(900, "Per 100 g this can't exceed 900"),
  proteinG: z.coerce.number().min(0).max(100),
  carbsG: z.coerce.number().min(0).max(100),
  fatG: z.coerce.number().min(0).max(100),
  fiberG: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  sodiumMg: z.coerce.number().min(0).max(40000).optional().or(z.literal("")),
  servingLabel: z.string().optional(),
  servingGrams: z.coerce.number().positive().max(5000).optional().or(z.literal("")),
});

type FormValues = z.input<typeof schema>;

export function CreateFoodDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", brand: "", isLiquid: false, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: "", sodiumMg: "", servingLabel: "", servingGrams: "" },
  });

  const create = useMutation({
    mutationFn: async (raw: FormValues) => {
      const v = schema.parse(raw);
      // macro sanity: 4/4/9 energy within ±25% of stated kcal (when kcal > 20)
      const macroKcal = v.proteinG * 4 + v.carbsG * 4 + v.fatG * 9;
      if (v.kcal > 20 && macroKcal > 0 && Math.abs(macroKcal - v.kcal) / v.kcal > 0.25) {
        throw new Error(
          `Macros add up to ~${Math.round(macroKcal)} kcal but you entered ${v.kcal} kcal — double-check the label.`,
        );
      }
      const hasServing = v.servingLabel && typeof v.servingGrams === "number";
      const units = hasServing ? [{ id: crypto.randomUUID(), label: v.servingLabel!, grams: v.servingGrams as number }] : [];
      const client = await getClient();
      return client.foods.create({
        name: v.name,
        brand: v.brand || undefined,
        isLiquid: v.isLiquid,
        nutrients: {
          kcal: v.kcal,
          proteinG: v.proteinG,
          carbsG: v.carbsG,
          fatG: v.fatG,
          fiberG: typeof v.fiberG === "number" ? v.fiberG : undefined,
          sodiumMg: typeof v.sodiumMg === "number" ? v.sodiumMg : undefined,
        },
        servingUnits: units,
        defaultServing: hasServing ? { unitId: units[0].id, quantity: 1 } : { unitId: "g", quantity: 100 },
      });
    },
    onSuccess: (food) => {
      toast.success(`${food.name} added to your foods`);
      void qc.invalidateQueries({ queryKey: ["food-search"] });
      void qc.invalidateQueries({ queryKey: ["my-foods"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const err = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create custom food</DialogTitle>
          <DialogDescription>Values are per 100 g (or 100 ml for drinks) — straight from the label.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cf-name">Name</Label>
              <Input id="cf-name" placeholder="e.g. Mom's granola" {...form.register("name")} aria-invalid={!!err.name} />
              {err.name && <p className="text-xs text-destructive">{err.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-brand">Brand (optional)</Label>
              <Input id="cf-brand" {...form.register("brand")} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 mt-auto">
              <Label htmlFor="cf-liquid" className="text-sm">Liquid (per 100 ml)</Label>
              <Switch id="cf-liquid" checked={form.watch("isLiquid")} onCheckedChange={(v) => form.setValue("isLiquid", v)} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ["kcal", "Calories", "kcal"],
                ["proteinG", "Protein", "g"],
                ["carbsG", "Carbs", "g"],
                ["fatG", "Fat", "g"],
              ] as const
            ).map(([key, label, unit]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`cf-${key}`}>
                  {label} <span className="text-muted-foreground">({unit})</span>
                </Label>
                <Input id={`cf-${key}`} inputMode="decimal" {...form.register(key)} aria-invalid={!!err[key]} />
                {err[key] && <p className="text-xs text-destructive">{err[key]?.message}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-fiber">Fiber (g, optional)</Label>
              <Input id="cf-fiber" inputMode="decimal" {...form.register("fiberG")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-sodium">Sodium (mg, optional)</Label>
              <Input id="cf-sodium" inputMode="decimal" {...form.register("sodiumMg")} />
            </div>
          </div>

          <div className="rounded-xl border p-3 space-y-3">
            <p className="text-sm font-medium">Household serving (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cf-slabel">Label</Label>
                <Input id="cf-slabel" placeholder="1 cup" {...form.register("servingLabel")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-sgrams">Weight (g)</Label>
                <Input id="cf-sgrams" inputMode="decimal" placeholder="61" {...form.register("servingGrams")} />
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Create food"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
