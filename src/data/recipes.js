// 合成配方定义
// facility: null=随时可做, 'campfire'=需在篝火旁

export const RECIPES = [
  {
    id: 'stick',
    name: '木棍',
    materials: [{ name: '木头', count: 1 }],
    result: { type: 'material', name: '木棍', count: 2 },
    facility: null,
  },
  {
    id: 'stone_axe',
    name: '石斧',
    materials: [{ name: '木棍', count: 1 }, { name: '石头', count: 1 }],
    result: { type: 'tool', name: '石斧', count: 1, durability: 15 },
    facility: null,
  },
  {
    id: 'stone_spear',
    name: '石矛',
    materials: [{ name: '木棍', count: 1 }, { name: '石头', count: 2 }],
    result: { type: 'tool', name: '石矛', count: 1, durability: 10, attack: 15 },
    facility: null,
  },
  {
    id: 'campfire',
    name: '篝火',
    materials: [{ name: '石头', count: 1 }, { name: '木头', count: 1 }],
    result: { type: 'building', name: '篝火' },
    facility: null,
  },
  {
    id: 'basic_shelter',
    name: '简易庇护所',
    materials: [{ name: '木头', count: 1 }, { name: '草', count: 1 }],
    result: { type: 'building', name: '简易庇护所', daysLeft: 3 },
    facility: null,
  },
  {
    id: 'cooked_meat',
    name: '烤肉',
    materials: [{ name: '生肉', count: 1 }],
    result: { type: 'food', name: '烤肉', count: 1, hungerRestore: 40, shelfLife: 4 },
    facility: 'campfire',
  },
];

// 资源类型定义
export const RESOURCE_TYPES = {
  berry: { name: '浆果', type: 'food', collectTime: 1.5, hungerRestore: 20, shelfLife: 2 },
  wood: { name: '木头', type: 'material', collectTime: 3, infinite: true },
  stone: { name: '石头', type: 'material', collectTime: 4, infinite: false },
  grass: { name: '草', type: 'material', collectTime: 1, infinite: true },
  herb: { name: '止血草', type: 'medicine', collectTime: 2, shelfLife: 3 },
  clay: { name: '粘土', type: 'material', collectTime: 3, infinite: false },
};
