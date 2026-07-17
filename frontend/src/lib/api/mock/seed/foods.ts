/**
 * Seed food catalog for the mock backend (~110 foods).
 * Values are per 100 g (or 100 ml for liquids), approximated from USDA
 * FoodData Central / manufacturer labels. Phase 2 replaces this with a
 * real USDA import; ids are deterministic slugs so device data stays
 * consistent across mock-server reseeds.
 */

import type { Food, Nutrients, ServingUnit } from '../../types';

/** Mock-only ranking signal; Phase 2 derives this from log counts. */
export type SeedFood = Food & { popularity: number };

let unitSeq = 0;
function u(label: string, grams: number): ServingUnit {
  unitSeq += 1;
  return { id: `su-${unitSeq}`, label, grams };
}

interface FoodSpec {
  slug: string;
  name: string;
  brand?: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  extra?: Partial<Nutrients>;
  units?: [string, number][];
  liquid?: boolean;
  /** 0-100, drives mock popularity ranking */
  pop?: number;
  source?: Food['source'];
  verification?: Food['verification'];
}

function food(spec: FoodSpec): SeedFood {
  const units = (spec.units ?? []).map(([label, grams]) => u(label, grams));
  const defaultUnit = units[0];
  return {
    id: `food-${spec.slug}`,
    version: 1,
    name: spec.name,
    brand: spec.brand,
    source: spec.source ?? (spec.brand ? 'branded' : 'usda'),
    verification: spec.verification ?? 'verified',
    nutrients: { kcal: spec.kcal, proteinG: spec.p, carbsG: spec.c, fatG: spec.f, ...spec.extra },
    isLiquid: spec.liquid ?? false,
    servingUnits: units,
    defaultServing: defaultUnit ? { unitId: defaultUnit.id, quantity: 1 } : { unitId: 'g', quantity: 100 },
    createdAt: '2026-01-01T00:00:00Z',
    popularity: spec.pop ?? 30,
  };
}

