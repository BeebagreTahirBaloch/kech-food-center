export interface MenuOption {
  label: string;
  price: number;
}

export interface CatalogItem {
  id: string;
  sectionId: string;
  sectionTitle: string;
  name: string;
  image: string;
  desc: string;
  price?: number;
  options: MenuOption[];
  [key: string]: string | number | MenuOption[] | undefined;
}

export interface MenuSection {
  id: string;
  title: string;
  items: Array<Record<string, string | number>>;
}

export const menuSections: MenuSection[];
export function getSizes(item: Record<string, string | number>): MenuOption[];
export function getCatalog(): CatalogItem[];
