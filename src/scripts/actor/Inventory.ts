import { CraftingComponent } from '../common/CraftingComponent';
import { EssenceDefinition } from '../common/EssenceDefinition';
import { Combination, Unit } from '../common/Combination';
import { FabricateItemType } from '../compendium/CompendiumData';
import { PartDictionary } from '../system/PartDictionary';
import { ObjectUtility } from '../foundry/ObjectUtility';
import { ItemData } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/module.mjs';
import Document from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/abstract/document.mjs';
import { ActionType, FabricationAction } from '../core/FabricationAction';

interface Inventory<D extends ItemData, A extends Actor> {
  actor: A;
  ownedComponents: Combination<CraftingComponent>;
  containsIngredients(ingredients: Combination<CraftingComponent>): boolean;
  containsEssences(essences: Combination<EssenceDefinition>): boolean;
  selectFor(essences: Combination<EssenceDefinition>): Combination<CraftingComponent>;
  excluding(ingredients: Combination<CraftingComponent>): Inventory<D, A>;
  perform(actions: FabricationAction<D>[]): Promise<Item[]>;
  prepare(): boolean;
}

interface InventorySearch {
  perform(contents: Combination<CraftingComponent>): boolean;
}

class IngredientSearch implements InventorySearch {
  private readonly _ingredients: Combination<CraftingComponent>;

  constructor(ingredients: Combination<CraftingComponent>) {
    this._ingredients = ingredients;
  }

  public perform(contents: Combination<CraftingComponent>): boolean {
    return this._ingredients.isIn(contents);
  }
}

class EssenceSearch implements InventorySearch {
  private readonly _essences: Combination<EssenceDefinition>;

  constructor(essences: Combination<EssenceDefinition>) {
    this._essences = essences;
  }

  public perform(contents: Combination<CraftingComponent>): boolean {
    let remaining: Combination<EssenceDefinition> = this._essences.clone();
    for (const component of contents.members) {
      if (!component.essences.isEmpty()) {
        const essenceAmount: Combination<EssenceDefinition> = component.essences.multiply(
          contents.amountFor(component),
        );
        remaining = remaining.subtract(essenceAmount);
      }
      if (remaining.isEmpty()) {
        return true;
      }
    }
    return false;
  }
}

class ComponentCombinationNode {
  private readonly _requiredEssences: Combination<EssenceDefinition>;
  private readonly _componentCombination: Combination<CraftingComponent>;
  private readonly _essenceCombination: Combination<EssenceDefinition>;
  private readonly _remainingPicks: Combination<CraftingComponent>;

  private _children: ComponentCombinationNode[];

  constructor(
    requiredEssences: Combination<EssenceDefinition>,
    nodeCombination: Combination<CraftingComponent>,
    remainingPicks: Combination<CraftingComponent>,
  ) {
    this._requiredEssences = requiredEssences;
    this._componentCombination = nodeCombination;
    this._remainingPicks = remainingPicks;
    this._essenceCombination = nodeCombination.explode((component: CraftingComponent) => component.essences);
  }

  public populate(): void {
    if (this._requiredEssences.isIn(this._essenceCombination)) {
      return;
    }
    this._children = this._remainingPicks.members.map((component: CraftingComponent) => {
      const deltaUnit = new Unit(component, 1);
      const childComponentCombination: Combination<CraftingComponent> = this._componentCombination.add(deltaUnit);
      const remainingPicksForChild: Combination<CraftingComponent> = this._remainingPicks.subtract(
        Combination.ofUnit(deltaUnit),
      );
      return new ComponentCombinationNode(this._requiredEssences, childComponentCombination, remainingPicksForChild);
    });
    this._children.forEach((child: ComponentCombinationNode) => child.populate());
  }

  get componentCombination(): Combination<CraftingComponent> {
    return this._componentCombination;
  }

  get essenceCombination(): Combination<EssenceDefinition> {
    return this._essenceCombination;
  }

  public hasChildren(): boolean {
    return this.children && this.children.length > 0;
  }

  get children(): ComponentCombinationNode[] {
    return this._children;
  }
}

