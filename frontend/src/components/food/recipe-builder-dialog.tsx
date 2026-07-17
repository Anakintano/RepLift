"use client";

/**
 * Recipe builder: name + servings + ingredient list (added via food search),
 * with per-serving nutrition computed live by the domain engine.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getClient } from "@/lib/api/client";
import type { Food } from "@/lib/api/types";
import { recipePerServing, roundHalfUp } from "@/lib/domain/nutrition";
import { errorMessage } from "@/lib/api/problem";
import { toast } from "sonner";

interface DraftIngredient {
  key: string;
  food: Food;
  grams: number;
}

export function RecipeBuilderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [servings, setServings] = useState("4");
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const servingsNum = Number(servings);
  const servingsValid = Number.isFinite(servingsNum) && servingsNum >= 1 && servingsNum <= 100;

  const search = useQuery({
    queryKey: ["recipe-ing-search", query],
    queryFn: async () => (await getClient()).foods.search(query, { pageSize: 6 }),
    enabled: open && searching && query.trim().length >= 2,
  });

  const perServing = useMemo(() => {
    if (!servingsValid || ingredients.length === 0) return null;
    return recipePerServing(
      ingredients.map((i) => ({ grams: i.grams, per100: i.food.nutrients })),
      servingsNum,
    );
  }, [ingredients, servingsNum, servingsValid]);

  const reset = () => {
    setName("");
    setServings("4");
    setIngredients([]);
    setQuery("");
    setSearching(false);
  };

  const save = useMutation({
    mutationFn: async () => {
      const client = await getClient();
      return client.recipes.create({
        name: name.trim(),
        servings: servingsNum,
        ingredients: ingredients.map((i) => ({
          id: crypto.randomUUID(),
          foodId: i.food.id,
          foodVersion: i.food.version,
          foodName: i.food.name,
          quantity: i.grams,
          unitId: "g",
          grams: i.grams,
        })),
      });
    },
    onSuccess: (r) => {
      toast.success(`Recipe "${r.name}" saved — ${Math.round(r.perServing.kcal)} kcal per serving`);
      void qc.invalidateQueries({ queryKey: ["recipes"] });
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const canSave = name.trim().length >= 2 && servingsValid && ingredients.length > 0 && !save.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New recipe</DialogTitle>
          <DialogDescription>Add ingredients by weight; nutrition per serving is computed for you.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="rb-name">Recipe name</Label>
            <Input id="rb-name" placeholder="e.g. Overnight oats" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rb-servings">Servings</Label>
            <Input id="rb-servings" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} aria-invalid={!servingsValid} />
          </div>
        </div>

        {/* Ingredients */}
        <div className="space-y-2">
          <Label>Ingredients</Label>
          {ingredients.length === 0 && !searching && (
            <p className="text-sm text-muted-foreground">No ingredients yet.</p>
          )}
          {ingredients.map((ing) => (
            <div key={ing.key} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ing.food.name}</p>
                <p className="text-xs text-muted-foreground tnum">
                  {Math.round((ing.food.nutrients.kcal * ing.grams) / 100)} kcal
                </p>
              </div>
              <Input
                inputMode="decimal"
                className="w-20 h-8 text-right tnum"
                value={ing.grams}
                aria-label={`Grams of ${ing.food.name}`}
                onChange={(e) => {
                  const g = Number(e.target.value);
                  setIngredients((list) =>
                    list.map((x) => (x.key === ing.key ? { ...x, grams: Number.isFinite(g) && g >= 0 ? g : 0 } : x)),
                  );
                }}
              />
              <span className="text-xs text-muted-foreground">g</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${ing.food.name}`}
                onClick={() => setIngredients((list) => list.filter((x) => x.key !== ing.key))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}

          {searching ? (
            <div className="rounded-lg border p-2 space-y-1.5">
              <div className="relative">
                <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  className="pl-8"
                  placeholder="Search ingredient…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  aria-label="Search ingredient"
                />
              </div>
              {search.isPending && query.trim().length >= 2 && <Skeleton className="h-20 rounded-md" aria-busy />}
              {search.data?.items.map((r) => (
                <button
                  key={r.food.id}
                  type="button"
                  className="w-full text-left rounded-md px-2.5 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => {
                    setIngredients((list) => [...list, { key: crypto.randomUUID(), food: r.food, grams: 100 }]);
                    setQuery("");
                    setSearching(false);
                  }}
                >
                  {r.food.name}
                  {r.food.brand && <span className="text-muted-foreground"> · {r.food.brand}</span>}
                </button>
              ))}
              {search.data && search.data.items.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-1.5">No matches.</p>
              )}
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setSearching(true)}>
              <Plus className="size-4" aria-hidden /> Add ingredient
            </Button>
          )}
        </div>

        {/* Per-serving preview */}
        {perServing && (
          <div className="rounded-xl bg-muted/60 p-3.5 grid grid-cols-4 text-center" aria-live="polite">
            <div>
              <p className="text-lg font-bold tnum">{Math.round(perServing.kcal)}</p>
              <p className="text-[11px] text-muted-foreground font-medium">kcal/serving</p>
            </div>
            <div>
              <p className="text-lg font-bold tnum" style={{ color: "var(--chart-2)" }}>{roundHalfUp(perServing.proteinG)}g</p>
              <p className="text-[11px] text-muted-foreground font-medium">protein</p>
            </div>
            <div>
              <p className="text-lg font-bold tnum" style={{ color: "var(--chart-3)" }}>{roundHalfUp(perServing.carbsG)}g</p>
              <p className="text-[11px] text-muted-foreground font-medium">carbs</p>
            </div>
            <div>
              <p className="text-lg font-bold tnum" style={{ color: "var(--chart-4)" }}>{roundHalfUp(perServing.fatG)}g</p>
              <p className="text-[11px] text-muted-foreground font-medium">fat</p>
            </div>
          </div>
        )}

        <Button className="w-full" disabled={!canSave} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save recipe"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
