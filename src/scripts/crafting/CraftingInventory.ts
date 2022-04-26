import FabricateApplication from '../application/FabricateApplication';
import type { FabricationAction } from '../core/FabricationAction';
import CONSTANTS from '../constants';
import type { ItemData } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs';
import type { Inventory } from '../actor/Inventory';
import type { InventoryRecord } from '../actor/InventoryRecord';
import { FabricateItem, FabricateItemType } from '../common/FabricateItem';
import type { CraftingComponent } from '../common/CraftingComponent';
import type { Recipe } from './Recipe';
import type { GameSystem } from '../system/GameSystem';
import type { Combination } from '../common/Combination';
import type { EssenceDefinition } from '../common/EssenceDefinition';
import type { CraftingSystem } from '../system/CraftingSystem';

abstract class CraftingInventory<T extends ItemData> implements Inventory<ItemData, Actor> {
  protected readonly _actor: any;
  protected _supportedGameSystems: GameSystem[];

  protected constructor(actor: Actor) {
    this._actor = actor;
    this._supportedGameSystems = [];
  }
  ownedComponents: Combination<CraftingComponent>;
  containsIngredients(ingredients: Combination<CraftingComponent>): boolean {
    throw new Error('Method not implemented.');
  }
  containsEssences(essences: Combination<EssenceDefinition>): boolean {
    throw new Error('Method not implemented.');
  }
  selectFor(essences: Combination<EssenceDefinition>): Combination<CraftingComponent> {
    throw new Error('Method not implemented.');
  }
  excluding(ingredients: Combination<CraftingComponent>): Inventory<ItemData, Actor> {
    throw new Error('Method not implemented.');
  }
  perform(actions: FabricationAction<ItemData>[]): Promise<Item[]> {
    throw new Error('Method not implemented.');
  }
  prepare(): boolean {
    throw new Error('Method not implemented.');
  }

  get actor(): Actor {
    return this._actor;
  }

  get actorId(): string {
    return this._actor.id;
  }

  get supportedGameSystems(): GameSystem[] {
    return this._supportedGameSystems;
  }

  abstract get contents(): InventoryRecord<FabricateItem>[];

  abstract get components(): InventoryRecord<CraftingComponent>[];

  abstract get recipes(): InventoryRecord<Recipe>[];

  get size(): number {
    return this.contents.length;
  }

  get componentCount(): number {
    return this.components
      .map((componentRecord: InventoryRecord<CraftingComponent>) => componentRecord.totalQuantity)
      .reduce((left, right) => left + right, 0);
  }

  public supportsGameSystem(gameSystem: GameSystem): boolean {
    return this._supportedGameSystems.some((supported: GameSystem) => supported === gameSystem);
  }

  containsIngredient(ingredient: Ingredient): boolean {
    const quantity = this.components
      .filter((candidate: InventoryRecord<CraftingComponent>) => candidate.fabricateItem.sharesType(ingredient))
      .map((candidate: InventoryRecord<FabricateItem>) => candidate.totalQuantity)
      .reduce((left, right) => left + right, 0);
    return ingredient.quantity <= quantity;
  }

  containsPart(partId: string, quantity: number = 1): boolean {
    const match = this.contents.find(
      (itemRecord: InventoryRecord<FabricateItem>) => itemRecord.fabricateItem.partId === partId,
    );
    return match ? match.totalQuantity >= quantity : false;
  }

  containsAll(components: CraftingComponent[]): boolean {
    const componentCountById: Map<string, number> = new Map<string, number>();
    components.forEach((component: CraftingComponent) => {
      if (componentCountById.has(component.partId)) {
        const currentCount = <number>componentCountById.get(component.partId);
        componentCountById.set(component.partId, currentCount + 1);
      } else {
        componentCountById.set(component.partId, 1);
      }
    });
    componentCountById.forEach((amountRequired: number, partId: string) => {
      const inventoryRecordForType = this.components.find(
        (record: InventoryRecord<CraftingComponent>) => record.fabricateItem.partId === partId,
      );
      if (!inventoryRecordForType || inventoryRecordForType.totalQuantity < amountRequired) {
        return false;
      }
    });
    return true;
  }

  hasAllIngredientsFor(recipe: Recipe): boolean {
    return this.hasAllNamedIngredients(recipe) && this.hasAllEssences(recipe);
  }

