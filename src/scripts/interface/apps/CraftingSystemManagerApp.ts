import Properties from "../../Properties";
import {GameProvider} from "../../foundry/GameProvider";
import {EditCraftingSystemDetailDialog} from "./EditCraftingSystemDetailDialog";
import {EditComponentDialog} from "./EditComponentDialog";
import {EditEssenceDialog} from "./EditEssenceDialog";
import {CraftingSystem} from "../../system/CraftingSystem";
import {CraftingComponent} from "../../common/CraftingComponent";
import {Combination} from "../../common/Combination";
import {SystemRegistry} from "../../registries/SystemRegistry";
import {DefaultDocumentManager} from "../../foundry/DocumentManager";
import FabricateApplication from "../FabricateApplication";

class CraftingSystemManagerApp extends FormApplication {

    private readonly systemRegistry: SystemRegistry;

    private _selectedSystem: CraftingSystem;
    private _activeTab: string;
    private _defaultTab: string = "components";

    constructor() {
        super(null);
        this.systemRegistry = FabricateApplication.systemRegistry;
    }

    static get defaultOptions() {
        const GAME = new GameProvider().globalGameObject();
        return {
            ...super.defaultOptions,
            title: GAME.i18n.localize(`${Properties.module.id}.CraftingSystemManagerApp.title`),
            key: `${Properties.module.id}-crafting-system-manager-app`,
            classes: ["sheet", "journal-sheet", "journal-entry"],
            template: Properties.module.templates.craftingSystemManagementApp,
            resizable: true,
            width: 920,
            height: 740,
            dragDrop: [{ dragSelector: <string> null, dropSelector: <string> null }],
        };
    }

    protected async _updateObject(_event: Event, _formData: object | undefined): Promise<unknown> {
        console.log("update object");
        await this.render();
        return undefined;
    }

    async render(force: boolean = true) {
        if (this._selectedSystem?.id) {
            this._selectedSystem = await this.systemRegistry.getCraftingSystemById(this._selectedSystem.id.value);
        }
        super.render(force);
    }

    async getData(): Promise<any> {
        const craftingSystems = await this.systemRegistry.getAllCraftingSystems();
        if (!this._selectedSystem && craftingSystems.size > 0) {
            [this._selectedSystem] = craftingSystems.values();
        }
        return { craftingSystems: craftingSystems, selectedSystem: this._selectedSystem };
    }

    activateListeners(html: JQuery) {
        super.activateListeners(html);
        this._contextMenu(html);
        const rootElement = html[0];
        rootElement.addEventListener("click", this._onClick.bind(this));
        const tabs = new Tabs({
            navSelector: ".fabricate-crafting-system-navigation",
            contentSelector: ".fabricate-crafting-system-body",
            initial: this._activeTab ?? this._defaultTab,
            callback: () => {
                this._activeTab = tabs.active;
            }
        });
        tabs.bind(rootElement);
    }

    _onDrop(event: any) {
        if (!event.target.classList.contains("fabricate-drop-zone")) {
            return;
        }
        const dropTrigger = event?.target?.dataset?.dropTrigger;
        if (!dropTrigger) {
            return;
        }
        const systemId = event?.target?.dataset?.systemId as string;
        return this.handleUserAction(systemId, dropTrigger, event);
    }

    async _onClick(event: any) {
        const action = event?.target?.dataset?.action || event?.target?.parentElement?.dataset?.action as string;
        if(!action) {
            return;
        }
        const systemId = event?.target?.dataset?.systemId || event?.target?.parentElement?.dataset?.systemId as string;
        return this.handleUserAction(systemId, action, event);
    }

