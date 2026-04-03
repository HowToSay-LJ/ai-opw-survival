// 简化战斗系统

export class CombatSystem {
  constructor(gameState) {
    this.gs = gameState;
    this.inCombat = false;
    this.target = null;
    this.cooldown = 0;
  }

  // AI 发起攻击
  attack(animal) {
    const ai = this.gs.ai;
    const weapon = ai.equipment.weapon;
    const baseDamage = 5; // 徒手
    const damage = weapon ? weapon.attack : baseDamage;

    animal.hp -= damage;

    // 武器耐久消耗
    if (weapon) {
      weapon.durability--;
      if (weapon.durability <= 0) {
        ai.equipment.weapon = null;
        ai.bubble = '武器坏了！';
      }
    }

    this.cooldown = 1.5; // 攻击冷却

    if (animal.hp <= 0) {
      return 'killed';
    }
    return 'hit';
  }

  // 动物攻击 AI
  animalAttack(animal) {
    const ai = this.gs.ai;
    const damage = animal.attackDamage || 10;
    ai.hp = Math.max(0, ai.hp - damage);
    ai.expression = 'scared';

    if (ai.hp <= 0) return 'dead';
    return 'hurt';
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
  }

  canAttack() {
    return this.cooldown <= 0;
  }
}