export const SEED_FOODS: SeedFood[] = [
  // ---- Proteins ----
  food({ slug: 'chicken-breast', name: 'Chicken breast, skinless, cooked', kcal: 165, p: 31, c: 0, f: 3.6, extra: { sodiumMg: 74, potassiumMg: 256, cholesterolMg: 85 }, units: [['1 breast (172 g)', 172], ['1 oz', 28.35]], pop: 98 }),
  food({ slug: 'chicken-thigh', name: 'Chicken thigh, skinless, cooked', kcal: 209, p: 26, c: 0, f: 10.9, units: [['1 thigh (116 g)', 116]], pop: 80 }),
  food({ slug: 'egg-whole', name: 'Egg, whole, cooked', kcal: 155, p: 12.6, c: 1.1, f: 10.6, extra: { cholesterolMg: 373, sodiumMg: 124 }, units: [['1 large egg', 50], ['1 medium egg', 44]], pop: 97 }),
  food({ slug: 'egg-white', name: 'Egg white, raw', kcal: 52, p: 10.9, c: 0.7, f: 0.2, units: [['1 large egg white', 33]], pop: 70 }),
  food({ slug: 'salmon', name: 'Salmon, Atlantic, cooked', kcal: 206, p: 22.1, c: 0, f: 12.4, extra: { potassiumMg: 384 }, units: [['1 fillet (154 g)', 154], ['1 oz', 28.35]], pop: 85 }),
  food({ slug: 'tuna-canned', name: 'Tuna, canned in water, drained', kcal: 116, p: 25.5, c: 0, f: 0.8, extra: { sodiumMg: 338 }, units: [['1 can (142 g)', 142]], pop: 78 }),
  food({ slug: 'ground-beef-90', name: 'Ground beef, 90% lean, cooked', kcal: 217, p: 26.1, c: 0, f: 11.7, extra: { ironMg: 2.6 }, units: [['1 patty (85 g)', 85], ['1 oz', 28.35]], pop: 82 }),
  food({ slug: 'beef-steak', name: 'Beef sirloin steak, grilled', kcal: 212, p: 29.9, c: 0, f: 9.6, units: [['1 steak (221 g)', 221]], pop: 72 }),
  food({ slug: 'pork-chop', name: 'Pork chop, boneless, cooked', kcal: 197, p: 27.4, c: 0, f: 9.1, units: [['1 chop (131 g)', 131]], pop: 60 }),
  food({ slug: 'turkey-breast', name: 'Turkey breast, roasted', kcal: 135, p: 30.1, c: 0, f: 0.7, units: [['3 oz', 85]], pop: 65 }),
  food({ slug: 'shrimp', name: 'Shrimp, cooked', kcal: 99, p: 24, c: 0.2, f: 0.3, extra: { cholesterolMg: 189 }, units: [['6 large shrimp', 51]], pop: 66 }),
  food({ slug: 'tofu-firm', name: 'Tofu, firm', kcal: 78, p: 9.4, c: 2.3, f: 4.2, extra: { calciumMg: 201, ironMg: 1.6 }, units: [['½ block (170 g)', 170], ['1 slice (84 g)', 84]], pop: 62 }),
  food({ slug: 'paneer', name: 'Paneer', kcal: 296, p: 20.5, c: 4.5, f: 22, extra: { calciumMg: 480 }, units: [['1 cube (20 g)', 20], ['½ cup cubes (110 g)', 110]], pop: 75 }),
  food({ slug: 'tempeh', name: 'Tempeh', kcal: 192, p: 20.3, c: 7.6, f: 10.8, units: [['½ cup (83 g)', 83]], pop: 40 }),

  // ---- Dairy ----
  food({ slug: 'greek-yogurt', name: 'Greek yogurt, plain, nonfat', kcal: 59, p: 10.2, c: 3.6, f: 0.4, extra: { calciumMg: 110 }, units: [['1 container (170 g)', 170], ['1 cup (245 g)', 245]], pop: 90 }),
  food({ slug: 'yogurt-whole', name: 'Yogurt, plain, whole milk', kcal: 61, p: 3.5, c: 4.7, f: 3.3, extra: { calciumMg: 121 }, units: [['1 cup (245 g)', 245]], pop: 68 }),
  food({ slug: 'milk-2', name: 'Milk, 2% fat', kcal: 50, p: 3.3, c: 4.8, f: 2, extra: { calciumMg: 120 }, units: [['1 cup (244 ml)', 244], ['1 glass (200 ml)', 200]], liquid: true, pop: 88 }),
  food({ slug: 'milk-whole', name: 'Milk, whole', kcal: 61, p: 3.2, c: 4.8, f: 3.3, extra: { calciumMg: 113 }, units: [['1 cup (244 ml)', 244]], liquid: true, pop: 80 }),
  food({ slug: 'milk-almond', name: 'Almond milk, unsweetened', kcal: 15, p: 0.6, c: 0.6, f: 1.2, extra: { calciumMg: 184 }, units: [['1 cup (240 ml)', 240]], liquid: true, pop: 64 }),
  food({ slug: 'cheddar', name: 'Cheddar cheese', kcal: 403, p: 24.9, c: 1.3, f: 33.1, extra: { calciumMg: 721, sodiumMg: 621 }, units: [['1 slice (28 g)', 28], ['1 cup shredded (113 g)', 113]], pop: 76 }),
  food({ slug: 'mozzarella', name: 'Mozzarella, part skim', kcal: 254, p: 24.3, c: 3.1, f: 15.9, extra: { calciumMg: 782 }, units: [['1 oz', 28.35]], pop: 62 }),
  food({ slug: 'cottage-cheese', name: 'Cottage cheese, 2%', kcal: 84, p: 11, c: 4.3, f: 2.3, units: [['½ cup (113 g)', 113]], pop: 58 }),
  food({ slug: 'butter', name: 'Butter, salted', kcal: 717, p: 0.9, c: 0.1, f: 81.1, extra: { sodiumMg: 643, cholesterolMg: 215 }, units: [['1 tbsp (14 g)', 14], ['1 pat (5 g)', 5]], pop: 71 }),
  food({ slug: 'ghee', name: 'Ghee (clarified butter)', kcal: 900, p: 0, c: 0, f: 100, units: [['1 tbsp (13 g)', 13], ['1 tsp (4 g)', 4]], pop: 55 }),

  // ---- Grains & starches ----
  food({ slug: 'white-rice', name: 'White rice, cooked', kcal: 130, p: 2.7, c: 28.2, f: 0.3, units: [['1 cup (158 g)', 158], ['1 bowl (200 g)', 200]], pop: 92 }),
  food({ slug: 'brown-rice', name: 'Brown rice, cooked', kcal: 112, p: 2.3, c: 23.5, f: 0.8, extra: { fiberG: 1.8 }, units: [['1 cup (195 g)', 195]], pop: 74 }),
  food({ slug: 'basmati-rice', name: 'Basmati rice, cooked', kcal: 121, p: 3.5, c: 25.2, f: 0.4, units: [['1 cup (163 g)', 163]], pop: 70 }),
  food({ slug: 'oats', name: 'Oats, rolled, dry', kcal: 379, p: 13.2, c: 67.7, f: 6.5, extra: { fiberG: 10.1, ironMg: 4.3 }, units: [['½ cup (40 g)', 40], ['1 cup (81 g)', 81]], pop: 89 }),
  food({ slug: 'oatmeal-cooked', name: 'Oatmeal, cooked with water', kcal: 71, p: 2.5, c: 12, f: 1.5, extra: { fiberG: 1.7 }, units: [['1 cup (234 g)', 234]], pop: 72 }),
  food({ slug: 'bread-white', name: 'White bread', kcal: 266, p: 8.9, c: 49.4, f: 3.3, extra: { sodiumMg: 490 }, units: [['1 slice (25 g)', 25]], pop: 84 }),
  food({ slug: 'bread-whole-wheat', name: 'Whole wheat bread', kcal: 247, p: 13, c: 41.3, f: 3.4, extra: { fiberG: 6, sodiumMg: 450 }, units: [['1 slice (32 g)', 32]], pop: 81 }),
  food({ slug: 'roti', name: 'Roti / chapati (whole wheat)', kcal: 264, p: 8.8, c: 46.4, f: 5.2, extra: { fiberG: 4.9 }, units: [['1 medium roti (40 g)', 40], ['1 large roti (55 g)', 55]], pop: 86 }),
  food({ slug: 'naan', name: 'Naan, plain', kcal: 310, p: 9, c: 50.4, f: 7.7, units: [['1 piece (90 g)', 90]], pop: 60 }),
  food({ slug: 'pasta-cooked', name: 'Pasta, cooked', kcal: 158, p: 5.8, c: 30.9, f: 0.9, units: [['1 cup (140 g)', 140]], pop: 83 }),
  food({ slug: 'quinoa-cooked', name: 'Quinoa, cooked', kcal: 120, p: 4.4, c: 21.3, f: 1.9, extra: { fiberG: 2.8 }, units: [['1 cup (185 g)', 185]], pop: 58 }),
  food({ slug: 'potato-baked', name: 'Potato, baked, with skin', kcal: 93, p: 2.5, c: 21.2, f: 0.1, extra: { potassiumMg: 535, fiberG: 2.2 }, units: [['1 medium (173 g)', 173]], pop: 77 }),
  food({ slug: 'sweet-potato', name: 'Sweet potato, baked', kcal: 90, p: 2, c: 20.7, f: 0.2, extra: { fiberG: 3.3, potassiumMg: 475 }, units: [['1 medium (114 g)', 114]], pop: 73 }),
  food({ slug: 'tortilla-flour', name: 'Flour tortilla', kcal: 306, p: 8.2, c: 50.4, f: 7.7, units: [['1 tortilla (49 g)', 49]], pop: 61 }),
  food({ slug: 'idli', name: 'Idli', kcal: 132, p: 4.1, c: 27.6, f: 0.4, units: [['1 idli (39 g)', 39]], pop: 57 }),
  food({ slug: 'dosa', name: 'Dosa, plain', kcal: 168, p: 3.9, c: 29.4, f: 3.7, units: [['1 dosa (86 g)', 86]], pop: 59 }),
  food({ slug: 'poha', name: 'Poha (flattened rice, cooked)', kcal: 130, p: 2.6, c: 25.9, f: 1.5, units: [['1 plate (180 g)', 180]], pop: 52 }),

  // ---- Legumes ----
  food({ slug: 'dal-cooked', name: 'Dal, cooked (lentils)', kcal: 116, p: 9, c: 20.1, f: 0.4, extra: { fiberG: 7.9, ironMg: 3.3 }, units: [['1 cup (198 g)', 198], ['1 katori (150 g)', 150]], pop: 79 }),
  food({ slug: 'chickpeas', name: 'Chickpeas, cooked', kcal: 164, p: 8.9, c: 27.4, f: 2.6, extra: { fiberG: 7.6 }, units: [['1 cup (164 g)', 164]], pop: 71 }),
  food({ slug: 'black-beans', name: 'Black beans, cooked', kcal: 132, p: 8.9, c: 23.7, f: 0.5, extra: { fiberG: 8.7 }, units: [['1 cup (172 g)', 172]], pop: 63 }),
  food({ slug: 'rajma', name: 'Rajma (kidney beans), cooked', kcal: 127, p: 8.7, c: 22.8, f: 0.5, extra: { fiberG: 6.4 }, units: [['1 cup (177 g)', 177]], pop: 56 }),
  food({ slug: 'edamame', name: 'Edamame, shelled', kcal: 121, p: 11.9, c: 8.9, f: 5.2, extra: { fiberG: 5.2 }, units: [['1 cup (155 g)', 155]], pop: 48 }),
  food({ slug: 'hummus', name: 'Hummus', kcal: 166, p: 7.9, c: 14.3, f: 9.6, extra: { fiberG: 6 }, units: [['2 tbsp (30 g)', 30]], pop: 65 }),

  // ---- Vegetables ----
  food({ slug: 'broccoli', name: 'Broccoli, steamed', kcal: 35, p: 2.4, c: 7.2, f: 0.4, extra: { fiberG: 3.3, vitaminCMg: 64.9 }, units: [['1 cup (156 g)', 156]], pop: 75 }),
  food({ slug: 'spinach', name: 'Spinach, raw', kcal: 23, p: 2.9, c: 3.6, f: 0.4, extra: { ironMg: 2.7, fiberG: 2.2 }, units: [['1 cup (30 g)', 30], ['1 bunch (340 g)', 340]], pop: 72 }),
  food({ slug: 'carrot', name: 'Carrot, raw', kcal: 41, p: 0.9, c: 9.6, f: 0.2, extra: { fiberG: 2.8 }, units: [['1 medium (61 g)', 61], ['1 cup chopped (128 g)', 128]], pop: 67 }),
  food({ slug: 'tomato', name: 'Tomato, raw', kcal: 18, p: 0.9, c: 3.9, f: 0.2, extra: { vitaminCMg: 13.7 }, units: [['1 medium (123 g)', 123]], pop: 70 }),
  food({ slug: 'cucumber', name: 'Cucumber, with peel', kcal: 15, p: 0.7, c: 3.6, f: 0.1, units: [['½ cup slices (52 g)', 52], ['1 cucumber (301 g)', 301]], pop: 61 }),
  food({ slug: 'bell-pepper', name: 'Bell pepper, red, raw', kcal: 31, p: 1, c: 6, f: 0.3, extra: { vitaminCMg: 127.7 }, units: [['1 medium (119 g)', 119]], pop: 59 }),
  food({ slug: 'onion', name: 'Onion, raw', kcal: 40, p: 1.1, c: 9.3, f: 0.1, units: [['1 medium (110 g)', 110]], pop: 62 }),
  food({ slug: 'cauliflower', name: 'Cauliflower, cooked', kcal: 23, p: 1.8, c: 4.1, f: 0.5, extra: { fiberG: 2.3 }, units: [['1 cup (124 g)', 124]], pop: 54 }),
  food({ slug: 'green-beans', name: 'Green beans, cooked', kcal: 35, p: 1.9, c: 7.9, f: 0.3, extra: { fiberG: 3.2 }, units: [['1 cup (125 g)', 125]], pop: 50 }),
  food({ slug: 'mixed-salad', name: 'Mixed green salad, no dressing', kcal: 17, p: 1.2, c: 3.3, f: 0.2, extra: { fiberG: 1.8 }, units: [['1 bowl (85 g)', 85]], pop: 69 }),
  food({ slug: 'mushrooms', name: 'Mushrooms, white, raw', kcal: 22, p: 3.1, c: 3.3, f: 0.3, units: [['1 cup sliced (70 g)', 70]], pop: 53 }),
  food({ slug: 'corn', name: 'Corn, sweet, cooked', kcal: 96, p: 3.4, c: 21, f: 1.5, extra: { fiberG: 2.4 }, units: [['1 ear (103 g)', 103], ['1 cup (149 g)', 149]], pop: 55 }),

  // ---- Fruits ----
  food({ slug: 'banana', name: 'Banana', kcal: 89, p: 1.1, c: 22.8, f: 0.3, extra: { potassiumMg: 358, fiberG: 2.6 }, units: [['1 medium (118 g)', 118], ['1 large (136 g)', 136]], pop: 95 }),
  food({ slug: 'apple', name: 'Apple, with skin', kcal: 52, p: 0.3, c: 13.8, f: 0.2, extra: { fiberG: 2.4 }, units: [['1 medium (182 g)', 182]], pop: 93 }),
  food({ slug: 'orange', name: 'Orange', kcal: 47, p: 0.9, c: 11.8, f: 0.1, extra: { vitaminCMg: 53.2 }, units: [['1 medium (131 g)', 131]], pop: 78 }),
  food({ slug: 'strawberries', name: 'Strawberries', kcal: 32, p: 0.7, c: 7.7, f: 0.3, extra: { vitaminCMg: 58.8 }, units: [['1 cup halves (152 g)', 152]], pop: 74 }),
  food({ slug: 'blueberries', name: 'Blueberries', kcal: 57, p: 0.7, c: 14.5, f: 0.3, extra: { fiberG: 2.4 }, units: [['1 cup (148 g)', 148]], pop: 76 }),
  food({ slug: 'grapes', name: 'Grapes, red or green', kcal: 69, p: 0.7, c: 18.1, f: 0.2, units: [['1 cup (151 g)', 151]], pop: 66 }),
  food({ slug: 'mango', name: 'Mango', kcal: 60, p: 0.8, c: 15, f: 0.4, extra: { vitaminCMg: 36.4 }, units: [['1 cup pieces (165 g)', 165], ['1 mango (336 g)', 336]], pop: 72 }),
  food({ slug: 'watermelon', name: 'Watermelon', kcal: 30, p: 0.6, c: 7.6, f: 0.2, units: [['1 cup diced (152 g)', 152]], pop: 58 }),
  food({ slug: 'avocado', name: 'Avocado', kcal: 160, p: 2, c: 8.5, f: 14.7, extra: { fiberG: 6.7, potassiumMg: 485 }, units: [['½ avocado (100 g)', 100], ['1 avocado (201 g)', 201]], pop: 82 }),
  food({ slug: 'pomegranate', name: 'Pomegranate arils', kcal: 83, p: 1.7, c: 18.7, f: 1.2, extra: { fiberG: 4 }, units: [['½ cup (87 g)', 87]], pop: 47 }),

  // ---- Nuts, seeds, fats ----
  food({ slug: 'almonds', name: 'Almonds', kcal: 579, p: 21.2, c: 21.6, f: 49.9, extra: { fiberG: 12.5, calciumMg: 269 }, units: [['1 oz (23 nuts)', 28.35], ['¼ cup (36 g)', 36]], pop: 81 }),
  food({ slug: 'peanut-butter', name: 'Peanut butter, smooth', kcal: 588, p: 25.1, c: 19.6, f: 50.4, extra: { sodiumMg: 426 }, units: [['1 tbsp (16 g)', 16], ['2 tbsp (32 g)', 32]], pop: 87 }),
  food({ slug: 'walnuts', name: 'Walnuts', kcal: 654, p: 15.2, c: 13.7, f: 65.2, units: [['1 oz (14 halves)', 28.35]], pop: 60 }),
  food({ slug: 'cashews', name: 'Cashews, roasted', kcal: 574, p: 15.3, c: 32.7, f: 46.4, units: [['1 oz (18 nuts)', 28.35]], pop: 64 }),
  food({ slug: 'chia-seeds', name: 'Chia seeds', kcal: 486, p: 16.5, c: 42.1, f: 30.7, extra: { fiberG: 34.4, calciumMg: 631 }, units: [['1 tbsp (12 g)', 12]], pop: 56 }),
  food({ slug: 'olive-oil', name: 'Olive oil', kcal: 884, p: 0, c: 0, f: 100, units: [['1 tbsp (13.5 g)', 13.5], ['1 tsp (4.5 g)', 4.5]], pop: 77 }),
  food({ slug: 'coconut-oil', name: 'Coconut oil', kcal: 892, p: 0, c: 0, f: 99.1, units: [['1 tbsp (13.6 g)', 13.6]], pop: 45 }),

  // ---- Snacks & packaged ----
  food({ slug: 'protein-bar', name: 'Protein bar, chocolate', brand: 'Quest', kcal: 350, p: 35, c: 40, f: 13.3, extra: { fiberG: 23.3, sodiumMg: 500 }, units: [['1 bar (60 g)', 60]], pop: 68 }),
  food({ slug: 'whey-protein', name: 'Whey protein powder', brand: 'Optimum Nutrition', kcal: 375, p: 75, c: 12.5, f: 3.1, extra: { calciumMg: 417 }, units: [['1 scoop (32 g)', 32]], pop: 91 }),
  food({ slug: 'granola', name: 'Granola', kcal: 471, p: 10, c: 64.5, f: 20.3, extra: { fiberG: 7 }, units: [['½ cup (61 g)', 61]], pop: 57 }),
  food({ slug: 'dark-chocolate', name: 'Dark chocolate, 70-85%', kcal: 598, p: 7.8, c: 45.9, f: 42.6, extra: { ironMg: 11.9, fiberG: 10.9 }, units: [['1 square (10 g)', 10], ['1 bar (101 g)', 101]], pop: 73 }),
  food({ slug: 'potato-chips', name: 'Potato chips, salted', brand: "Lay's", kcal: 536, p: 7, c: 52.9, f: 34.6, extra: { sodiumMg: 525 }, units: [['1 small bag (28 g)', 28], ['10 chips (20 g)', 20]], pop: 69 }),
  food({ slug: 'popcorn', name: 'Popcorn, air-popped', kcal: 387, p: 12.9, c: 77.8, f: 4.5, extra: { fiberG: 14.5 }, units: [['1 cup popped (8 g)', 8]], pop: 51 }),
  food({ slug: 'oreo', name: 'Oreo cookies', brand: 'Nabisco', kcal: 480, p: 4.7, c: 72.4, f: 20, extra: { sugarG: 40 }, units: [['1 cookie (11.3 g)', 11.3], ['3 cookies (34 g)', 34]], pop: 66 }),
  food({ slug: 'ice-cream-vanilla', name: 'Ice cream, vanilla', kcal: 207, p: 3.5, c: 23.6, f: 11, extra: { sugarG: 21.2 }, units: [['½ cup (66 g)', 66], ['1 scoop (72 g)', 72]], pop: 71 }),
  food({ slug: 'samosa', name: 'Samosa', kcal: 262, p: 4.7, c: 30.5, f: 13.3, units: [['1 samosa (85 g)', 85]], pop: 54 }),
  food({ slug: 'trail-mix', name: 'Trail mix, nuts & raisins', kcal: 462, p: 13.8, c: 44.9, f: 29.4, units: [['¼ cup (37 g)', 37]], pop: 49 }),

  // ---- Meals & prepared ----
  food({ slug: 'pizza-cheese', name: 'Pizza, cheese, regular crust', kcal: 266, p: 11.4, c: 33.3, f: 9.7, extra: { sodiumMg: 598, calciumMg: 188 }, units: [['1 slice (107 g)', 107]], pop: 84 }),
  food({ slug: 'burger-cheeseburger', name: 'Cheeseburger, fast food', brand: "McDonald's", kcal: 263, p: 13.9, c: 28.2, f: 10.5, extra: { sodiumMg: 621 }, units: [['1 burger (114 g)', 114]], pop: 75 }),
  food({ slug: 'fries', name: 'French fries, fast food', kcal: 312, p: 3.4, c: 41.4, f: 15, extra: { sodiumMg: 210 }, units: [['1 medium serving (117 g)', 117], ['1 small serving (71 g)', 71]], pop: 79 }),
  food({ slug: 'chicken-biryani', name: 'Chicken biryani', kcal: 165, p: 8.2, c: 20.3, f: 5.8, units: [['1 plate (350 g)', 350], ['1 cup (163 g)', 163]], pop: 74 }),
  food({ slug: 'butter-chicken', name: 'Butter chicken', kcal: 175, p: 12.8, c: 5.2, f: 11.6, units: [['1 serving (220 g)', 220]], pop: 63 }),
  food({ slug: 'palak-paneer', name: 'Palak paneer', kcal: 152, p: 6.8, c: 6.5, f: 11.4, units: [['1 serving (200 g)', 200]], pop: 52 }),
  food({ slug: 'chole', name: 'Chole (chickpea curry)', kcal: 148, p: 6.5, c: 18.2, f: 5.7, units: [['1 katori (160 g)', 160]], pop: 55 }),
  food({ slug: 'sushi-roll', name: 'Sushi, California roll', kcal: 129, p: 3.8, c: 22.9, f: 2.4, extra: { sodiumMg: 428 }, units: [['1 roll, 8 pieces (189 g)', 189], ['1 piece (24 g)', 24]], pop: 61 }),
  food({ slug: 'burrito-bowl', name: 'Burrito bowl, chicken', brand: 'Chipotle', kcal: 132, p: 9.9, c: 12.6, f: 4.6, units: [['1 bowl (510 g)', 510]], pop: 67 }),
  food({ slug: 'caesar-salad', name: 'Caesar salad with chicken', kcal: 127, p: 10.9, c: 4.5, f: 7.3, units: [['1 salad (280 g)', 280]], pop: 62 }),
  food({ slug: 'pancakes', name: 'Pancakes, plain', kcal: 227, p: 6.4, c: 28.3, f: 9.7, units: [['1 pancake (77 g)', 77], ['stack of 3 (231 g)', 231]], pop: 65 }),
  food({ slug: 'peanut-butter-sandwich', name: 'Peanut butter sandwich', kcal: 341, p: 12.4, c: 36.2, f: 17.3, units: [['1 sandwich (93 g)', 93]], pop: 59 }),

  // ---- Beverages ----
  food({ slug: 'coffee-black', name: 'Coffee, black', kcal: 1, p: 0.1, c: 0, f: 0, units: [['1 cup (240 ml)', 240]], liquid: true, pop: 85 }),
  food({ slug: 'coffee-latte', name: 'Latte with 2% milk', kcal: 42, p: 2.3, c: 3.8, f: 1.9, units: [['1 tall (354 ml)', 354], ['1 small (240 ml)', 240]], liquid: true, pop: 73 }),
  food({ slug: 'chai', name: 'Chai with milk and sugar', kcal: 62, p: 1.6, c: 9.8, f: 1.9, units: [['1 cup (180 ml)', 180]], liquid: true, pop: 68 }),
  food({ slug: 'orange-juice', name: 'Orange juice, fresh', kcal: 45, p: 0.7, c: 10.4, f: 0.2, extra: { vitaminCMg: 50, sugarG: 8.4 }, units: [['1 glass (248 ml)', 248]], liquid: true, pop: 63 }),
  food({ slug: 'coca-cola', name: 'Coca-Cola', brand: 'Coca-Cola', kcal: 42, p: 0, c: 10.6, f: 0, extra: { sugarG: 10.6 }, units: [['1 can (355 ml)', 355], ['1 bottle (500 ml)', 500]], liquid: true, pop: 70 }),
  food({ slug: 'beer', name: 'Beer, regular', kcal: 43, p: 0.5, c: 3.6, f: 0, units: [['1 can (355 ml)', 355], ['1 pint (473 ml)', 473]], liquid: true, pop: 54 }),
  food({ slug: 'red-wine', name: 'Wine, red', kcal: 85, p: 0.1, c: 2.6, f: 0, units: [['1 glass (147 ml)', 147]], liquid: true, pop: 50 }),
  food({ slug: 'smoothie-berry', name: 'Berry smoothie with yogurt', kcal: 62, p: 2.1, c: 12.3, f: 0.8, units: [['1 glass (350 ml)', 350]], liquid: true, pop: 57 }),
  food({ slug: 'coconut-water', name: 'Coconut water', kcal: 19, p: 0.7, c: 3.7, f: 0.2, extra: { potassiumMg: 250 }, units: [['1 cup (240 ml)', 240]], liquid: true, pop: 46 }),
];

/** Case/whitespace-insensitive synonym map used by mock search. Phase 2 mirrors this server-side. */
export const SEARCH_SYNONYMS: Record<string, string[]> = {
  chapati: ['roti'],
  flatbread: ['roti', 'naan', 'tortilla'],
  soda: ['coca-cola', 'cola'],
  coke: ['coca-cola'],
  pb: ['peanut butter'],
  yoghurt: ['yogurt'],
  curd: ['yogurt'],
  aubergine: ['eggplant'],
  garbanzo: ['chickpeas'],
  lentils: ['dal'],
  chana: ['chickpeas', 'chole'],
  protein: ['whey protein', 'protein bar'],
  shake: ['smoothie', 'whey protein'],
};
