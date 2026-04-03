// 合成系统
import { RECIPES } from '../data/recipes.js';

export class CraftingSystem {
  constructor(gameState) {
    this.gs = gameState;
  }

  // 检查某个配方是否可以合成
  canCraft(recipeId) {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe) return false;

    const inv = this.gs.ai.inventory;

    // 检查材料
    for (const mat of recipe.materials) {
      const total = inv.filter(i => i.name === mat.name).reduce((sum, i) => sum + i.count, 0);
      if (total < mat.count) return false;
    }

    // 检查设施
    if (recipe.facility === 'campfire') {
      const cp = this.gs.ai.campfirePos;
      if (!cp) return false;
      const dist = Math.hypot(this.gs.ai.x - cp.x, this.gs.ai.y - cp.y);
      if (dist > 60) return false;
    }

    return true;
  }

  // 执行合成
  craft(recipeId) {
    if (!this.canCraft(recipeId)) return false;

    const recipe = RECIPES.find(r => r.id === recipeId);
    const inv = this.gs.ai.inventory;

    // 消耗材料
    for (const mat of recipe.materials) {
      let needed = mat.count;
      for (let i = inv.length - 1; i >= 0 && needed > 0; i--) {
        if (inv[i].name === mat.name) {
          const take = Math.min(inv[i].count, needed);
          inv[i].count -= take;
          needed -= take;
          if (inv[i].count <= 0) inv.splice(i, 1);
        }
      }
    }

    const result = recipe.result;

    // 建筑类：直接放置
    if (result.type === 'building') {
      if (result.name === '篝火') {
        this.gs.ai.campfirePos = { x: this.gs.ai.x + 30, y: this.gs.ai.y + 10 };
        this.gs.ai.campfireFuel = 3; // 初始3天燃料
      } else if (result.name === '简易庇护所') {
        this.gs.ai.shelterPos = { x: this.gs.ai.x, y: this.gs.ai.y };
        this.gs.ai.shelterType = 'basic';
        this.gs.ai.shelterDaysLeft = result.daysLeft;
      }
      return true;
    }

    // 其他物品：入背包
    const item = {
      type: result.type,
      name: result.name,
      count: result.count || 1,
      maxStack: result.type === 'food' ? 5 : result.type === 'material' ? 10 : 1,
    };
    if (result.durability) item.durability = result.durability;
    if (result.attack) item.attack = result.attack;
    if (result.shelfLife) item.expiryDay = this.gs.day + result.shelfLife;
    if (result.hungerRestore) item.hungerRestore = result.hungerRestore;

    // 工具类：武器装备，其他工具入背包（不重复）
    if (result.type === 'tool') {
      if (result.attack) {
        // 武器直接装备
        this.gs.ai.equipment.weapon = item;
        return true;
      }
      // 非武器工具（如石斧）：检查是否已有，已有就不入背包
      const existing = this.gs.ai.inventory.find(i => i.name === item.name);
      if (existing) {
        // 已有，刷新耐久
        existing.durability = item.durability;
        return true;
      }
    }

    return this._addToInventory(item);
  }

  getRecipe(id) {
    return RECIPES.find(r => r.id === id);
  }

  getAvailable() {
    return RECIPES.filter(r => this.canCraft(r.id));
  }

  _addToInventory(item) {
    const inv = this.gs.ai.inventory;
    const existing = inv.find(i => i.name === item.name && i.count < (i.maxStack || 5));
    if (existing) {
      existing.count += item.count;
      return true;
    }
    if (inv.length < this.gs.ai.inventorySize) {
      inv.push(item);
      return true;
    }
    return false;
  }
}
