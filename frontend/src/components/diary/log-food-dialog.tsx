"use client";

/**
 * The logging hub: Search / Recent / Saved meals / AI "Describe" tabs.
 * Two-step flow — pick a food, then the serving picker. AI parsing always
 * produces a *preview the user confirms*; nothing is logged automatically.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ScanBarcode, Sparkles, History, Bookmark, ChevronRight, Info, WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ServingPicker } from "./serving-picker";
import { getClient } from "@/lib/api/client";
import type { Food, FoodSearchResult, LocalDate, MealSlot, ParsedFoodItem } from "@/lib/api/types";
import { logFood } from "@/lib/log";
import { createEntry } from "@/lib/sync/outbox";
import { useOnline } from "@/lib/sync/connectivity";
import { errorMessage, isNetworkError } from "@/lib/api/problem";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function FoodRow({ result, onPick }: { result: FoodSearchResult; onPick: (f: Food) => void }) {
  const f = result.food;
  const per = f.defaultServing.unitId === "g" ? null : f.servingUnits.find((u) => u.id === f.defaultServing.unitId);
  const kcalPerDefault = per ? Math.round((f.nutrients.kcal * per.grams * f.defaultServing.quantity) / 100) : Math.round(f.nutrients.kcal);
  // NOTE: the row is a div with a button *inside* — the ranking tooltip is
  // its own button and nested <button> is invalid HTML (hydration error).
  return (
    <div className="w-full flex items-center gap-3 rounded-lg px-3 py-1 hover:bg-accent transition-colors">
      <button
        type="button"
        onClick={() => onPick(f)}
        className="flex-1 min-w-0 flex items-center gap-3 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-ring rounded-md"
      >
        <span className="flex-1 min-w-0 block">
          <span className="font-medium truncate block">{f.name}</span>
          <span className="text-xs text-muted-foreground truncate block">
            {f.brand ? `${f.brand} · ` : ""}
            {per ? per.label : "100 g"} · <span className="tnum">{kcalPerDefault} kcal</span>
          </span>
        </span>
        {result.explain.personalBoost > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0">frequent</Badge>
        )}
        {result.explain.fuzzy && <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">close match</Badge>}
      </button>
      <div className="flex items-center gap-1.5 shrink-0">
        <Tooltip>
          <TooltipTrigger aria-label="Why this ranking?">
            <Info className="size-3.5 text-muted-foreground/60" />
          </TooltipTrigger>
          <TooltipContent side="left" className="tnum text-xs">
            score {result.score} = text {result.explain.textScore} + popularity {result.explain.popularityBoost} + personal {result.explain.personalBoost}
          </TooltipContent>
        </Tooltip>
        <ChevronRight className="size-4 text-muted-foreground/50" aria-hidden />
      </div>
    </div>
  );
}

function SimpleFoodRow({ food, onPick }: { food: Food; onPick: (f: Food) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(food)}
      className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-accent transition-colors focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{food.name}</p>
        <p className="text-xs text-muted-foreground truncate">{food.brand ?? food.source === "user" ? "My food" : ""}</p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground/50 shrink-0" aria-hidden />
    </button>
  );
}

const CONFIDENCE_STYLES = { high: "text-success", medium: "text-warning", low: "text-destructive" } as const;

export function LogFoodDialog({
  open,
  onOpenChange,
  date,
  defaultMeal = "breakfast",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: LocalDate;
  defaultMeal?: MealSlot;
}) {
  const online = useOnline();
  const [tab, setTab] = useState("search");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const [picked, setPicked] = useState<Food | null>(null);
  const [busy, setBusy] = useState(false);

  // AI tab state
  const [aiText, setAiText] = useState("");
  const [aiItems, setAiItems] = useState<ParsedFoodItem[] | null>(null);
  const [aiDegraded, setAiDegraded] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  /** Close + reset in one place — an event handler, not an effect. */
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPicked(null);
      setQuery("");
      setAiItems(null);
      setAiText("");
      setAiDegraded(false);
    }
    onOpenChange(next);
  };

  const search = useQuery({
    queryKey: ["food-search", debouncedQuery],
    queryFn: async () => (await getClient()).foods.search(debouncedQuery),
    enabled: open && debouncedQuery.trim().length >= 2,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const recent = useQuery({
    queryKey: ["foods", "recent"],
    queryFn: async () => (await getClient()).foods.recent(),
    enabled: open && tab === "recent",
  });

  const frequent = useQuery({
    queryKey: ["foods", "frequent"],
    queryFn: async () => (await getClient()).foods.frequent(),
    enabled: open && tab === "recent",
  });

  const savedMeals = useQuery({
    queryKey: ["savedMeals"],
    queryFn: async () => (await getClient()).savedMeals.list(),
    enabled: open && tab === "saved",
  });

  const confirmLog = async (params: { quantity: number; unitId: string; meal: MealSlot }) => {
    if (!picked) return;
    setBusy(true);
    try {
      await logFood({ date, food: picked, ...params });
      toast.success(`${picked.name} logged${online ? "" : " — will sync when you're back online"}`);
      handleOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const logSavedMeal = async (mealId: string) => {
    const meal = savedMeals.data?.find((m) => m.id === mealId);
    if (!meal) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      for (const item of meal.items) {
        await createEntry({
          id: crypto.randomUUID(),
          userId: "me",
          revision: 0,
          date,
          loggedAt: now,
          updatedAt: now,
          deleted: false,
          kind: "food",
          meal: defaultMeal,
          foodId: item.foodId,
          foodVersion: item.foodVersion,
          foodName: item.foodName,
          quantity: item.quantity,
          unitId: String(item.unitId),
          unitLabel: "serving",
          grams: item.grams,
          nutrients: item.nutrients,
        });
      }
      toast.success(`${meal.name} logged (${meal.items.length} items)`);
      handleOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const runAiParse = async () => {
    setAiBusy(true);
    setAiItems(null);
    try {
      const client = await getClient();
      const res = await client.ai.parseFoodLog(aiText);
      setAiItems(res.items);
      setAiDegraded(res.degraded);
    } catch (e) {
      if (isNetworkError(e)) {
        setAiDegraded(true);
        setAiItems([]);
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setAiBusy(false);
    }
  };

  const logAiItem = async (item: ParsedFoodItem) => {
    if (!item.match) return;
    const food = item.match.food;
    // map parsed unit to a serving unit if we can, else default serving
    const unit =
      (item.unit && food.servingUnits.find((u) => u.label.toLowerCase().includes(item.unit!))) ??
      (item.unit === "g" || item.unit === "ml" ? null : food.servingUnits.find((u) => u.id === food.defaultServing.unitId));
    await logFood({
      date,
      meal: defaultMeal,
      food,
      quantity: item.quantity,
      unitId: unit ? unit.id : "g",
    });
  };

  const logAllAi = async () => {
    if (!aiItems) return;
    setBusy(true);
    try {
      const loggable = aiItems.filter((i) => i.match);
      for (const item of loggable) await logAiItem(item);
      toast.success(`${loggable.length} item${loggable.length === 1 ? "" : "s"} logged`);
      handleOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const searchBody = (() => {
    if (debouncedQuery.trim().length < 2) {
      return (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Search className="size-8 mx-auto mb-3 opacity-30" aria-hidden />
          Search 100k+ foods — try “chicken breast” or “dal”.
          <br />
          Typos are okay.
        </div>
      );
    }
    if (search.isPending) {
      return (
        <div className="space-y-2 py-2" aria-busy>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      );
    }
    if (search.isError) {
      return (
        <div className="py-10 text-center text-sm">
          <p className="text-destructive font-medium mb-2">{errorMessage(search.error)}</p>
          <Button size="sm" variant="outline" onClick={() => void search.refetch()}>
            Try again
          </Button>
        </div>
      );
    }
    if (!search.data || search.data.items.length === 0) {
      return (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">No foods match “{debouncedQuery}”.</p>
          <p>Check the spelling, or create it as a custom food from the Foods page.</p>
        </div>
      );
    }
    return (
      <div className="space-y-0.5 -mx-1">
        {search.data.items.map((r) => (
          <FoodRow key={r.food.id} result={r} onPick={setPicked} />
        ))}
      </div>
    );
  })();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85dvh] overflow-y-auto">
        {picked ? (
          <>
            <DialogHeader>
              <DialogTitle>Log food</DialogTitle>
              <DialogDescription className="sr-only">Choose the amount and meal</DialogDescription>
            </DialogHeader>
            <ServingPicker food={picked} defaultMeal={defaultMeal} onConfirm={(p) => void confirmLog(p)} onBack={() => setPicked(null)} busy={busy} />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add to diary</DialogTitle>
              <DialogDescription className="sr-only">Search foods, pick recents, or describe your meal</DialogDescription>
            </DialogHeader>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full">
                <TabsTrigger value="search" className="flex-1 gap-1.5">
                  <Search className="size-3.5" aria-hidden /> Search
                </TabsTrigger>
                <TabsTrigger value="recent" className="flex-1 gap-1.5">
                  <History className="size-3.5" aria-hidden /> Recent
                </TabsTrigger>
                <TabsTrigger value="saved" className="flex-1 gap-1.5">
                  <Bookmark className="size-3.5" aria-hidden /> Saved
                </TabsTrigger>
                <TabsTrigger value="ai" className="flex-1 gap-1.5">
                  <Sparkles className="size-3.5" aria-hidden /> Describe
                </TabsTrigger>
              </TabsList>

              <TabsContent value="search" className="mt-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search foods…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    aria-label="Search foods"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" aria-label="Scan barcode (coming soon)" disabled>
                        <ScanBarcode className="size-4.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Barcode scanning arrives with the mobile app</TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 min-h-64">{searchBody}</div>
              </TabsContent>

              <TabsContent value="recent" className="mt-3 min-h-64">
                {recent.isPending || frequent.isPending ? (
                  <div className="space-y-2" aria-busy>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <>
                    {(frequent.data?.length ?? 0) > 0 && (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-1">Most logged</p>
                        <div className="space-y-0.5 -mx-1 mb-3">
                          {frequent.data!.slice(0, 5).map((f) => (
                            <SimpleFoodRow key={f.id} food={f} onPick={setPicked} />
                          ))}
                        </div>
                      </>
                    )}
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-1">Recent</p>
                    {(recent.data?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground px-1 py-6 text-center">Foods you log appear here for quick re-logging.</p>
                    ) : (
                      <div className="space-y-0.5 -mx-1">
                        {recent.data!.map((f) => (
                          <SimpleFoodRow key={f.id} food={f} onPick={setPicked} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="saved" className="mt-3 min-h-64">
                {savedMeals.isPending ? (
                  <div className="space-y-2" aria-busy>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 rounded-lg" />
                    ))}
                  </div>
                ) : (savedMeals.data?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    Save a combination of foods as a meal from the Foods page, then log it in one tap.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {savedMeals.data!.map((m) => {
                      const kcal = Math.round(m.items.reduce((s, i) => s + i.nutrients.kcal, 0));
                      return (
                        <div key={m.id} className="flex items-center gap-3 rounded-xl border p-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{m.name}</p>
                            <p className="text-xs text-muted-foreground tnum">
                              {m.items.length} items · {kcal} kcal
                            </p>
                          </div>
                          <Button size="sm" disabled={busy} onClick={() => void logSavedMeal(m.id)}>
                            Log all
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="ai" className="mt-3 min-h-64 space-y-3">
                <Textarea
                  placeholder={'Describe what you ate — e.g. "2 eggs, a slice of whole wheat toast and a latte"'}
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  rows={3}
                  aria-label="Describe your meal"
                />
                <Button onClick={() => void runAiParse()} disabled={aiText.trim().length < 3 || aiBusy} className="w-full">
                  <Sparkles className="size-4" aria-hidden /> {aiBusy ? "Understanding your meal…" : "Parse with AI"}
                </Button>

                {aiDegraded && (
                  <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm flex gap-2">
                    <WifiOff className="size-4 text-warning shrink-0 mt-0.5" aria-hidden />
                    <p>
                      AI parsing isn't available right now. You can still log everything manually from the Search tab —
                      nothing is lost.
                    </p>
                  </div>
                )}

                {aiItems && aiItems.length > 0 && (
                  <div className="space-y-2" aria-live="polite">
                    <p className="text-xs text-muted-foreground">
                      Review before logging — AI can misread amounts. Items without a match need manual search.
                    </p>
                    {aiItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground truncate">“{item.rawText}”</p>
                          {item.match ? (
                            <p className="font-medium truncate">
                              {item.quantity} × {item.match.food.name}
                            </p>
                          ) : (
                            <p className="font-medium text-muted-foreground">No confident match</p>
                          )}
                        </div>
                        <span className={cn("text-[11px] font-semibold uppercase", CONFIDENCE_STYLES[item.confidence])}>
                          {item.confidence}
                        </span>
                        {item.match ? (
                          <Button size="sm" variant="outline" onClick={() => setPicked(item.match!.food)}>
                            Review
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTab("search");
                              setQuery(item.name);
                            }}
                          >
                            Search
                          </Button>
                        )}
                      </div>
                    ))}
                    {aiItems.some((i) => i.match) && (
                      <Button className="w-full" disabled={busy} onClick={() => void logAllAi()}>
                        Log {aiItems.filter((i) => i.match).length} matched item
                        {aiItems.filter((i) => i.match).length === 1 ? "" : "s"}
                      </Button>
                    )}
                  </div>
                )}
                {aiItems && aiItems.length === 0 && !aiDegraded && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Couldn't find foods in that description — try naming the foods directly.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
