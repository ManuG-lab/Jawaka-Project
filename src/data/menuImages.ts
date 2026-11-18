import { MenuCategory, MenuItem } from '../types';

const IMG = {
  soup: '/src/assets/images/food_soup_bowl_1795008045988.jpg',
  sukuma: '/src/assets/images/food_sukuma_greens_1795008046311.jpg',
  beans: '/src/assets/images/food_beans_ndengu_1795008047005.jpg',
  ugali: '/src/assets/images/food_ugali_plate_1795008046644.jpg',
  rice: '/src/assets/images/food_white_rice_1795008046474.jpg',
  kachumbari: '/src/assets/images/food_kachumbari_salad_1795008048687.jpg',
  pilau: '/src/assets/images/food_beef_pilau_1795008048013.jpg',
  mukimo: '/src/assets/images/food_mukimo_mash_1795008049454.jpg',
  githeri: '/src/assets/images/food_githeri_stew_1795008048458.jpg',
  omelette: '/src/assets/images/food_eggs_omelette_1795008048212.jpg',
  pasta: '/src/assets/images/food_pasta_noodles_1795008049922.jpg',
  matumbo: '/src/assets/images/food_matumbo_stew_1795008049064.jpg',
  matoke: '/src/assets/images/food_matoke_stew_1795008050429.jpg',
  beef: '/src/assets/images/special_beef_kikwetu_1795003274652.jpg',
  chicken: '/src/assets/images/food_chicken_plate_1795008050167.jpg',
  fish: '/src/assets/images/food_fried_tilapia_1795008052037.jpg',
  ugaliEgg: '/src/assets/images/food_ugali_sukuma_1795008051649.jpg',
  ugaliOmena: '/src/assets/images/food_ugali_omena_1795008053032.jpg',
  chapoMix: '/src/assets/images/food_chapo_mix_1795008053107.jpg',
  chapati: '/src/assets/images/food_chapati_stack_1795008053092.jpg',
  chaiMandazi: '/src/assets/images/breakfast_chai_mandazi_1795003275816.jpg',
  smokieSausage: '/src/assets/images/food_smokie_sausage_1795008054471.jpg',
  chips: '/src/assets/images/food_chips_fries_1795008054653.jpg',
  chipsMasala: '/src/assets/images/food_chips_masala_1795008055719.jpg',
  pastries: '/src/assets/images/food_pastry_cakes_1795008055141.jpg',
  breadPotato: '/src/assets/images/food_bread_potato_1795008056131.jpg',
  dawa: '/src/assets/images/food_dawa_tea_1795008057904.jpg',
  porridgeMaziwa: '/src/assets/images/food_porridge_maziwa_1795008056595.jpg',
  coldSodas: '/src/assets/images/food_cold_sodas_1795008058036.jpg',
  juiceShake: '/src/assets/images/food_mango_juice_1795008058711.jpg',
  breakfastCombo: '/src/assets/images/food_breakfast_plate_1795008058603.jpg',
  spread: '/src/assets/images/hero_jawaka_spread_1795003276742.jpg',
} as const;

const MENU_IMAGE_BY_ID: Record<string, string> = {
  // Meals
  meals_chicken_soup: IMG.soup,
  meals_beef_soup: IMG.soup,
  meals_sukuma_cabbage: IMG.sukuma,
  meals_beans_ndengu: IMG.beans,
  meals_ugali: IMG.ugali,
  meals_rice: IMG.rice,
  meals_kachumbari: IMG.kachumbari,
  meals_pilau: IMG.pilau,
  meals_mashed_potato: IMG.mukimo,
  meals_mukimo_plain: IMG.mukimo,
  meals_pilau_special: IMG.pilau,
  meals_kienyeji_vegetables: IMG.sukuma,
  meals_githeri: IMG.githeri,
  meals_scrambled_egg: IMG.omelette,
  meals_minji: IMG.beans,
  meals_pasta_noodles: IMG.pasta,
  meals_matumbo: IMG.matumbo,
  meals_matoke: IMG.matoke,
  meals_beef_plain: IMG.beef,
  meals_chicken_piece: IMG.chicken,
  meals_minced_meat: IMG.beef,
  meals_fish: IMG.fish,

  // Comrade's Corner
  comrade_s_corner_sukuma_ugali: IMG.ugali,
  comrade_s_corner_chapo_mix: IMG.chapoMix,
  comrade_s_corner_rice_mix: IMG.chapoMix,
  comrade_s_corner_jawaka_mix_chapo_dengu_rice: IMG.chapoMix,
  comrade_s_corner_fried_egg_ugali: IMG.ugaliEgg,
  comrade_s_corner_omena_ugali: IMG.ugaliOmena,

  // Beverages
  beverages_white_tea: IMG.chaiMandazi,
  beverages_black_tea: IMG.chaiMandazi,
  beverages_porridge: IMG.porridgeMaziwa,
  beverages_mineral_water: IMG.coldSodas,
  beverages_lemon_ginger_tea: IMG.dawa,
  beverages_white_black_chocolate: IMG.chaiMandazi,
  beverages_white_black_coffee: IMG.chaiMandazi,
  beverages_soda_fanta_300ml: IMG.coldSodas,
  beverages_soda_pepsi_350ml: IMG.coldSodas,
  beverages_fruit_pudding: IMG.juiceShake,
  beverages_juice_mango_passion: IMG.juiceShake,
  beverages_milk: IMG.porridgeMaziwa,
  beverages_yoghurt: IMG.porridgeMaziwa,
  beverages_dawa: IMG.dawa,
  beverages_maziwa_lala: IMG.porridgeMaziwa,
  beverages_milk_shake: IMG.juiceShake,

  // Special Corner
  special_corner_breakfast_tea_sausage_toast_bread: IMG.breakfastCombo,
  special_corner_breakfast_tea_fried_egg_pancake_wedges: IMG.breakfastCombo,
  special_corner_breakfast_tea_samosa_chips_egg: IMG.breakfastCombo,
  special_corner_lunch_beef_kikwetu: IMG.beef,
  special_corner_lunch_chicken_kikwetu: IMG.chicken,
  special_corner_lunch_chicken_curry: IMG.chicken,

  // Snacks
  snacks_ndazi: IMG.chaiMandazi,
  snacks_chapati: IMG.chapati,
  snacks_doughnut: IMG.pastries,
  snacks_samosa: IMG.chaiMandazi,
  snacks_bread_margarine: IMG.breadPotato,
  snacks_smokie: IMG.smokieSausage,
  snacks_burns: IMG.pastries,
  snacks_sweet_potato: IMG.breadPotato,
  snacks_cup_queen_cake: IMG.pastries,
  snacks_creamed_doughnut: IMG.pastries,
  snacks_sausage: IMG.smokieSausage,
  snacks_bread_full_400g: IMG.breadPotato,
  snacks_pan_cake: IMG.pastries,
  snacks_creamed_cupcake: IMG.pastries,
  snacks_kebab: IMG.smokieSausage,
  snacks_spanish_omelette: IMG.omelette,
  snacks_chips: IMG.chips,
  snacks_marble_cake: IMG.pastries,
  snacks_chips_masala: IMG.chipsMasala,
  snacks_creamed_marlecake: IMG.pastries,
  snacks_bhajia: IMG.chipsMasala,
  snacks_potato_wedges: IMG.chips,
};

