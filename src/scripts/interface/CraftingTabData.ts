import {CraftingSystem} from "../core/CraftingSystem";
import {Inventory} from "../game/Inventory";
import {Recipe} from "../core/Recipe";
import {InventoryRecord} from "../game/InventoryRecord";
import Properties from "../Properties";
import {CraftingComponent} from "../core/CraftingComponent";
import {CraftingSystemData, CraftingSystemInfo, InventoryRecordData, RecipeData} from "./InterfaceDataTypes";

interface InventoryContents {
    ownedComponents: InventoryRecordData[];
    preparedComponents: InventoryRecordData[];
}

class CraftingTabData {

    private readonly _craftingSystems: CraftingSystem[];
    private readonly _inventory: Inventory<Item.Data>;
    private readonly _actor: Actor;

    private _craftingSystemData: CraftingSystemData;
    private _recipeData: RecipeData[] = [];
    private _inventoryContents: InventoryContents;

    constructor(craftingSystems: CraftingSystem[], inventory: Inventory<Item.Data>, actor: Actor) {
        this._craftingSystems = craftingSystems;
        this._inventory = inventory;
        this._actor = actor;
    }

    get crafting(): CraftingSystemData {
        return this._craftingSystemData;
    }

    get recipes(): RecipeData[] {
        return this._recipeData;
    }

    get inventory(): InventoryContents {
        return this._inventoryContents;
    }

    get actor(): Actor {
        return this._actor;
    }

    async init(): Promise<void> {
        this._craftingSystemData = await this.prepareCraftingSystemData(this._craftingSystems, this._actor);

        if (this._craftingSystemData.hasEnabledSystems) {
            const selectedCraftingSystem = this._craftingSystems.find((system: CraftingSystem) => system.compendiumPackKey === this._craftingSystemData.selectedSystemId);

            this._recipeData = await this.prepareRecipeDataForSystem(selectedCraftingSystem, this._actor, this._inventory);

            this._inventoryContents = this.prepareInventoryDataForSystem(selectedCraftingSystem,this._actor, this._inventory);
        }
    }

    async prepareCraftingSystemData(craftingSystems: CraftingSystem[], actor: Actor): Promise<CraftingSystemData> {
        let enabledSystems: number = 0;
        const craftingSystemsInfo: CraftingSystemInfo[] = [];
        const storedSystemId = actor.getFlag(Properties.module.name, Properties.flagKeys.actor.selectedCraftingSystem);
        craftingSystems.forEach((system: CraftingSystem) => {
            if (system.enabled) {
                enabledSystems++;
            }
            craftingSystemsInfo.push({
                disabled: !system.enabled,
                compendiumPackKey: system.compendiumPackKey,
                name: system.name,
                selected: system.compendiumPackKey === storedSystemId
            })
        });
        const hasEnabledSystems: boolean = enabledSystems > 0;
        if (storedSystemId) {
            return {
                systems: craftingSystemsInfo,
                hasEnabledSystems: hasEnabledSystems,
                selectedSystemId: storedSystemId
            }
        } else if (hasEnabledSystems) {
            const firstEnabledSystem = craftingSystemsInfo.find((systemInfo: CraftingSystemInfo) => !systemInfo.disabled);
            firstEnabledSystem.selected = true;
            await actor.setFlag(Properties.module.name, Properties.flagKeys.actor.selectedCraftingSystem, firstEnabledSystem.compendiumPackKey);
            return {
                systems: craftingSystemsInfo,
                hasEnabledSystems: hasEnabledSystems,
                selectedSystemId: firstEnabledSystem.compendiumPackKey
            }
        }
    }

    async prepareRecipeDataForSystem(craftingSystem: CraftingSystem, actor: Actor, inventory: Inventory<Item.Data>): Promise<RecipeData[]> {
        const storedKnownRecipes: string[] = actor.getFlag(Properties.module.name, Properties.flagKeys.actor.knownRecipesForSystem(craftingSystem.compendiumPackKey));
        const knownRecipes: string[] = storedKnownRecipes ? storedKnownRecipes : [];
        const recipeData: RecipeData[] = [];
        const selectedRecipeId: string = await this._actor.getFlag(Properties.module.name, Properties.flagKeys.actor.selectedRecipe);
        craftingSystem.recipes.forEach((recipe: Recipe) => {
            const isKnown: boolean = knownRecipes.includes(recipe.partId);
            const isOwned: boolean = inventory.containsPart(recipe.partId);
            const isCraftable: boolean = (isKnown || isOwned) ? inventory.hasAllIngredientsFor(recipe) : false;
            const isSelected: boolean = recipe.partId === selectedRecipeId;
            recipeData.push({
                name: recipe.name,
                partId: recipe.partId,
                known: isKnown,
                owned: isOwned,
                craftable: isCraftable,
                selected: isSelected
            });
        });
        return recipeData;
    }

    prepareInventoryDataForSystem(craftingSystem: CraftingSystem, actor: Actor, inventory: Inventory<Item.Data>): InventoryContents {
        const inventoryContents: InventoryContents = {
            ownedComponents: [],
            preparedComponents: []
        }
        inventory.components.filter((inventoryRecord: InventoryRecord<CraftingComponent>) => (inventoryRecord.fabricateItem.systemId === craftingSystem.compendiumPackKey)
                && (inventoryRecord.fabricateItem.essences && inventoryRecord.fabricateItem.essences.length > 0))
            .forEach((inventoryRecord: InventoryRecord<CraftingComponent>) => {
                inventoryContents.ownedComponents.push({
                    name: inventoryRecord.fabricateItem.name,
                    entryId: inventoryRecord.fabricateItem.partId,
                    quantity: inventoryRecord.totalQuantity,
                    imageUrl: inventoryRecord.fabricateItem.imageUrl
                });
            });
        const savedHopperContents: InventoryRecordData[] = actor.getFlag(Properties.module.name, Properties.flagKeys.actor.hopperForSystem(craftingSystem.compendiumPackKey));
        if (savedHopperContents) {
            inventoryContents.preparedComponents = savedHopperContents;
            savedHopperContents.forEach((hopperItem: InventoryRecordData) => {
                const inventoryItem = inventoryContents.ownedComponents.find((inventoryItem: InventoryRecordData) => inventoryItem.entryId === hopperItem.entryId);
                if (inventoryItem) {
                    inventoryItem.quantity = inventoryItem.quantity - hopperItem.quantity;
                }
            });
            inventoryContents.ownedComponents = inventoryContents.ownedComponents.filter((inventoryItem: InventoryRecordData) => inventoryItem.quantity > 0);
        }
        return inventoryContents;
    }
}

export {CraftingTabData}