"use client";

/** Foods hub: recipes, my custom foods, saved meals. */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Plus, UtensilsCrossed, Bookmark, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreateFoodDialog } from "@/components/food/create-food-dialog";
import { RecipeBuilderDialog } from "@/components/food/recipe-builder-dialog";
import { VerificationBadge } from "@/components/food/verification-badge";
import { getClient } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/problem";
import { roundHalfUp } from "@/lib/domain/nutrition";
import { toast } from "sonner";

export default function FoodsPage() {
  const qc = useQueryClient();
  const [createFoodOpen, setCreateFoodOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [deleteRecipe, setDeleteRecipe] = useState<string | null>(null);

  const recipes = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => (await getClient()).recipes.list(),
  });

  const myFoods = useQuery({
    queryKey: ["my-foods"],
    queryFn: async () => {
      const client = await getClient();
      const page = await client.foods.search("", { pageSize: 100 });
      // empty query returns nothing by design — fetch user foods via frequent+recent merge fallback
      const recent = await client.foods.recent(50);
      const own = recent.filter((f) => f.source === "user");
      return own.length > 0 ? own : page.items.map((r) => r.food).filter((f) => f.source === "user");
    },
  });

  const savedMeals = useQuery({
    queryKey: ["savedMeals"],
    queryFn: async () => (await getClient()).savedMeals.list(),
  });

  const removeRecipe = useMutation({
    mutationFn: async (id: string) => (await getClient()).recipes.remove(id),
    onSuccess: () => {
      toast.success("Recipe deleted");
      void qc.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const removeSaved = useMutation({
    mutationFn: async (id: string) => (await getClient()).savedMeals.remove(id),
    onSuccess: () => {
      toast.success("Saved meal removed");
      void qc.invalidateQueries({ queryKey: ["savedMeals"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <UtensilsCrossed className="size-6 text-primary" aria-hidden /> Foods
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCreateFoodOpen(true)}>
            <Plus className="size-4" aria-hidden /> Custom food
          </Button>
          <Button onClick={() => setRecipeOpen(true)}>
            <ChefHat className="size-4" aria-hidden /> New recipe
          </Button>
        </div>
      </div>

      <Tabs defaultValue="recipes">
        <TabsList>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="mine">My foods</TabsTrigger>
          <TabsTrigger value="saved">Saved meals</TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="mt-4">
          {recipes.isPending ? (
            <div className="grid sm:grid-cols-2 gap-4" aria-busy>
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : recipes.isError ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-destructive text-sm font-medium mb-3">{errorMessage(recipes.error)}</p>
                <Button variant="outline" size="sm" onClick={() => void recipes.refetch()}>
                  Try again
                </Button>
              </CardContent>
            </Card>
          ) : recipes.data!.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center text-sm text-muted-foreground">
                <ChefHat className="size-10 mx-auto mb-3 opacity-30" aria-hidden />
                <p className="font-medium text-foreground mb-1">No recipes yet</p>
                <p className="mb-4">Batch-cook once, log a portion in one tap forever.</p>
                <Button size="sm" onClick={() => setRecipeOpen(true)}>
                  <Plus className="size-4" aria-hidden /> Create your first recipe
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {recipes.data!.map((r) => (
                <Card key={r.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{r.name}</p>
                        {r.description && <p className="text-xs text-muted-foreground truncate">{r.description}</p>}
                      </div>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete recipe ${r.name}`} onClick={() => setDeleteRecipe(r.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 tnum">
                      {r.ingredients.length} ingredients · makes {r.servings} servings
                    </p>
                    <div className="rounded-lg bg-muted/60 px-3 py-2 grid grid-cols-4 text-center">
                      <div>
                        <p className="text-sm font-bold tnum">{Math.round(r.perServing.kcal)}</p>
                        <p className="text-[10px] text-muted-foreground">kcal</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tnum" style={{ color: "var(--chart-2)" }}>{roundHalfUp(r.perServing.proteinG)}g</p>
                        <p className="text-[10px] text-muted-foreground">protein</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tnum" style={{ color: "var(--chart-3)" }}>{roundHalfUp(r.perServing.carbsG)}g</p>
                        <p className="text-[10px] text-muted-foreground">carbs</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tnum" style={{ color: "var(--chart-4)" }}>{roundHalfUp(r.perServing.fatG)}g</p>
                        <p className="text-[10px] text-muted-foreground">fat</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">per serving</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mine" className="mt-4">
          {myFoods.isPending ? (
            <Skeleton className="h-40 rounded-2xl" aria-busy />
          ) : (myFoods.data?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-14 text-center text-sm text-muted-foreground">
                <UtensilsCrossed className="size-10 mx-auto mb-3 opacity-30" aria-hidden />
                <p className="font-medium text-foreground mb-1">No custom foods yet</p>
                <p className="mb-4">Can't find something in search? Add it from its nutrition label.</p>
                <Button size="sm" onClick={() => setCreateFoodOpen(true)}>
                  <Plus className="size-4" aria-hidden /> Create custom food
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y">
                {myFoods.data!.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground tnum">
                        {Math.round(f.nutrients.kcal)} kcal · P {roundHalfUp(f.nutrients.proteinG)} · C {roundHalfUp(f.nutrients.carbsG)} · F {roundHalfUp(f.nutrients.fatG)} per 100 {f.isLiquid ? "ml" : "g"}
                      </p>
                    </div>
                    <VerificationBadge status={f.verification} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="saved" className="mt-4">
          {savedMeals.isPending ? (
            <Skeleton className="h-40 rounded-2xl" aria-busy />
          ) : (savedMeals.data?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-14 text-center text-sm text-muted-foreground">
                <Bookmark className="size-10 mx-auto mb-3 opacity-30" aria-hidden />
                <p className="font-medium text-foreground mb-1">No saved meals</p>
                <p>Save your go-to combos and log them in one tap from the diary.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {savedMeals.data!.map((m) => {
                const kcal = Math.round(m.items.reduce((s, i) => s + i.nutrients.kcal, 0));
                return (
                  <Card key={m.id}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="font-semibold">{m.name}</p>
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove saved meal ${m.name}`} onClick={() => removeSaved.mutate(m.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2 tnum">{m.items.length} items · {kcal} kcal</p>
                      <ul className="text-sm text-muted-foreground space-y-0.5">
                        {m.items.map((i, idx) => (
                          <li key={idx} className="truncate">• {i.foodName}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateFoodDialog open={createFoodOpen} onOpenChange={setCreateFoodOpen} />
      <RecipeBuilderDialog open={recipeOpen} onOpenChange={setRecipeOpen} />

      <AlertDialog open={deleteRecipe !== null} onOpenChange={(o) => !o && setDeleteRecipe(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recipe?</AlertDialogTitle>
            <AlertDialogDescription>
              Meals you already logged from it keep their nutrition — only the recipe itself is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteRecipe) removeRecipe.mutate(deleteRecipe);
                setDeleteRecipe(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