class ComponentCombinationGenerator {
  private readonly _roots: ComponentCombinationNode[];
  private readonly _requiredEssences: Combination<EssenceDefinition>;

  constructor(availableComponents: Combination<CraftingComponent>, requiredEssences: Combination<EssenceDefinition>) {
    this._requiredEssences = requiredEssences;
    this._roots = availableComponents.members
      .map((component: CraftingComponent) => Combination.ofUnit(new Unit<CraftingComponent>(component, 1)))
      .map(
        (combination: Combination<CraftingComponent>) =>
          new ComponentCombinationNode(requiredEssences, combination, availableComponents.subtract(combination)),
      );
  }

  private allCombinations(baseNodes: ComponentCombinationNode[]): ComponentCombinationNode[] {
    const generatedCombinations: ComponentCombinationNode[] = [];
    let treeLevel: ComponentCombinationNode[] = baseNodes;
    while (treeLevel.length > 0) {
      treeLevel.forEach((node: ComponentCombinationNode) => {
        generatedCombinations.push(node);
      });
      treeLevel = treeLevel
        .filter((node: ComponentCombinationNode) => node.hasChildren())
        .map((node: ComponentCombinationNode) => node.children)
        .reduce((left: ComponentCombinationNode[], right: ComponentCombinationNode[]) => left.concat(right), []);
    }
    return generatedCombinations;
  }

  private excludeInsufficient(
    allCombinations: ComponentCombinationNode[],
    requiredEssences: Combination<EssenceDefinition>,
  ): ComponentCombinationNode[] {
    return allCombinations.filter(
      (node: ComponentCombinationNode) =>
        node.essenceCombination.size() >= requiredEssences.size() && requiredEssences.isIn(node.essenceCombination),
    );
  }

  private excludeDuplicates(
    sufficientCombinations: ComponentCombinationNode[],
  ): [Combination<CraftingComponent>, Combination<EssenceDefinition>][] {
    const suitableCombinationsBySize: Map<number, [Combination<CraftingComponent>, Combination<EssenceDefinition>][]> =
      new Map();
    sufficientCombinations.forEach((node: ComponentCombinationNode) => {
      if (!suitableCombinationsBySize.has(node.componentCombination.size())) {
        suitableCombinationsBySize.set(node.componentCombination.size(), [
          [node.componentCombination, node.essenceCombination],
        ]);
      } else {
        let isDuplicate: boolean = false;
        const existing: [Combination<CraftingComponent>, Combination<EssenceDefinition>][] = <
          [Combination<CraftingComponent>, Combination<EssenceDefinition>][]
        >suitableCombinationsBySize.get(node.componentCombination.size());
        for (const existingCombination of existing) {
          if (existingCombination[0].equals(node.componentCombination)) {
            isDuplicate = true;
            break;
          }
        }
        if (!isDuplicate) {
          existing.push([node.componentCombination, node.essenceCombination]);
        }
      }
    });
    return Array.from(
      suitableCombinationsBySize.values(),
      (combinations: [Combination<CraftingComponent>, Combination<EssenceDefinition>][]) => combinations,
    ).reduce(
      (
        left: [Combination<CraftingComponent>, Combination<EssenceDefinition>][],
        right: [Combination<CraftingComponent>, Combination<EssenceDefinition>][],
      ) => left.concat(right),
      [],
    );
  }

  public generate(): [Combination<CraftingComponent>, Combination<EssenceDefinition>][] {
    this._roots.forEach((node: ComponentCombinationNode) => node.populate());
    const generatedCombinations: ComponentCombinationNode[] = this.allCombinations(this._roots);
    const suitableCombinations: ComponentCombinationNode[] = this.excludeInsufficient(
      generatedCombinations,
      this._requiredEssences,
    );
    return this.excludeDuplicates(suitableCombinations);
  }
}

class EssenceSelection {
  private readonly _essences: Combination<EssenceDefinition>;

  constructor(essences: Combination<EssenceDefinition>) {
    this._essences = essences;
  }

