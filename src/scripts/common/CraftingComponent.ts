import {FabricateItem, FabricateItemConfig} from "./FabricateItem";
import {Combination} from "./Combination";
import {Essence} from "./Essence";

interface CraftingComponentMutation {
    item?: {
        imageUrl?: string;
        name?: string;
    }
    essences?: Combination<Essence>;
    salvage?: Combination<CraftingComponent>;
}

class CraftingComponent extends FabricateItem {

    private readonly _essences: Combination<Essence>;
    private readonly _salvage: Combination<CraftingComponent>;

    constructor({
        gameItem,
        essences,
        salvage
    }: {
        gameItem: FabricateItemConfig,
        essences?: Combination<Essence>;
        salvage?: Combination<CraftingComponent>;
    }) {
        super(gameItem);
        this._essences = essences ?? Combination.EMPTY();
        this._salvage = salvage ?? Combination.EMPTY();
    }

    public mutate(mutation: CraftingComponentMutation): CraftingComponent {
        if (!mutation.essences && !mutation.salvage && !mutation.item) {
            console.warn(`A no-op mutation was performed on Component ID: "${this.id}". This should not happen. `);
            return this;
        }
        return new CraftingComponent({
            gameItem: {
                systemId: this.systemId,
                partId: this.partId,
                compendiumId: this.compendiumId,
                name: mutation.item?.name ? mutation.item.name : this.name,
                imageUrl: mutation.item?.imageUrl ? mutation.item.imageUrl : this.imageUrl
            },
            salvage: mutation.salvage ? mutation.salvage : this._salvage,
            essences: mutation.essences ? mutation.essences : this._essences
        });
    }

    get essences(): Combination<Essence> {
        return this._essences;
    }

    get salvage(): Combination<CraftingComponent> {
        return this._salvage;
    }
}

export {CraftingComponent}