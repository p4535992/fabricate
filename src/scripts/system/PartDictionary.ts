import {CraftingComponent, CraftingComponentId, CraftingComponentJson} from "../common/CraftingComponent";
import {ComponentGroup, Recipe, RecipeId, RecipeJson} from "../crafting/Recipe";
import {Essence, EssenceId, EssenceJson} from "../common/Essence";
import {DocumentManager} from "../foundry/DocumentManager";
import {Combinable, Combination} from "../common/Combination";
import Properties from "../Properties";

interface ItemData {
    uuid: string;
    name: string;
    imageUrl: string;
}

class PartDictionaryFactory {

    private readonly _partLoader: PartLoader;

    constructor(partLoader: PartLoader) {
        this._partLoader = partLoader;
    }

    public async make(partDictionaryJson: PartDictionaryJson): Promise<PartDictionary> {
        const essences = await this._partLoader.loadEssences(partDictionaryJson.essences);
        const components = await this._partLoader.loadComponents(partDictionaryJson.components);
        const recipes = await this._partLoader.loadRecipes(partDictionaryJson.recipes);
        return new PartDictionary({components, recipes, essences});
    }

}

class PartLoader {

    private readonly _documentManager: DocumentManager;

    constructor(documentManager: DocumentManager) {
        this._documentManager = documentManager;
    }

    public loadEssences(essences: Record<string, EssenceJson>): Map<string, Essence> {
        return new Map(Object.values(essences)
            .map(essenceJson => [essenceJson.id, this.loadEssence(essenceJson)])
        );
    }

    public loadEssence(essenceJson: EssenceJson): Essence {
        return new Essence({
            id: new EssenceId(essenceJson.id),
            name: essenceJson.name,
            description: essenceJson.description,
            iconCode: essenceJson.iconCode,
            tooltip: essenceJson.tooltip
        })
    }

    public async loadComponents(componentsJson: Record<string, CraftingComponentJson>): Promise<Map<string, CraftingComponent>> {
        const loadedComponents = await Promise.all(
            Array.from(Object.values(componentsJson))
                .map(componentJson => this.loadComponent(componentJson))
        );
        return new Map(loadedComponents.map(component => [component.id.value, component]));
    }

    public async loadComponent(componentJson: CraftingComponentJson): Promise<CraftingComponent> {
        const document = await this._documentManager.getDocumentByUuid(componentJson.itemUuid);
        const itemData = this.extractItemData(document);
        return new CraftingComponent({
            id: new CraftingComponentId(componentJson.itemUuid),
            name: itemData.name,
            imageUrl: itemData.imageUrl ?? Properties.ui.defaults.itemImageUrl,
            essences: this.identityCombinationFromRecord(componentJson.essences, EssenceId),
            salvage: this.identityCombinationFromRecord(componentJson.salvage, CraftingComponentId),
        });
    }

    public async loadRecipes(recipesJson: Record<string, RecipeJson>): Promise<Map<string, Recipe>> {
        const loadedRecipes = await Promise.all(
            Array.from(Object.values(recipesJson))
                .map(recipeJson => this.loadRecipe(recipeJson))
        );
        return new Map(loadedRecipes.map(recipe => [recipe.id.value, recipe]));
    }

    public async loadRecipe(recipeJson: RecipeJson): Promise<Recipe> {
        const document = await this._documentManager.getDocumentByUuid(recipeJson.itemUuid);
        const itemData = this.extractItemData(document);
        return new Recipe({
            id: new RecipeId(recipeJson.itemUuid),
            name: itemData.name,
            imageUrl: itemData.imageUrl ?? Properties.ui.defaults.itemImageUrl,
            essences: this.identityCombinationFromRecord(recipeJson.essences, EssenceId),
            catalysts: this.identityCombinationFromRecord(recipeJson.catalysts, CraftingComponentId),
            ingredientGroups: this.componentIdentityGroupsFromRecords(recipeJson.ingredientGroups),
            resultGroups: this.componentIdentityGroupsFromRecords(recipeJson.resultGroups)
        });
    }

    public extractManyItemsData(documents: any[]): Map<string, ItemData> {
        return new Map(documents.map(document => [document.id, this.extractItemData(document)]));
    }