  perform(contents: Combination<CraftingComponent>): Combination<CraftingComponent> {
    if (this._essences.isEmpty()) {
      return Combination.EMPTY();
    }
    let availableComponents: Combination<CraftingComponent> = contents.clone();
    contents.members.forEach((thisComponent: CraftingComponent) => {
      if (thisComponent.essences.isEmpty() || !thisComponent.essences.intersects(this._essences)) {
        availableComponents = availableComponents.subtract(availableComponents.just(thisComponent));
      }
    });
    return this.selectBestMatch(this.matchingCombinationsFor(availableComponents, this._essences));
  }

  private selectBestMatch(
    combinations: [Combination<CraftingComponent>, Combination<EssenceDefinition>][],
  ): Combination<CraftingComponent> {
    if (combinations.length === 0) {
      return Combination.EMPTY();
    }
    const sortedCombinations: [Combination<CraftingComponent>, Combination<EssenceDefinition>][] = combinations.sort(
      (
        left: [Combination<CraftingComponent>, Combination<EssenceDefinition>],
        right: [Combination<CraftingComponent>, Combination<EssenceDefinition>],
      ) => {
        return left[1].size() - right[1].size();
      },
    );
    return sortedCombinations[0][0];
  }

  private matchingCombinationsFor(
    availableComponents: Combination<CraftingComponent>,
    requiredEssences: Combination<EssenceDefinition>,
  ): [Combination<CraftingComponent>, Combination<EssenceDefinition>][] {
    const combinationGenerator: ComponentCombinationGenerator = new ComponentCombinationGenerator(
      availableComponents,
      requiredEssences,
    );
    return combinationGenerator.generate();
  }
}

abstract class BaseCraftingInventory<D extends ItemData, A extends Actor> implements Inventory<D, A> {
  private readonly _game: Game;
  private readonly _gameUtils: ObjectUtility;

  private readonly _actor: A;
  private _ownedComponents: Combination<CraftingComponent>;
  private readonly _partDictionary: PartDictionary;
  private _managedItems: Map<CraftingComponent, [ItemData, number][]>;

  private _prepared: boolean = false;

  protected constructor(builder: BaseCraftingInventory.Builder<D, A>) {
    this._actor = builder.actor;
    this._ownedComponents = builder.ownedComponents;
    this._partDictionary = builder.partDictionary;
    this._managedItems = builder.managedItems;
    this._game = builder.game;
    this._gameUtils = builder.gameUtils;
  }

  get actor(): A {
    return this._actor;
  }

  get ownedComponents(): Combination<CraftingComponent> {
    return this._ownedComponents.clone();
  }

  protected get partDictionary(): PartDictionary {
    return this._partDictionary;
  }

  containsIngredients(ingredients: Combination<CraftingComponent>): boolean {
    return new IngredientSearch(ingredients).perform(this.ownedComponents);
  }

  containsEssences(essences: Combination<EssenceDefinition>): boolean {
    return new EssenceSearch(essences).perform(this.ownedComponents);
  }

  excluding(ingredients: Combination<CraftingComponent>): Inventory<D, A> {
    return this.createFrom(this._actor, this._ownedComponents.subtract(ingredients));
  }

  selectFor(essences: Combination<EssenceDefinition>): Combination<CraftingComponent> {
    return new EssenceSelection(essences).perform(this.ownedComponents);
  }

  public prepare(): boolean {
    if (this._prepared) {
      return true;
    }
    this._ownedComponents = this.index();
    if (this.ownedComponents) {
      return true;
    } else {
      return false;
    }
  }

  async perform(actions: FabricationAction<D>[]): Promise<Item[]> {
    this._ownedComponents = this.index();
    const removals: FabricationAction<D>[] = [];
    const additions: FabricationAction<D>[] = [];
    for (const action of actions) {
      const preparedAction: FabricationAction<D> = await this.prepareItemData(action);
      switch (preparedAction.actionType) {
        case ActionType.REMOVE:
          removals.push(preparedAction);
          break;
        case ActionType.ADD:
          additions.push(preparedAction);
          break;
      }
    }
    const results: Item[] = await this.takeActions(this.actor, removals, additions);
    this._ownedComponents = this.index();
    return results;
  }