    private async handleUserAction(systemId: string, action: string, event: any) {
        switch (action) {
            case "editDetails":
                new EditCraftingSystemDetailDialog(this._selectedSystem).render();
                break;
            case "importCraftingSystem":
                console.log(event);
                break;
            case "createCraftingSystem":
                new EditCraftingSystemDetailDialog().render();
                break;
            case "toggleSystemEnabled":
                const checked = event.target.checked;
                if (this._selectedSystem.enabled === checked) {
                    return;
                }
                await this.systemRegistry.saveCraftingSystem(
                    this._selectedSystem.setEnabled(checked)
                );
                await this.render();
                break;
            case "selectCraftingSystem":
                const systemToSelect = await this.systemRegistry.getCraftingSystemById(systemId);
                if (!systemToSelect) {
                    throw new Error(`Cannot select system. Crafting system with ID "${systemId}" not found. `);
                }
                this._selectedSystem = systemToSelect;
                await this.render();
                break;
            case "createComponent":
                try {
                    const data: any = JSON.parse(event.dataTransfer?.getData("text/plain"));
                    if (Properties.module.documents.supportedTypes.indexOf(data.type) < 0) {
                        return;
                    }
                    const document: any = await new DefaultDocumentManager().getDocumentByUuid(data.uuid);
                    const fabricateIdentity = document.getFlag(Properties.module.id, Properties.flags.keys.item.id);
                    if (!fabricateIdentity) {
                        await document.setFlag(Properties.module.id, Properties.flags.keys.item.id, document.uuid);
                    }
                    if (!this._selectedSystem.partDictionary.hasComponent(document.uuid)) {
                        this._selectedSystem.partDictionary.addComponent(new CraftingComponent({
                            id: document.uuid,
                            name: document.name,
                            imageUrl: document.img,
                            essences: Combination.EMPTY(),
                            salvage: Combination.EMPTY()
                        }));
                        await this.systemRegistry.saveCraftingSystem(this._selectedSystem);
                    }
                    new EditComponentDialog(document, this._selectedSystem)
                        .render();
                } catch (e: any) {
                    console.warn(`Something was dropped onto a Fabricate drop zone, 
                        but the drop event was not able to be processed. 
                        Caused by: ${e.message ?? e}`);
                }
                break;
            case "createEssence":
                new EditEssenceDialog(this._selectedSystem).render();
                break;
            case "editEssence":
                const essenceIdToEdit = event?.target?.dataset?.essenceId;
                const essenceToEdit = this._selectedSystem.essences.find(essence => essence.id === essenceIdToEdit);
                if (!essenceToEdit) {
                    throw new Error(`Essence with ID "${essenceIdToEdit}" does not exist.`);
                }
                new EditEssenceDialog(this._selectedSystem, essenceToEdit.toJson()).render(); // todo: second arg can be essence, not essencedef
                break;
            case "deleteEssence":
                const essenceIdToDelete = event?.target?.dataset?.essenceId;
                this._selectedSystem.partDictionary.deleteEssenceById(essenceIdToDelete);
                await this.systemRegistry.saveCraftingSystem(this._selectedSystem);
                break;
            default:
                console.error(`An unrecognised action ("${action}") was triggered on the Fabricate Crafting System Manager Form Application.`);
        }
    }

    protected _contextMenu(html: JQuery) {
        const craftingSystemManagerApp = this;
        new ContextMenu(html, ".fabricate-crafting-system", [
            {
                name: `${Properties.module.id}.CraftingSystemManagerApp.contextMenu.export`,
                icon: `<i class="fa-solid fa-file-export"></i>`,
                callback: async (element: JQuery) => {
                    console.log(element.data()["systemId"]);
                }
            },
            {
                name: `${Properties.module.id}.CraftingSystemManagerApp.contextMenu.delete`,
                icon: `<i class="fa-solid fa-trash"></i>`,
                condition: (element: JQuery) => {
                    const locked = element.data()["locked"] as boolean;
                    return !locked;
                },
                callback: async (element: JQuery) => {
                    const systemId = element.data()["systemId"] as string;
                    if (!systemId) {
                        console.error("Cannot delete system: no ID was provided. ");
                        return;
                    }
                    const gameProvider = new GameProvider();
                    const systemToDelete = await craftingSystemManagerApp.systemRegistry.getCraftingSystemById(systemId);
                    if (!systemToDelete) {
                        console.error(`Could not find system ${systemId}`);
                        return;
                    }
                    const GAME = gameProvider.globalGameObject();
                    Dialog.confirm({
                        title: GAME.i18n.localize(`${Properties.module.id}.CraftingSystemManagerApp.deleteSystemConfirm.title`),
                        content: `<p>${GAME.i18n.format(Properties.module.id + ".CraftingSystemManagerApp.deleteSystemConfirm.content", {systemName: systemToDelete.name})}</p>`,
                        yes: () => {
                            craftingSystemManagerApp.systemRegistry.deleteCraftingSystemById(systemId);
                        }
                    });
                    craftingSystemManagerApp._selectedSystem = null;
                    if (systemToDelete === this._selectedSystem) {
                        this._selectedSystem = null;
                    }
                    return;
                }
            },
            {
                name: `${Properties.module.id}.CraftingSystemManagerApp.contextMenu.duplicate`,
                icon: `<i class="fa-solid fa-paste"></i>`,
                callback: async (element: JQuery) => {
                    const systemId = element.data()["systemId"] as string;
                    await craftingSystemManagerApp.systemRegistry.cloneCraftingSystemById(systemId)
                    return;
                }
            }
        ]);
    }

}

export { CraftingSystemManagerApp }