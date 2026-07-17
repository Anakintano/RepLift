"use client";

/**
 * Food diary: date navigation, meal sections, per-entry sync badges,
 * edit (serving change) and delete with undo-style feedback, day totals.
 */

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { LogFoodDialog } from "@/components/diary/log-food-dialog";
import { ServingPicker } from "@/components/diary/serving-picker";
import { WaterCard } from "@/components/diary/water-card";
import { SyncBadge } from "@/components/sync/sync-badge";
import { useDayEntries, useDaySummary, useGoal } from "@/lib/hooks/use-diary";
import { useProfile } from "@/lib/hooks/use-auth";
import { addDays, friendlyDay, todayIn } from "@/lib/domain/dates";
import { nutrientsForServing, roundHalfUp } from "@/lib/domain/nutrition";
import { deleteEntry, updateEntry } from "@/lib/sync/outbox";
import { getClient } from "@/lib/api/client";
import type { DiaryEntry, Food, FoodEntry, LocalDate, MealSlot } from "@/lib/api/types";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/problem";

const MEAL_ORDER: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Breakfast" },
  { slot: "lunch", label: "Lunch" },
  { slot: "dinner", label: "Dinner" },
  { slot: "snacks", label: "Snacks" },
];

function EditFoodDialog({ entry, onClose }: { entry: FoodEntry; onClose: () => void }) {
  const [food, setFood] = useState<Food | null>(null);
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    getClient()
      .then((c) => c.foods.get(entry.foodId))
      .then(setFood)
      .catch((e) => setError(errorMessage(e)));
  }, [entry.foodId]);

  const save = async (params: { quantity: number; unitId: string; meal: MealSlot }) => {
    if (!food) return;
    const { grams, nutrients } = nutrientsForServing(food, params.quantity, params.unitId);
    const unit = params.unitId === "g" ? null : food.servingUnits.find((u) => u.id === params.unitId);
    await updateEntry(entry.id, {
      quantity: params.quantity,
      unitId: params.unitId,
      unitLabel: unit ? unit.label : food.isLiquid ? "ml" : "g",
      grams,
      nutrients,
      meal: params.meal,
    });
    toast.success("Entry updated");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit entry</DialogTitle>
          <DialogDescription className="sr-only">Change amount, unit or meal</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : !food ? (
          <div className="space-y-3 py-2" aria-busy>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : (
          <ServingPicker
            food={food}
            defaultMeal={entry.meal}
            initialQuantity={entry.quantity}
            initialUnitId={String(entry.unitId)}
            confirmLabel="Save changes"
            onConfirm={(p) => void save(p)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DiaryInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: profile } = useProfile();
  const tz = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayIn(tz);
  const date = (params.get("date") as LocalDate | null) ?? today;

  const entries = useDayEntries(date);
  const summary = useDaySummary(date);
  const goal = useGoal();
  const [logOpen, setLogOpen] = useState(false);
  const [logMeal, setLogMeal] = useState<MealSlot>("breakfast");
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  const setDate = (d: LocalDate) => router.replace(`/diary?date=${d}`);

  const foods = (entries ?? []).filter((e): e is FoodEntry => e.kind === "food");

  const remove = async (e: DiaryEntry) => {
    await deleteEntry(e.id);
    toast.success("Entry removed", { description: "Removed from your diary on all devices once synced." });
  };

  return (
    <div className="space-y-5">
      {/* Date nav */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <CalendarDays className="size-6 text-primary" aria-hidden /> Diary
        </h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            className="min-w-32 font-semibold"
            onClick={() => setDate(today)}
            aria-label={`Showing ${friendlyDay(date, tz)}. Jump to today`}
          >
            {friendlyDay(date, tz)}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => setDate(addDays(date, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Day totals strip */}
      {summary ? (
        <div className="rounded-2xl border bg-card p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div>
            <p className="text-lg font-extrabold tnum">{Math.round(summary.consumed.kcal).toLocaleString("en-US")}</p>
            <p className="text-[11px] font-medium text-muted-foreground">kcal eaten</p>
          </div>
          <div>
            <p className={`text-lg font-extrabold tnum ${summary.remainingKcal < 0 ? "text-destructive" : "text-success"}`}>
              {Math.abs(summary.remainingKcal).toLocaleString("en-US")}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground">{summary.remainingKcal < 0 ? "kcal over" : "kcal left"}</p>
          </div>
          <div>
            <p className="text-lg font-extrabold tnum" style={{ color: "var(--chart-2)" }}>{roundHalfUp(summary.consumed.proteinG)}g</p>
            <p className="text-[11px] font-medium text-muted-foreground">protein</p>
          </div>
          <div>
            <p className="text-lg font-extrabold tnum" style={{ color: "var(--chart-3)" }}>{roundHalfUp(summary.consumed.carbsG)}g</p>
            <p className="text-[11px] font-medium text-muted-foreground">carbs</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-lg font-extrabold tnum" style={{ color: "var(--chart-4)" }}>{roundHalfUp(summary.consumed.fatG)}g</p>
            <p className="text-[11px] font-medium text-muted-foreground">fat</p>
          </div>
        </div>
      ) : (
        <Skeleton className="h-20 rounded-2xl" />
      )}

      {/* Meals */}
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          {MEAL_ORDER.map(({ slot, label }) => {
            const items = foods.filter((f) => f.meal === slot);
            const kcal = Math.round(items.reduce((s, f) => s + f.nutrients.kcal, 0));
            return (
              <Card key={slot}>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base">{label}</CardTitle>
                  <div className="flex items-center gap-2">
                    {kcal > 0 && <span className="text-sm text-muted-foreground tnum">{kcal.toLocaleString("en-US")} kcal</span>}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Add food to ${label}`}
                      onClick={() => {
                        setLogMeal(slot);
                        setLogOpen(true);
                      }}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {entries === undefined ? (
                    <div className="space-y-2" aria-busy>
                      <Skeleton className="h-10 rounded-lg" />
                    </div>
                  ) : items.length === 0 ? (
                    <button
                      type="button"
                      className="w-full rounded-lg border border-dashed py-4 text-sm text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                      onClick={() => {
                        setLogMeal(slot);
                        setLogOpen(true);
                      }}
                    >
                      Nothing logged — add {label.toLowerCase()}
                    </button>
                  ) : (
                    <ul className="divide-y">
                      {items.map((f) => (
                        <li key={f.id} className="flex items-center gap-3 py-2 group">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{f.foodName}</p>
                            <p className="text-xs text-muted-foreground tnum">
                              {f.quantity} × {f.unitLabel} · {roundHalfUp(f.grams)} g
                            </p>
                          </div>
                          <SyncBadge state={f.syncState} />
                          <span className="text-sm text-muted-foreground tnum shrink-0">{Math.round(f.nutrients.kcal)} kcal</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Options for ${f.foodName}`}>
                                <Pencil className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditing(f)}>
                                <Pencil className="size-4" aria-hidden /> Edit amount
                              </DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onClick={() => void remove(f)}>
                                <Trash2 className="size-4" aria-hidden /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <WaterCard date={date} targetMl={goal?.waterTargetMl ?? 3000} />
        </div>
      </div>

      <LogFoodDialog open={logOpen} onOpenChange={setLogOpen} date={date} defaultMeal={logMeal} />
      {editing && <EditFoodDialog entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export default function DiaryPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <DiaryInner />
    </Suspense>
  );
}
