import { type IDMap, UIDMap } from "app/lib/id_mapper";
import { sortAts } from "app/lib/parse_stored";
import type {
  IPersistence,
  MetaPair,
  MetaUpdatesInput,
  TransactOptions,
} from "app/lib/persistence/ipersistence";
import {
  EMPTY_MOMENT,
  fMoment,
  type MomentInput,
  OPPOSITE,
  UMoment,
  UMomentLog,
} from "app/lib/persistence/moment";
import { generateKeyBetween } from "fractional-indexing";
import { useAtom } from "jotai";
import once from "lodash/once";
import {
  type Data,
  dataAtom,
  layerConfigAtom,
  memoryMetaAtom,
  momentLogAtom,
  type Store,
} from "state/jotai";
import type {
  IFolder,
  IFolderInput,
  ILayerConfig,
  IWrappedFeature,
  IWrappedFeatureInput,
  LayerConfigMap,
} from "types";
import {
  getFreshAt,
  momentForDeleteFeatures,
  momentForDeleteFolders,
  momentForDeleteLayerConfigs,
  trackMoment,
} from "./shared";

export class ServerPersistence implements IPersistence {
  idMap: IDMap;
  private store: Store;
  private mapSlug: string;

  constructor(idMap: IDMap, store: Store, mapSlug: string) {
    this.idMap = idMap;
    this.store = store;
    this.mapSlug = mapSlug;
  }

  /**
   * Fetch all map data from the backend and populate the Jotai store.
   * Call this once before rendering the app.
   */
  async initialize(): Promise<void> {
    const res = await fetch(`/api/maps/${this.mapSlug}/data`);
    if (!res.ok) throw new Error(`Failed to load map: ${res.status}`);

    const { features, folders, layerConfigs, metadata } = await res.json();

    const featureMap = new Map<string, IWrappedFeature>(
      (features as IWrappedFeature[]).map((f) => [f.id, f]),
    );
    const folderMap = new Map<string, IFolder>(
      (folders as IFolder[]).map((f) => [f.id, f]),
    );

    for (const id of featureMap.keys()) {
      UIDMap.pushUUID(this.idMap, id);
    }

    this.store.set(dataAtom, {
      featureMap,
      folderMap,
      selection: { type: "none" },
    });

    if ((layerConfigs as ILayerConfig[]).length) {
      this.store.set(
        layerConfigAtom,
        new Map(
          (layerConfigs as ILayerConfig[]).map((lc) => [lc.id, lc]),
        ),
      );
    }

    if (metadata && Object.keys(metadata).length) {
      this.store.set(memoryMetaAtom, (prev) => ({ ...prev, ...metadata }));
    }
  }

  putPresence = async () => {};

  useLastPresence() {
    return null;
  }

  private apply(moment: MomentInput) {
    let ctx = this.store.get(dataAtom);
    const layerConfigMap = this.store.get(layerConfigAtom);

    if (!ctx.featureMap.size) ctx = { ...ctx, featureMap: new Map() };
    if (!ctx.folderMap.size) ctx = { ...ctx, folderMap: new Map() };

    const reverse = UMoment.merge(
      fMoment(moment.note || "Reverse"),
      this.deleteFeaturesInner(moment.deleteFeatures, ctx),
      this.deleteFoldersInner(moment.deleteFolders, ctx),
      this.putFeaturesInner(moment.putFeatures, ctx),
      this.putFoldersInner(moment.putFolders, ctx),
      this.putLayerConfigsInner(moment.putLayerConfigs, layerConfigMap),
      this.deleteLayerConfigsInner(moment.deleteLayerConfigs, layerConfigMap),
    );

    this.store.set(dataAtom, {
      selection: ctx.selection,
      featureMap: new Map(
        Array.from(ctx.featureMap).sort((a, b) => sortAts(a[1], b[1])),
      ),
      folderMap: new Map(
        Array.from(ctx.folderMap).sort((a, b) => sortAts(a[1], b[1])),
      ),
    });

    if (moment.putLayerConfigs?.length || moment.deleteLayerConfigs?.length) {
      this.store.set(
        layerConfigAtom,
        new Map(
          Array.from(layerConfigMap).sort((a, b) => sortAts(a[1], b[1])),
        ),
      );
    }

    return reverse;
  }