  private async prepareItemData(action: FabricationAction<D>): Promise<FabricationAction<D>> {
    if (action.hasItemData()) {
      return action;
    }
    const component: CraftingComponent = action.unit.part;
    // @ts-ignore
    const compendium: Compendium = this._game.packs.get(component.systemId);
    const entity: Document<ItemData> = <Document<ItemData>>await compendium.getEntity(component.partId);
    // @ts-ignore todo: figure out what I've done wrong here
    return action.withItemData(entity.data);
  }

  abstract createFrom(actor: A, ownedComponents: Combination<CraftingComponent>): Inventory<D, A>;

  abstract getOwnedItems(actor: A): Item[];

  abstract getQuantityFor(item: Item): number;

  abstract setQuantityFor(itemData: ItemData, quantity: number): ItemData;

  protected get itemQuantityAware(): boolean {
    return true;
  }

  async deleteOwnedItems(actor: A, itemsData: ItemData[]): Promise<Item[]> {
    const ids: string[] = <string[]>itemsData.map((itemData: ItemData) => itemData._id);
    // @ts-ignore todo: This works in foundry but doesn't seem to be supported by VTT Types - check with League
    return actor.deleteEmbeddedEntity('OwnedItem', ids);
  }

  async createOwnedItems(actor: A, itemsData: ItemData[]): Promise<Item[]> {
    // @ts-ignore todo: This works in foundry but doesn't seem to be supported by VTT Types - check with League
    return actor.createEmbeddedEntity('OwnedItem', itemsData);
  }

  async updateOwnedItems(actor: A, itemsData: ItemData[]): Promise<Item[]> {
    // @ts-ignore todo: This works in foundry but doesn't seem to be supported by VTT Types - check with League
    return actor.updateEmbeddedEntity('OwnedItem', itemsData);
  }

  async takeActions(actor: A, removals: FabricationAction<D>[], additions: FabricationAction<D>[]): Promise<Item[]> {
    const updates: ItemData[] = [];
    const deletes: ItemData[] = [];
    const creates: ItemData[] = [];

    /* =============================================================================================================
     * Determine which Items to Update and Which Items to Create to take all Addition Actions
     * ========================================================================================================== */

    for (const addition of additions) {
      const craftingComponent: CraftingComponent = addition.unit.part;
      if (!this.itemQuantityAware || addition.customData) {
        creates.push(addition.itemData);
        break;
      }
      if (!this.ownedComponents.contains(craftingComponent)) {
        const data: ItemData = this._gameUtils.duplicate(addition.itemData);
        const newItemData: ItemData = this.setQuantityFor(data, addition.unit.quantity);
        creates.push(newItemData);
        break;
      }
      const records: [ItemData, number][] = <[ItemData, number][]>(
        this._managedItems
          ?.get(craftingComponent)
          ?.sort((left: [ItemData, number], right: [ItemData, number]) => right[1] - left[1])
      );
      const itemToUpdate: [ItemData, number] = records[0];
      const newItemData: ItemData = this.setQuantityFor(
        this._gameUtils.duplicate(<any>itemToUpdate[0].data),
        addition.unit.quantity + itemToUpdate[1],
      );
      updates.push(newItemData);
    }

    /* ==========================================================================================================
     * Determine which Items to Delete and Which Items to Update to take all Removal Actions
     * ========================================================================================================== */

    for (const removal of removals) {
      const craftingComponent: CraftingComponent = removal.unit.part;
      if (
        !this.ownedComponents.contains(craftingComponent) ||
        removal.unit.quantity > this.ownedComponents.amountFor(craftingComponent)
      ) {
        throw new Error(
          `Could not remove ${removal.unit.quantity} ${
            craftingComponent.name
          } from Actor's Inventory - ${this.ownedComponents.amountFor(craftingComponent)} were present. `,
        );
      }
      const records: [ItemData, number][] = <[ItemData, number][]>(
        this._managedItems
          .get(craftingComponent)
          ?.sort((left: [ItemData, number], right: [ItemData, number]) => left[1] - right[1])
      );
      let outstandingRemovalAmount: number = removal.unit.quantity;
      let currentRecordIndex: number = 0;
      while (outstandingRemovalAmount > 0) {
        const currentRecord: [ItemData, number] = records[currentRecordIndex];
        const quantity: number = currentRecord[1];
        const itemData = currentRecord[0].data;
        if (quantity <= outstandingRemovalAmount) {
          deletes.push(<any>itemData);
          outstandingRemovalAmount -= quantity;
        } else {
          const newItemData: ItemData = this.setQuantityFor(
            this._gameUtils.duplicate(<any>itemData),
            quantity - outstandingRemovalAmount,
          );
          updates.push(newItemData);
          outstandingRemovalAmount = 0;
        }
        currentRecordIndex++;
      }
    }

    /* ==========================================================================================================
     * Perform all Updates, Deletes and Creates for the Actor's Owned Items
     * ========================================================================================================== */

    const results: Item[] = [];
    if (updates.length > 0) {
      const updatedItems: Item[] = await this.updateOwnedItems(actor, updates);
      results.push(...updatedItems);
    }
    if (deletes.length > 0) {
      const deletedItems: Item[] = await this.deleteOwnedItems(actor, deletes);
      results.push(...deletedItems);
    }
    if (creates.length > 0) {
      const createdItems: Item[] = await this.createOwnedItems(actor, creates);
      results.push(...createdItems);
    }

    return results;
  }

