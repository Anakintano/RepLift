"use client";

/**
 * Serving picker: quantity + unit + meal slot with a live nutrition preview
 * computed by the domain engine — the same numbers that will be logged.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Food, MealSlot } from "@/lib/api/types";
import { nutrientsForServing, roundHalfUp } from "@/lib/domain/nutrition";
import { VerificationBadge } from "@/components/food/verification-badge";

const MEALS: { value: MealSlot; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snacks", label: "Snacks" },
];

export function ServingPicker({
  food,
  defaultMeal,
  onConfirm,
  onBack,
  busy,
  initialQuantity,
  initialUnitId,
  confirmLabel = "Log food",
}: {
  food: Food;
  defaultMeal: MealSlot;
  onConfirm: (params: { quantity: number; unitId: string; meal: MealSlot }) => void;
  onBack?: () => void;
  busy?: boolean;
  initialQuantity?: number;
  initialUnitId?: string;
  confirmLabel?: string;
}) {
  const [quantity, setQuantity] = useState(String(initialQuantity ?? food.defaultServing.quantity));
  const [unitId, setUnitId] = useState<string>(initialUnitId ?? String(food.defaultServing.unitId));
  const [meal, setMeal] = useState<MealSlot>(defaultMeal);

  const qty = Number(quantity);
  const valid = Number.isFinite(qty) && qty > 0 && qty <= 5000;

  const preview = useMemo(() => {
    if (!valid) return null;
    try {
      return nutrientsForServing(food, qty, unitId);
    } catch {
      return null;
    }
  }, [food, qty, unitId, valid]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-base">{food.name}</h3>
          <VerificationBadge status={food.verification} />
        </div>
        {food.brand && <p className="text-sm text-muted-foreground">{food.brand}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sp-qty">Amount</Label>
          <Input
            id="sp-qty"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={!valid}
            autoFocus
          />
          {!valid && <p className="text-xs text-destructive">Enter an amount above 0.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sp-unit">Unit</Label>
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger id="sp-unit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {food.servingUnits.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
              <SelectItem value="g">{food.isLiquid ? "ml" : "g"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sp-meal">Meal</Label>
        <Select value={meal} onValueChange={(v) => setMeal(v as MealSlot)}>
          <SelectTrigger id="sp-meal" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEALS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Live preview */}
      <div className="rounded-xl bg-muted/60 p-3.5 grid grid-cols-4 text-center" aria-live="polite">
        {preview ? (
          <>
            <div>
              <p className="text-lg font-bold tnum">{Math.round(preview.nutrients.kcal)}</p>
              <p className="text-[11px] text-muted-foreground font-medium">kcal</p>
            </div>
            <div>
              <p className="text-lg font-bold tnum" style={{ color: "var(--chart-2)" }}>{roundHalfUp(preview.nutrients.proteinG)}g</p>
              <p className="text-[11px] text-muted-foreground font-medium">protein</p>
            </div>
            <div>
              <p className="text-lg font-bold tnum" style={{ color: "var(--chart-3)" }}>{roundHalfUp(preview.nutrients.carbsG)}g</p>
              <p className="text-[11px] text-muted-foreground font-medium">carbs</p>
            </div>
            <div>
              <p className="text-lg font-bold tnum" style={{ color: "var(--chart-4)" }}>{roundHalfUp(preview.nutrients.fatG)}g</p>
              <p className="text-[11px] text-muted-foreground font-medium">fat</p>
            </div>
          </>
        ) : (
          <p className="col-span-4 text-sm text-muted-foreground">Enter a valid amount to preview nutrition.</p>
        )}
        {preview && (
          <p className="col-span-4 text-[11px] text-muted-foreground mt-1.5 tnum">= {roundHalfUp(preview.grams)} {food.isLiquid ? "ml" : "g"} total</p>
        )}
      </div>

      <div className="flex gap-2">
        {onBack && (
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
        )}
        <Button
          className="flex-1"
          disabled={!valid || !preview || busy}
          onClick={() => onConfirm({ quantity: qty, unitId, meal })}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