    public extractItemData(document: any): ItemData {
        return <ItemData>{
            uuid: document.uuid,
            name: document.name,
            imageUrl: document.img
        }
    }

    private identityCombinationFromRecord<T extends Combinable>(record: Record<string, number>,
                                                                constructorFunction: new (...args: any[]) => T): Combination<T> {
        return Array.from(Object.keys(record))
            .map(key => Combination.of(new constructorFunction(key), record[key]))
            .reduce((left, right) => left.combineWith(right), Combination.EMPTY())
    }

    private componentIdentityGroupsFromRecords(componentGroupsValues: Record<string, number>[]): ComponentGroup[] {
        if (!componentGroupsValues) {
            return [];
        }
        return componentGroupsValues.map(value => this.identityCombinationFromRecord(value, CraftingComponentId))
            .map(combination => new ComponentGroup(combination));
    }

}

class PartDictionary {

    private readonly _components: Map<string, CraftingComponent>;
    private readonly _recipes: Map<string, Recipe>;
    private readonly _essences: Map<string, Essence>;

    constructor({
        components = new Map(),
        recipes = new Map(),
        essences = new Map()
    }: {
        components?: Map<string, CraftingComponent>,
        recipes?: Map<string, Recipe>,
        essences?: Map<string, Essence>
    }) {
        this._components = components;
        this._recipes = recipes;
        this._essences = essences;
    }

    public hasEssence(id: string): boolean {
        return this._essences.has(id);
    }

    public hasComponent(id: string): boolean {
        return this._components.has(id);
    }

    public hasRecipe(id: string): boolean {
        return this._recipes.has(id);
    }

    public getRecipe(id: string): Recipe {
        if (this._recipes.has(id)) {
            return this._recipes.get(id);
        }
        throw new Error(`No Recipe was found with the identifier ${id}. `);
    }

    public getComponent(id: string): CraftingComponent {
        if (this._components.has(id)) {
            return this._components.get(id);
        }
        throw new Error(`No Component was found with the identifier ${id}. `);
    }

    public getEssence(id: string): Essence {
        if (this._essences.has(id)) {
            return this._essences.get(id);
        }
        throw new Error(`No Essence was found with the identifier ${id}. `);
    }

    public size(): number {
        return this._recipes.size + this._components.size +this._essences.size;
    }

    public getComponents(): CraftingComponent[] {
        return Array.from(this._components.values());
    }

    public getRecipes(): Recipe[] {
        return Array.from(this._recipes.values());
    }

    public getEssences(): Essence[] {
        return Array.from(this._essences.values());
    }

    public toJson(): PartDictionaryJson {
        const componentsJson: Record<string, CraftingComponentJson> = {};
        this._components.forEach((component, id) => componentsJson[id] = component.toJson());

        const recipesJson: Record<string, RecipeJson> = {};
        this._recipes.forEach((recipe, id) => recipesJson[id] = recipe.toJson());

        const essencesJson: Record<string, EssenceJson> = {};
        this._essences.forEach((essence, id) => essencesJson[id] = essence.toJson());

        return {
            components: componentsJson,
            recipes: recipesJson,
            essences: essencesJson
        }
    }

    addComponent(craftingComponent: CraftingComponent) {
        this._components.set(craftingComponent.id.value, craftingComponent);
    }

    addRecipe(recipe: Recipe) {
        this._recipes.set(recipe.id.value, recipe);
    }

    addEssence(essence: Essence) {
        this._essences.set(essence.id.value, essence);
    }

    deleteComponentById(id: string) {
        this._components.delete(id);
    }

    deleteRecipeById(id: string) {
        this._recipes.delete(id);
    }

    deleteEssenceById(id: string) {
        this._essences.delete(id);
    }

    editEssence(modified: Essence): Essence {
        if (this._essences.has(modified.id.value)) {
            const previous = this._essences.get(modified.id.value);
            this._essences.set(modified.id.value, modified);
            return previous;
        }
        return null;
    }
}

interface PartDictionaryJson {
    components: Record<string, CraftingComponentJson>,
    recipes: Record<string, RecipeJson>,
    essences: Record<string, EssenceJson>
}

export { PartDictionary, PartDictionaryJson, PartDictionaryFactory, PartLoader }