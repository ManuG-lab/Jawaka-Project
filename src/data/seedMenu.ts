import { MenuCategory } from '../types';

export interface SeedMenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  sortOrder: number;
}

const RAW_SEED: Array<[MenuCategory, string, number]> = [
  // Meals
  ['Meals', 'Chicken Soup', 20],
  ['Meals', 'Beef Soup', 30],
  ['Meals', 'Sukuma/Cabbage', 30],
  ['Meals', 'Beans/Ndengu', 40],
  ['Meals', 'Ugali', 50],
  ['Meals', 'Rice', 50],
  ['Meals', 'Kachumbari', 50],
  ['Meals', 'Pilau', 80],
  ['Meals', 'Mashed Potato', 80],
  ['Meals', 'Mukimo Plain', 100],
  ['Meals', 'Pilau Special', 250],
  ['Meals', 'Kienyeji Vegetables', 100],
  ['Meals', 'Githeri', 100],
  ['Meals', 'Scrambled Egg', 100],
  ['Meals', 'Minji', 180],
  ['Meals', 'Pasta/Noodles', 100],
  ['Meals', 'Matumbo', 120],
  ['Meals', 'Matoke', 100],
  ['Meals', 'Beef Plain', 150],
  ['Meals', 'Chicken Piece', 140],
  ['Meals', 'Minced Meat', 150],
  ['Meals', 'Fish', 250],

  // Comrade's Corner
  ["Comrade's Corner", 'Sukuma Ugali', 60],
  ["Comrade's Corner", 'Chapo Mix', 60],
  ["Comrade's Corner", 'Rice Mix', 70],
  ["Comrade's Corner", 'Jawaka Mix (Chapo/Dengu/Rice)', 80],
  ["Comrade's Corner", 'Fried Egg Ugali', 100],
  ["Comrade's Corner", 'Omena Ugali', 100],

  // Beverages
  ['Beverages', 'White Tea', 20],
  ['Beverages', 'Black Tea', 20],
  ['Beverages', 'Porridge', 50],
  ['Beverages', 'Mineral Water', 50],
  ['Beverages', 'Lemon/Ginger Tea', 50],
  ['Beverages', 'White/Black Chocolate', 40],
  ['Beverages', 'White/Black Coffee', 40],
  ['Beverages', 'Soda Fanta 300ml', 50],
  ['Beverages', 'Soda Pepsi 350ml', 50],
  ['Beverages', 'Fruit Pudding', 50],
  ['Beverages', 'Juice Mango/Passion', 50],
  ['Beverages', 'Milk', 60],
  ['Beverages', 'Yoghurt', 80],
  ['Beverages', 'Dawa', 120],
  ['Beverages', 'Maziwa Lala', 70],
  ['Beverages', 'Milk Shake', 150],

  // Special Corner
  ['Special Corner', 'Breakfast (Tea/Sausage/Toast Bread)', 150],
  ['Special Corner', 'Breakfast (Tea/Fried Egg/Pancake/Wedges)', 200],
  ['Special Corner', 'Breakfast (Tea/Samosa/Chips/Egg)', 250],
  ['Special Corner', 'Lunch (Beef Kikwetu)', 250],
  ['Special Corner', 'Lunch (Chicken Kikwetu)', 350],
  ['Special Corner', 'Lunch (Chicken Curry)', 350],

  // Snacks
  ['Snacks', 'Ndazi', 15],
  ['Snacks', 'Chapati', 20],
  ['Snacks', 'Doughnut', 30],
  ['Snacks', 'Samosa', 40],
  ['Snacks', 'Bread Margarine', 40],
  ['Snacks', 'Smokie', 40],
  ['Snacks', 'Burns', 40],
  ['Snacks', 'Sweet Potato', 50],
  ['Snacks', 'Cup/Queen Cake', 35],
  ['Snacks', 'Creamed Doughnut', 50],
  ['Snacks', 'Sausage', 50],
  ['Snacks', 'Bread Full 400g', 80],
  ['Snacks', 'Pan Cake', 50],
  ['Snacks', 'Creamed Cupcake', 50],
  ['Snacks', 'Kebab', 70],
  ['Snacks', 'Spanish Omelette', 100],
  ['Snacks', 'Chips', 120],
  ['Snacks', 'Marble Cake', 100],
  ['Snacks', 'Chips Masala', 150],
  ['Snacks', 'Creamed Marlecake', 150],
  ['Snacks', 'Bhajia', 150],
  ['Snacks', 'Potato Wedges', 180],
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export const SEED_MENU_ITEMS: SeedMenuItem[] = RAW_SEED.map(([category, name, price], idx) => ({
  id: `${slugify(category)}_${slugify(name)}`,
  name,
  category,
  price,
  sortOrder: idx + 1,
}));

export const MENU_CATEGORIES: MenuCategory[] = [
  'Meals',
  "Comrade's Corner",
  'Beverages',
  'Special Corner',
  'Snacks',
];
