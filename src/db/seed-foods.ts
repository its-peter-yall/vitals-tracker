import "server-only";
import type { NutrientMap } from "../lib/nutrients/types.ts";
import type { Db } from "./index.ts";
import { foods } from "./schema.ts";

type SeedFood = typeof foods.$inferInsert;
const referenceDate = "2026-11-26T00:00:00.000Z";
const keys = [
  "protein", "carbohydrates", "fiber", "totalSugars", "sodium", "water", "calcium", "iron",
  "potassium", "vitaminC", "vitaminA", "vitaminB9", "vitaminB12", "vitaminD",
] as const;

// USDA ARS SR28 ABBREV: https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/dnload/sr28abbr.zip
// NDB ID | name | aliases split with ";" | ml density (blank = g) | nutrient columns in keys order
const stapleText = `
01003|Ghee|clarified butter;desi ghee||0.28 0 0 0 2 0.24 4 0 5 0 840 0 0.01 0
01009|Cheddar cheese|cheddar||22.87 3.09 0 0.48 653 37.02 710 0.14 76 0 330 27 1.1 0.6
01012|Creamed cottage cheese|cottage cheese||11.12 3.38 0 2.67 364 79.79 83 0.07 104 0 37 12 0.43 0.1
01116|Plain whole-milk yogurt|curd;dahi;plain yoghurt;unsweetened yogurt;दही||3.47 4.66 0 4.66 46 87.9 121 0.05 155 0.5 27 7 0.37 0.1
01129|Hard-boiled egg|egg;boiled egg;anda||12.58 1.12 0 1.12 124 74.62 50 1.19 126 0 149 44 1.11 2.2
01132|Scrambled egg|scrambled eggs||9.99 1.61 0 1.39 145 76.4 66 1.31 132 0 161 36 0.76 1.8
01174|Reduced-fat milk (2%, unfortified)|2 percent milk;2% milk|1.03|3.3 4.8 0 5.06 47 89.21 120 0.02 140 0.2 28 5 0.53 0
01211|Whole cow's milk (unfortified)|milk;doodh;whole milk|1.03|3.15 4.78 0 5.05 43 88.13 113 0.03 132 0 46 5 0.45 0.1
01256|Plain nonfat Greek yogurt|greek yoghurt;greek yogurt||10.19 3.6 0 3.24 36 85.1 110 0.07 141 0 1 7 0.75 0
02014|Cumin seed|jeera;cumin||17.81 44.24 10.5 2.25 168 8.06 931 66.36 1788 7.7 64 10 0 0
02047|Table salt|salt;namak||0 0 0 0 38758 0.2 24 0.33 8 0 0 0 0 0
04053|Olive oil|cooking olive oil||0 0 0 0 2 0 1 0.56 1 0 0 0 0 0
05064|Roast chicken breast (skinless)|chicken breast;roasted chicken||31.02 0 0 0 74 65.26 15 1.04 256 0 6 4 0.34 0.1
08121|Oatmeal (cooked in water)|oats;oat porridge;cooked oats||2.54 12 1.7 0.27 4 83.61 9 0.9 70 0 0 6 0 0
09003|Apple (with skin)|apple;seb||0.26 13.81 2.4 10.39 1 85.56 6 0.12 107 4.6 3 3 0 0
09037|Avocado|butter fruit||2 8.53 6.7 0.66 7 73.23 12 0.55 485 10 7 81 0 0
09040|Banana|kela;raw ripe banana||1.09 22.84 2.6 12.23 1 74.91 5 0.26 358 8.7 3 20 0 0
09050|Blueberries|blueberry||0.74 14.49 2.4 9.96 1 84.21 6 0.28 77 9.7 3 6 0 0
09132|Grapes|grape;angoor||0.72 18.1 0.9 15.48 2 80.54 10 0.36 191 3.2 3 2 0 0
09139|Guava|amrood||2.55 14.32 5.4 8.92 2 80.8 18 0.26 417 228.3 31 49 0 0
09148|Green kiwi|kiwifruit;kiwi||1.14 14.66 3 8.99 3 83.07 34 0.31 312 92.7 4 25 0 0
09152|Fresh lemon juice|lemon juice|1|0.35 6.9 0.3 2.52 1 92.31 6 0.08 103 38.7 0 20 0 0
09160|Fresh lime juice|lime juice|1|0.42 8.42 0.4 1.69 2 90.79 14 0.09 117 30 2 10 0 0
09176|Mango|aam;ripe mango||0.82 14.98 1.6 13.66 1 83.46 11 0.16 168 36.4 54 43 0 0
09200|Orange|santra;whole orange||0.94 11.75 2.4 9.35 0 86.75 40 0.1 181 53.2 11 30 0 0
09206|Fresh orange juice|orange juice;oj|1.04|0.7 10.4 0.2 8.4 1 88.3 11 0.2 200 50 10 30 0 0
09226|Papaya|papita||0.47 10.82 1.7 7.82 8 88.06 20 0.25 182 60.9 47 37 0 0
09252|Pear|nashpati||0.36 15.23 3.1 9.75 1 83.96 9 0.18 116 4.3 1 7 0 0
09266|Pineapple|ananas||0.54 13.12 1.4 9.85 1 86 13 0.29 109 47.8 3 18 0 0
09286|Pomegranate arils|pomegranate;anar||1.67 18.7 4 13.67 3 77.93 10 0.3 236 10.2 0 38 0 0
09298|Seedless raisins|raisins;kishmish||3.07 79.18 3.7 59.19 11 15.43 50 1.88 749 2.3 0 5 0 0
09316|Strawberries|strawberry||0.67 7.68 2 4.89 1 90.95 16 0.41 153 58.8 1 24 0 0
09326|Watermelon|tarbooz||0.61 7.55 0.4 6.2 1 91.45 7 0.24 112 8.1 28 3 0 0
09421|Medjool dates|dates;khajoor||1.81 74.97 6.7 66.47 1 21.32 64 0.9 696 0 7 15 - 0
11053|Boiled green beans|green beans;snap beans||1.89 7.88 3.2 3.63 1 89.22 44 0.65 146 9.7 32 33 0 0
11081|Boiled beetroot|beetroot;cooked beets;chukandar||1.68 9.96 2 7.96 77 87.06 16 0.79 305 3.6 2 80 0 0
11091|Boiled broccoli|broccoli;cooked broccoli||2.38 7.18 3.3 1.39 41 89.25 40 0.67 293 64.9 77 108 0 0
11109|Raw cabbage|cabbage;patta gobi||1.28 5.8 2.5 3.2 18 92.18 40 0.47 170 36.6 5 43 0 0
11124|Raw carrot|carrot;gajar||0.93 9.58 2.8 4.74 69 88.29 33 0.3 320 5.9 835 19 0 0
11135|Raw cauliflower|cauliflower;phool gobi||1.92 4.97 2 1.91 30 92.07 22 0.42 299 48.2 0 57 0 0
11143|Raw celery|celery||0.69 2.97 1.6 1.34 80 95.43 40 0.2 260 3.1 22 36 0 0
11165|Fresh coriander leaves|cilantro;dhania;fresh coriander||2.13 3.67 2.8 0.87 46 92.21 67 1.77 521 27 337 62 0 0
11168|Boiled sweet corn|sweet corn;corn kernels||3.41 20.98 2.4 4.54 1 73.41 3 0.45 218 5.5 13 23 0 0
11205|Raw cucumber (with peel)|cucumber;kheera||0.65 3.63 0.5 1.67 2 95.23 16 0.28 147 2.8 5 7 0 0
11210|Cooked eggplant|eggplant;aubergine;baingan||0.83 8.73 2.5 3.2 1 89.67 6 0.25 123 1.3 2 14 0 0
11212|Cooked edamame|edamame;green soybeans||11.91 8.91 5.2 2.18 6 72.77 63 2.27 436 6.1 15 311 0 0
11215|Fresh garlic|garlic;lahsun||6.36 33.06 2.1 1 17 58.58 181 1.7 401 31.2 0 3 0 0
11216|Fresh ginger|ginger;adrak||1.82 17.77 2 1.7 13 78.89 16 0.6 415 5 0 11 0 0
11234|Boiled kale|kale;cooked kale||1.9 5.63 2 1.25 23 91.2 72 0.9 228 41 681 13 0 0
11251|Raw romaine lettuce|romaine;cos lettuce||1.23 3.29 2.1 1.19 8 94.61 33 0.97 247 4 436 136 0 0
11260|Raw button mushrooms|mushrooms;white mushrooms||3.09 3.26 1 1.98 5 92.45 3 0.5 318 2.1 0 17 0.04 0.2
11279|Boiled okra|okra;bhindi;lady fingers||1.87 4.51 2.5 2.4 6 92.57 77 0.28 135 16.3 14 46 0 0
11282|Raw onion|onion;pyaz||1.1 9.34 1.7 4.24 4 89.11 23 0.21 146 7.4 0 19 0 0
11305|Boiled green peas|peas;green peas;matar||5.36 15.63 5.5 5.93 3 77.87 27 1.54 271 14.2 40 63 0 0
11365|Boiled potato (flesh)|potato;aloo;boiled potatoes||1.87 20.13 1.8 0.91 4 76.98 5 0.31 379 13 0 10 0 0
11423|Boiled pumpkin|pumpkin;kaddu||0.72 4.9 1.1 2.08 1 93.69 15 0.57 230 4.7 288 9 0 0
11457|Raw spinach|spinach;palak||2.86 3.63 2.2 0.42 79 91.4 99 2.71 558 28.1 469 194 0 0
11478|Cooked zucchini|zucchini;courgette||1.14 2.69 1 1.71 3 95.22 18 0.37 264 12.9 56 28 0 0
11508|Baked sweet potato (flesh)|sweet potato;shakarkandi||2.01 20.71 3.3 6.48 36 75.78 38 0.69 475 19.6 961 6 0 0
11529|Raw tomato|tomato;tamatar||0.88 3.89 1.2 2.63 5 94.52 10 0.27 237 13.7 42 15 0 0
11670|Fresh green chili|green chilli;hari mirch||2 9.46 1.5 5.1 7 87.74 18 1.2 340 242.5 59 23 0 0
12006|Chia seeds|chia||16.54 42.12 34.4 - 16 5.8 631 7.72 407 1.6 - - 0 -
12014|Dried pumpkin seed kernels|pumpkin seeds;pepitas||30.23 10.71 6 1.4 7 5.23 46 8.82 809 1.9 1 58 0 0
12061|Almonds|almond;badam||21.15 21.55 12.5 4.35 1 4.41 269 3.71 733 0 0 44 0 0
12087|Raw cashews|cashew;kaju||18.22 30.19 3.3 5.91 12 5.2 37 6.68 660 0.5 0 25 0 0
12104|Fresh coconut meat|coconut;nariyal||3.33 15.23 9 6.23 20 46.99 14 2.43 356 3.3 0 26 0 0
12119|Fresh coconut water|coconut water;nariyal pani|1|0.72 3.71 1.1 2.61 105 94.99 24 0.29 250 2.4 0 3 0 0
12151|Raw pistachios|pistachio;pista||20.16 27.17 10.6 7.66 1 4.37 105 3.92 1025 5.6 26 51 0 0
12155|Walnuts|walnut;akhrot||15.23 13.71 6.7 2.61 2 4.07 98 2.91 441 1.3 1 98 0 0
12201|Hulled sesame seeds|sesame;til||20.45 11.73 11.6 0.48 47 3.75 60 6.36 370 0 3 115 0 0
12220|Flaxseed|flax;linseed;alsi||18.29 28.88 27.3 1.55 30 6.96 255 5.73 813 0.6 0 87 0 0
14209|Black coffee (brewed)|coffee;plain coffee|1|0.12 0 0 0 2 99.39 2 0.01 49 0 0 2 0 0
14278|Green tea (plain, brewed)|green tea|1|0.22 0 0 0 1 99.93 0 0.02 8 0.3 0 0 0 0
14355|Black tea (plain, brewed)|black tea|1|0 0.3 0 0 3 99.7 0 0.02 37 0 0 5 0 0
14555|Plain drinking water|water;pani;bottled water|1|0 0 0 0 2 99.98 10 0 0 0 0 0 0 0
15121|Light tuna (canned in water, drained)|tuna;canned tuna||19.44 0 0 0 247 78.14 17 1.63 179 0 17 4 2.55 1.2
15237|Cooked farmed Atlantic salmon|salmon;cooked salmon||22.1 0 0 0 61 64.75 15 0.34 384 3.7 69 34 2.8 13.1
15271|Cooked shrimp|shrimp;prawns||23.98 0.2 - - 111 74.33 70 0.51 259 - - - - -
16015|Black beans (boiled)|black beans||8.86 23.71 8.7 0.32 1 65.74 27 2.1 355 0 0 149 0 0
16033|Kidney beans (boiled)|kidney beans;red kidney beans||8.67 22.8 7.4 0.32 2 66.94 28 2.94 403 1.2 0 130 0 0
16043|Pinto beans (boiled)|pinto beans||9.01 26.22 9 0.34 1 62.95 46 2.09 436 0.8 0 172 0 0
16057|Chickpeas (boiled)|chickpeas;garbanzo beans;chana||8.86 27.42 7.6 4.8 7 60.21 49 2.89 291 1.3 1 172 0 0
16070|Lentils (boiled)|lentils;plain lentils||9.02 20.13 7.9 1.8 2 69.64 19 3.33 369 1.5 0 181 0 0
16081|Mung beans (boiled)|mung beans;whole moong||7.02 19.15 7.6 2 2 72.66 27 1.4 266 1 1 159 0 0
16086|Split peas (boiled)|split peas||8.34 21.1 8.3 2.9 2 69.49 14 1.29 362 0.4 0 65 0 0
16087|Raw peanuts|peanuts;groundnuts;moongphali||25.8 16.13 8.5 4.72 18 6.5 92 4.58 705 0 0 240 0 0
16102|Pigeon peas (boiled)|pigeon peas;toor;arhar||6.76 23.25 6.7 - 5 68.55 43 1.11 384 0 0 111 0 0
16137|Homemade hummus|hummus;chickpea dip||4.86 20.12 4 0.27 242 64.87 49 1.56 173 7.9 0 59 0 0
16398|Smooth unsalted peanut butter|peanut butter||22.21 22.31 5 10.49 17 1.23 49 1.74 558 0 0 87 0 0
16426|Firm calcium-set tofu|tofu;firm tofu||17.27 2.78 2.3 - 14 69.83 683 2.66 237 0.2 - 29 0 0
18069|White sandwich bread|white bread;sliced white bread||8.85 49.42 2.7 5.67 490 36.42 144 3.61 126 0 0 171 0 0
18075|Whole-wheat sandwich bread|whole wheat bread;wholemeal bread||12.45 42.71 6 4.34 455 39.01 161 2.47 254 0 0 42 0 0
18363|Corn tortilla|corn tortillas;maize tortilla||5.7 44.64 6.3 0.88 45 45.89 81 1.23 186 0 0 5 0 0
19335|Granulated sugar|sugar;table sugar;chini||0 99.98 0 99.8 1 0.02 1 0.05 2 0 0 0 0 0
20010|Cooked buckwheat groats|buckwheat;kasha||3.38 19.94 2.7 0.9 4 75.63 7 0.8 88 0 0 14 0 0
20029|Cooked couscous|couscous||3.79 23.22 1.4 0.1 5 72.57 8 0.38 58 0 0 15 0 0
20032|Cooked millet|millet;millet grain||3.51 23.67 1.3 0.13 2 71.41 3 0.63 62 0 0 19 0 0
20037|Cooked brown rice|brown rice||2.74 25.58 1.6 0.24 4 70.27 3 0.56 86 0 0 9 0 0
20061|White rice flour|rice flour;chawal atta||5.95 80.13 2.4 0.12 0 11.89 10 0.35 76 0 0 4 0 0
20137|Cooked quinoa|quinoa||4.4 21.3 2.8 0.87 7 71.61 17 1.49 172 0 0 42 0 0
20421|Cooked plain pasta|pasta;boiled pasta;spaghetti||5.8 30.86 1.8 0.56 1 62.13 7 0.5 44 0 0 7 0 0
20445|Cooked white rice|rice;white rice;chawal;plain rice||2.69 28.17 0.4 0.05 1 68.44 10 0.2 35 0 0 3 0 0
20466|Dry semolina|semolina;sooji;suji;rava||12.68 72.83 3.9 - 1 12.67 17 1.23 186 0 0 72 0 0
20649|Whole-wheat flour|wheat flour;atta;wholemeal flour||9.61 74.48 13.1 1.02 3 12.42 33 3.71 394 0 0 28 - 0
28307|Plain commercial naan|naan;plain nan||9.62 50.43 2.2 3.55 465 32.6 84 3.25 125 - - - - -
`.trim();

