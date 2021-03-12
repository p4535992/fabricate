import {expect} from 'chai';
import * as Sinon from "sinon";

import {DefaultFabricator} from "../src/scripts/core/Fabricator";
import {Recipe} from "../src/scripts/core/Recipe";
import {CraftingComponent} from "../src/scripts/core/CraftingComponent";
import {FabricationAction, FabricationActionType} from "../src/scripts/core/FabricationAction";
import {Ingredient} from "../src/scripts/core/Ingredient";
import {FabricationOutcome} from "../src/scripts/core/FabricationOutcome";
import {Inventory, InventoryModification} from "../src/scripts/game/Inventory";
import {Inventory5E} from "../src/scripts/dnd5e/Inventory5E";

const Sandbox: Sinon.SinonSandbox = Sinon.createSandbox();

const mockInventory: Inventory = <Inventory5E><unknown>{
    containsIngredient: Sandbox.stub(),
    addComponent: Sandbox.stub(),
    removeComponent: Sandbox.stub(),
    denormalizedContainedComponents: Sandbox.stub()
}

beforeEach(() => {
    Sandbox.restore();
});

describe('Default Fabricator |', () => {

    describe('Crafting |', () => {

        const compendiumPackKey = 'fabricate.fabricate-test';
        const mud: CraftingComponent = CraftingComponent.builder()
            .withName('Mud')
            .withPartId('tCmAnq9zcESt0ULf')
            .withSystemId(compendiumPackKey)
            .build()
        // @ts-ignore
        mockInventory.removeComponent.withArgs(mud).returns(<InventoryModification<CraftingComponent>>{action: FabricationActionType.REMOVE});

        const sticks: CraftingComponent = CraftingComponent.builder()
            .withName('Sticks')
            .withPartId('arWeEYkLkubimBz3')
            .withSystemId(compendiumPackKey)
            .build();
        // @ts-ignore
        mockInventory.removeComponent.withArgs(sticks).returns(<InventoryModification<CraftingComponent>>{action: FabricationActionType.REMOVE});

        const mudPie = CraftingComponent.builder()
            .withName('Mud Pie')
            .withPartId('nWhTa8gD1QL1f9O3')
            .withSystemId(compendiumPackKey)
            .build();
        // @ts-ignore
        mockInventory.addComponent.withArgs(mudPie).returns(<InventoryModification<CraftingComponent>>{action: ActionType.ADD});

        const mudPieRecipe: Recipe = Recipe.builder()
            .withName('Recipe: Mud Pie')
            .withPartId('4iHqWSLTMFjPbpuI')
            .withIngredient(Ingredient.builder()
                .isConsumed(true)
                .withQuantity(2)
                .withComponent(mud)
                .build())
            .withIngredient(Ingredient.builder()
                .isConsumed(true)
                .withQuantity(1)
                .withComponent(sticks)
                .build())
            .withResult(FabricationAction.builder()
                .withAction(FabricationActionType.ADD)
                .withQuantity(1)
                .withComponent(mudPie)
                .build())
            .build();

        it('Should create a Mud Pie from Recipe and components', async () => {

            const underTest = new DefaultFabricator();
            const fabricationOutcome: FabricationOutcome = await underTest.fabricateFromRecipe(mockInventory, mudPieRecipe);
            expect(fabricationOutcome.actions.length).to.equal(3);
            expect(fabricationOutcome.actions).to.deep.include.members([
                FabricationAction.builder()
                    .withAction(FabricationActionType.ADD)
                    .withQuantity(1)
                    .withComponent(mudPie)
                    .build(),
                FabricationAction.builder()
                    .withAction(FabricationActionType.REMOVE)
                    .withQuantity(2)
                    .withComponent(mud)
                    .build(),
                FabricationAction.builder()
                    .withAction(FabricationActionType.REMOVE)
                    .withQuantity(1)
                    .withComponent(sticks)
                    .build()
            ]);
        });

        it('Should require a Recipe', () => {

            let underTest = new DefaultFabricator();
            expect(() => underTest.fabricateFromComponents()).to.throw('The Default Fabricator requires a Recipe and one was not provided.');

        });
    });
});