  index(): Combination<CraftingComponent> {
    const actor: A = this.actor;
    const ownedItems: Item[] = this.getOwnedItems(actor);
    const itemsByComponentType: Map<CraftingComponent, [ItemData, number][]> = new Map();
    const ownedComponents: Combination<CraftingComponent> = ownedItems
      .filter((item: Item) => PartDictionary.typeOf(item) === FabricateItemType.COMPONENT)
      .map((item: Item) => {
        const component: CraftingComponent = this.partDictionary.componentFrom(item);
        const quantity: number = this.getQuantityFor(item);
        if (itemsByComponentType.has(component)) {
          itemsByComponentType.get(component)?.push([item.data, quantity]);
        } else {
          itemsByComponentType.set(component, [[item.data, quantity]]);
        }
        return Combination.of(component, quantity);
      })
      .reduce(
        (left: Combination<CraftingComponent>, right: Combination<CraftingComponent>) => left.combineWith(right),
        Combination.EMPTY(),
      );
    this._managedItems = itemsByComponentType;
    return ownedComponents;
  }
}

abstract class NonUpdatingCraftingInventory<D extends ItemData, A extends Actor> extends BaseCraftingInventory<D, A> {
  getQuantityFor(): number {
    return 1;
  }

  setQuantityFor(itemData: ItemData): ItemData {
    return itemData;
  }

  protected get itemQuantityAware(): boolean {
    return false;
  }
}

namespace BaseCraftingInventory {
  export abstract class Builder<D extends ItemData, A extends Actor> {
    public actor: A;
    public ownedComponents: Combination<CraftingComponent> = Combination.EMPTY();
    public partDictionary: PartDictionary;
    public managedItems: Map<CraftingComponent, [ItemData, number][]>;
    public game: Game;
    public gameUtils: ObjectUtility;

    abstract build(): Inventory<D, A>;

    public withActor(value: A): Builder<D, A> {
      this.actor = value;
      return this;
    }

    public withOwnedComponents(value: Combination<CraftingComponent>): Builder<D, A> {
      this.ownedComponents = value;
      return this;
    }

    public withPartDictionary(value: PartDictionary): Builder<D, A> {
      this.partDictionary = value;
      return this;
    }

    public withManagedItems(value: Map<CraftingComponent, [ItemData, number][]>): Builder<D, A> {
      this.managedItems = value;
      return this;
    }

    public withGame(value: Game): Builder<D, A> {
      this.game = value;
      return this;
    }

    public withGameUtils(value: ObjectUtility): Builder<D, A> {
      this.gameUtils = value;
      return this;
    }
  }
}

export { Inventory, BaseCraftingInventory, NonUpdatingCraftingInventory };