function seedRow(id: string, name: string, aliases: string, defaultUnit: "g" | "ml",
  nutrientsPer100Json: NutrientMap): SeedFood {
  return {
    id, userId: null, name, aliasesJson: aliases.split(";"), defaultUnit,
    nutrientsPer100Json, source: "curated", createdAt: referenceDate,
  };
}

function rounded(amount: number) {
  return Number(amount.toFixed(4));
}

// SR28 lists sugars for milk independently of carbohydrate-by-difference; don't equate those columns.
const staples = stapleText.split("\n").map((line) => {
  const [id, name, aliases, density, columns] = line.split("|");
  const values = columns.split(" ");
  if (values.length !== keys.length) throw new Error(`Invalid SR28 row: ${id}`);
  const per100: NutrientMap = {};
  for (const [index, key] of keys.entries()) {
    if (values[index] !== "-") per100[key] = rounded(Number(values[index]) * (density ? Number(density) : 1));
  }
  return { ndb: id, row: seedRow(`00000000-0000-8000-8000-0000000${id}`, name, aliases,
    density ? "ml" : "g", per100) };
});

export async function seedFoods(db: Db): Promise<void> {
  const rows = staples.map(({ row }) => row);
  for (let i = 0; i < rows.length; i += 40) {
    await db.insert(foods).values(rows.slice(i, i + 40)).onConflictDoNothing({ target: foods.id });
  }
}