  private syncToBackend(moment: Partial<MomentInput>) {
    fetch(`/api/maps/${this.mapSlug}/transact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(moment),
    }).catch((err) => console.error("[ServerPersistence] sync failed:", err));
  }

  useTransact() {
    return (partialMoment: Partial<MomentInput> & TransactOptions) => {
      trackMoment(partialMoment);
      const moment: MomentInput = { ...EMPTY_MOMENT, ...partialMoment };
      const result = this.apply(moment);
      if (!partialMoment.quiet) {
        this.store.set(
          momentLogAtom,
          UMomentLog.pushMoment(this.store.get(momentLogAtom), result),
        );
      }
      // Optimistic: apply locally first, then sync to backend
      this.syncToBackend(partialMoment);
      return Promise.resolve();
    };
  }

  useHistoryControl() {
    return (direction: "undo" | "redo") => {
      const momentLog = UMomentLog.shallowCopy(this.store.get(momentLogAtom));
      const moment = momentLog[direction].shift();
      if (!moment) return Promise.resolve();

      const reverse = this.apply(moment);
      if (UMoment.isEmpty(reverse)) return Promise.resolve();

      const opposite = OPPOSITE[direction];
      momentLog[opposite] = [reverse].concat(momentLog[opposite]);
      this.store.set(momentLogAtom, momentLog);

      // Undo/redo also needs to be persisted (e.g. undo a delete = re-insert)
      this.syncToBackend(moment);
      return Promise.resolve();
    };
  }

  useMetadata(): MetaPair {
    const [meta, setMeta] = useAtom(memoryMetaAtom);

    return [
      { type: "memory", ...meta },
      (updates: MetaUpdatesInput) => {
        setMeta((prev) => ({ ...prev, ...updates }));
        fetch(`/api/maps/${this.mapSlug}/metadata`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        }).catch((err) =>
          console.error("[ServerPersistence] metadata sync failed:", err),
        );
        return Promise.resolve();
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Private inner methods (identical to MemPersistence)
  // -------------------------------------------------------------------------

  private deleteFeaturesInner(
    features: readonly IWrappedFeature["id"][],
    ctx: Data,
  ) {
    const moment = momentForDeleteFeatures(features, ctx);
    for (const id of features) ctx.featureMap.delete(id);
    return moment;
  }

  private deleteLayerConfigsInner(
    layerConfigs: readonly ILayerConfig["id"][],
    layerConfigMap: LayerConfigMap,
  ) {
    const moment = momentForDeleteLayerConfigs(layerConfigs, layerConfigMap);
    for (const id of layerConfigs) layerConfigMap.delete(id);
    return moment;
  }

  private deleteFoldersInner(folders: readonly IFolder["id"][], ctx: Data) {
    const moment = momentForDeleteFolders(folders, ctx);
    for (const id of folders) ctx.folderMap.delete(id);
    return moment;
  }

  private putFoldersInner(folders: IFolderInput[], ctx: Data) {
    const moment = fMoment("Put folders");
    let lastAt: string | null = null;

    for (const inputFolder of folders) {
      const oldVersion = ctx.folderMap.get(inputFolder.id);
      if (inputFolder.at === undefined) {
        if (!lastAt) lastAt = getFreshAt(ctx);
        const at = generateKeyBetween(lastAt, null);
        lastAt = at;
        inputFolder.at = at;
      }
      if (oldVersion) {
        moment.putFolders.push(oldVersion);
      } else {
        moment.deleteFolders.push(inputFolder.id);
      }
      ctx.folderMap.set(inputFolder.id, inputFolder as IFolder);
    }
    return moment;
  }

  private putFeaturesInner(features: IWrappedFeatureInput[], ctx: Data) {
    const moment = fMoment("Put features");
    const ats = once(() =>
      Array.from(ctx.featureMap.values(), (w) => w.at).sort(),
    );
    const atsSet = once(() => new Set(ats()));
    let lastAt: string | null = null;

    for (const inputFeature of features) {
      const oldVersion = ctx.featureMap.get(inputFeature.id);
      if (inputFeature.at === undefined) {
        if (!lastAt) lastAt = getFreshAt(ctx);
        const at = generateKeyBetween(lastAt, null);
        lastAt = at;
        inputFeature.at = at;
      }
      if (oldVersion) {
        moment.putFeatures.push(oldVersion);
      } else {
        moment.deleteFeatures.push(inputFeature.id);
        if (atsSet().has(inputFeature.at)) {
          inputFeature.at = generateKeyBetween(null, ats()[0]);
        }
      }
      ctx.featureMap.set(inputFeature.id, inputFeature as IWrappedFeature);
      UIDMap.pushUUID(this.idMap, inputFeature.id);
    }
    return moment;
  }

  private putLayerConfigsInner(
    layerConfigs: ILayerConfig[],
    layerConfigMap: LayerConfigMap,
  ) {
    const moment = fMoment("Put layer configs");
    for (const layerConfig of layerConfigs) {
      const oldVersion = layerConfigMap.get(layerConfig.id);
      if (oldVersion) {
        moment.putLayerConfigs.push(oldVersion);
      } else {
        moment.deleteLayerConfigs.push(layerConfig.id);
      }
      layerConfigMap.set(layerConfig.id, layerConfig);
    }
    return moment;
  }
}