const CATEGORY_FALLBACK: Record<MenuCategory, string> = {
  Meals: IMG.spread,
  "Comrade's Corner": IMG.chapoMix,
  Beverages: IMG.chaiMandazi,
  'Special Corner': IMG.beef,
  Snacks: IMG.pastries,
};

export function getMenuItemImage(item: Pick<MenuItem, 'id' | 'name' | 'category'>): string {
  const exact = MENU_IMAGE_BY_ID[item.id];
  if (exact) return exact;

  const n = item.name.toLowerCase();
  if (n.includes('soup')) return IMG.soup;
  if (n.includes('pilau')) return IMG.pilau;
  if (n.includes('omena')) return IMG.ugaliOmena;
  if (n.includes('fried egg') && n.includes('ugali')) return IMG.ugaliEgg;
  if (n.includes('ugali')) return IMG.ugali;
  if (n.includes('sukuma') || n.includes('cabbage') || n.includes('kienyeji')) return IMG.sukuma;
  if (n.includes('bean') || n.includes('ndengu') || n.includes('dengu') || n.includes('minji')) {
    return n.includes('mix') || n.includes('chapo') ? IMG.chapoMix : IMG.beans;
  }
  if (n.includes('rice')) return n.includes('mix') ? IMG.chapoMix : IMG.rice;
  if (n.includes('kachumbari')) return IMG.kachumbari;
  if (n.includes('mukimo') || n.includes('mashed')) return IMG.mukimo;
  if (n.includes('githeri')) return IMG.githeri;
  if (n.includes('omelette') || n.includes('egg')) return IMG.omelette;
  if (n.includes('pasta') || n.includes('noodle') || n.includes('spaghetti')) return IMG.pasta;
  if (n.includes('matumbo')) return IMG.matumbo;
  if (n.includes('matoke')) return IMG.matoke;
  if (n.includes('chicken')) return IMG.chicken;
  if (n.includes('fish') || n.includes('tilapia')) return IMG.fish;
  if (n.includes('beef') || n.includes('minced') || n.includes('meat')) return IMG.beef;
  if (n.includes('chapati') || n.includes('chapo')) {
    return n.includes('mix') ? IMG.chapoMix : IMG.chapati;
  }
  if (n.includes('breakfast')) return IMG.breakfastCombo;
  if (n.includes('dawa') || n.includes('lemon') || n.includes('ginger')) return IMG.dawa;
  if (n.includes('porridge') || n.includes('uji') || n.includes('maziwa') || n.includes('yoghurt') || n.includes('milk')) {
    return IMG.porridgeMaziwa;
  }
  if (n.includes('fanta') || n.includes('pepsi') || n.includes('soda') || n.includes('water')) {
    return IMG.coldSodas;
  }
  if (n.includes('juice') || n.includes('shake') || n.includes('pudding')) return IMG.juiceShake;
  if (n.includes('tea') || n.includes('coffee') || n.includes('chocolate') || n.includes('ndazi') || n.includes('mandazi') || n.includes('samosa')) {
    return IMG.chaiMandazi;
  }
  if (n.includes('chips masala') || n.includes('bhajia')) return IMG.chipsMasala;
  if (n.includes('chips') || n.includes('wedges') || n.includes('fries')) return IMG.chips;
  if (n.includes('smokie') || n.includes('sausage') || n.includes('kebab')) return IMG.smokieSausage;
  if (n.includes('bread') || n.includes('sweet potato')) return IMG.breadPotato;
  if (n.includes('cake') || n.includes('doughnut') || n.includes('burn') || n.includes('bun')) {
    return IMG.pastries;
  }

  return CATEGORY_FALLBACK[item.category] || IMG.spread;
}
