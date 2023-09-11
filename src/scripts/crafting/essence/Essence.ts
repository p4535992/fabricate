import {Identifiable} from "../../common/Identifiable";
import {FabricateItemData, ItemLoadingError, NoFabricateItemData} from "../../foundry/DocumentManager";
import {Serializable} from "../../common/Serializable";
import {EssenceReference} from "./EssenceReference";

interface EssenceJson {
    id: string;
    name: string;
    tooltip: string;
    iconCode: string;
    embedded: boolean;
    disabled: boolean;
    description: string;
    craftingSystemId: string;
    activeEffectSourceItemUuid: string;
}

class Essence implements Identifiable, Serializable<EssenceJson> {

    private readonly _id: string;
    private readonly _craftingSystemId: string;
    private readonly _embedded: boolean;

    private _name: string;
    private _tooltip: string;
    private _iconCode: string;
    private _disabled: boolean;
    private _description: string;
    private _activeEffectSource: FabricateItemData;

    constructor({
        id,
        name,
        tooltip,
        iconCode,
        embedded = false,
        disabled = false,
        description,
        craftingSystemId,
        activeEffectSource = NoFabricateItemData.INSTANCE(),
    }: {
        id: string;
        name: string;
        tooltip: string;
        iconCode: string;
        embedded?: boolean;
        disabled?: boolean;
        description: string;
        craftingSystemId: string;
        activeEffectSource?: FabricateItemData;
    }) {
        this._id = id;
        this._name = name;
        this._tooltip = tooltip;
        this._iconCode = iconCode;
        this._embedded = embedded;
        this._disabled = disabled;
        this._description = description;
        this._craftingSystemId = craftingSystemId;
        this._activeEffectSource = activeEffectSource;
    }

    toJson(): EssenceJson {
        return {
            id: this._id,
            name: this._name,
            tooltip: this._tooltip,
            embedded: this._embedded,
            disabled: this._disabled,
            iconCode: this._iconCode,
            description: this._description,
            craftingSystemId: this._craftingSystemId,
            activeEffectSourceItemUuid: this._activeEffectSource?.uuid
        }
    }

    get loaded(): boolean {
        if (!this.hasActiveEffectSource) {
            return true;
        }
        return this._activeEffectSource.loaded;
    }

    public async load(): Promise<Essence> {
        if (!this.hasActiveEffectSource) {
            return;
        }
        this.activeEffectSource = await this._activeEffectSource.load();
        return this;
    }

    get id(): string {
        return this._id;
    }

    get embedded(): boolean {
        return this._embedded;
    }

    get craftingSystemId(): string {
        return this._craftingSystemId;
    }

    get hasActiveEffectSource(): boolean {
        if (!this._activeEffectSource) {
            return false;
        }
        return this._activeEffectSource.uuid !== NoFabricateItemData.INSTANCE().uuid;
    }

    get activeEffectSource(): FabricateItemData {
        return this._activeEffectSource;
    }


    get name(): string {
        return this._name;
    }

    get description(): string {
        return this._description;
    }

    get tooltip(): string {
        return this._tooltip;
    }

    get iconCode(): string {
        return this._iconCode;
    }

    get hasErrors(): boolean {
        if (!this._activeEffectSource) {
            return false;
        }
        return this._activeEffectSource.hasErrors;
    }

    get errors(): ItemLoadingError[] {
        return this._activeEffectSource.errors;
    }

    get disabled(): boolean {
        return this._disabled;
    }

    set disabled(value: boolean) {
        this._disabled = value;
    }

    set activeEffectSource(value: FabricateItemData) {
        this._activeEffectSource = value;
    }

    set name(value: string) {
        this._name = value;
    }

    set description(value: string) {
        this._description = value;
    }

    set tooltip(value: string) {
        this._tooltip = value;
    }

    set iconCode(value: string) {
        this._iconCode = value;
    }

    toReference(): EssenceReference {
        return new EssenceReference(this._id);
    }

    clone({
      id,
      embedded = false,
      craftingSystemId = this._craftingSystemId,
    }: { id: string, craftingSystemId?: string, embedded?: boolean }): Essence {
        return new Essence({
            id,
            embedded,
            craftingSystemId,
            name: this._name,
            tooltip: this._tooltip,
            iconCode: this._iconCode,
            disabled: this._disabled,
            description: this._description,
        });
    }

}

export { EssenceJson, Essence }