  private hasAllEssences(recipe: Recipe): boolean {
    const outstandingEssencesByType: Map<string, number> = new Map<string, number>();
    if (!recipe.essences || recipe.essences.length === 0) {
      return true;
    }
    recipe.essences.forEach((essence: EssenceDefinition) => {
      if (outstandingEssencesByType.has(essence.id)) {
        outstandingEssencesByType.set(essence.id, <number>outstandingEssencesByType.get(essence.id) + 1);
      } else {
        outstandingEssencesByType.set(essence.id, 1);
      }
    });
    for (let i = 0; i < this.components.length; i++) {
      const thisRecord: InventoryRecord<CraftingComponent> = <InventoryRecord<CraftingComponent>>this.components[i];
      if (thisRecord.fabricateItem.essences) {
        thisRecord.fabricateItem.essences.forEach((essence: EssenceDefinition) => {
          if (outstandingEssencesByType.has(essence.id)) {
            const remaining: number = <number>outstandingEssencesByType.get(essence.id);
            const contribution = thisRecord.totalQuantity;
            if (remaining <= contribution) {
              outstandingEssencesByType.delete(essence.id);
            } else {
              outstandingEssencesByType.set(essence.id, remaining - contribution);
            }
          }
        });
        if (outstandingEssencesByType.size === 0) {
          return true;
        }
      }
    }
    return false;
  }

  private hasAllNamedIngredients(recipe: Recipe): boolean {
    const ingredientsByType = new Map<string, number>();
    let failedToFind: boolean = false;
    let duplicatedIngredient: boolean = false;
    recipe.ingredients.forEach((ingredient: Ingredient) => {
      const present: boolean = this.containsIngredient(ingredient);
      if (!present) {
        failedToFind = true;
        return;
      }
      const occurrences = <number>ingredientsByType.get(ingredient.component.partId) + 1;
      ingredientsByType.set(ingredient.component.partId, occurrences);
      if (occurrences > 1) {
        duplicatedIngredient = true;
      }
    });
    if (duplicatedIngredient) {
      throw new Error(`One or more ingredients were duplicated in a call to CraftingInventory.containsMany(ingredients: Ingredient[]). 
            Recipe[name='${recipe.name}',id='${recipe.partId}'] seems to be mis-configured! Recipes should be specified as 
            Ingredient[Mud, 2], not [Ingredient[Mud, 1], Ingredient[Mud 1]]. `);
    }
    return !failedToFind;
  }

  protected getOwningCraftingSystemForItem(item: Item): CraftingSystem {
    const systemId = <string>item.getFlag(CONSTANTS.module.name, CONSTANTS.flagKeys.item.systemId);
    const craftingSystem = FabricateApplication.systems.getSystemByCompendiumPackKey(systemId);
    if (!craftingSystem) {
      throw new Error(`Unable to look up crafting System '${systemId}' when indexing Item '${item.id}'. `);
    }
    return craftingSystem;
  }

  protected lookUp(item: Item): FabricateItem {
    const craftingSystem: CraftingSystem = this.getOwningCraftingSystemForItem(item);
    const itemType: FabricateItemType = <FabricateItemType>item.getFlag(
      CONSTANTS.module.name,
      CONSTANTS.flagKeys.item.fabricateItemType,
    );
    const partId: string = <string>item.getFlag(CONSTANTS.module.name, CONSTANTS.flagKeys.item.partId);
    switch (itemType) {
      case FabricateItemType.RECIPE:
        const recipe: Recipe = craftingSystem.getRecipeByPartId(partId);
        if (recipe) {
          return recipe;
        }
        throw new Error(`Unable to look up Recipe with Part ID '${partId}' from Crafting System 
                    '${craftingSystem.compendiumPackKey}. '`);
      case FabricateItemType.COMPONENT:
        const craftingComponent: CraftingComponent = craftingSystem.getComponentByPartId(partId);
        if (craftingComponent) {
          return craftingComponent;
        }
        throw new Error(`Unable to look up Crafting Component with Part ID '${partId}' from Crafting System 
                    '${craftingSystem.compendiumPackKey}. '`);
      default:
        throw new Error(`Unrecognized Fabricate Item Type of '${itemType}' for Item '${item.id}'. 
                    The allowable values are 'COMPONENT' and 'RECIPE'. `);
    }
  }

  public abstract remove(item: FabricateItem, quantity?: number): Promise<FabricationAction<T>>;

  public abstract add(item: FabricateItem, quantity?: number, customData?: any): Promise<FabricationAction<T>>;

  public abstract update(): void;

  public abstract updateQuantityFor(item: any): Promise<boolean>;
}

export { CraftingInventory };
