import type { Folder, Root } from "@tmcw/togeojson";
import type { ImportOptions } from "app/lib/convert";
import {
  importToExportOptions,
  type RawProgressCb,
  stringToGeoJSON,
} from "app/lib/convert";
import type { ShapefileGroup } from "app/lib/convert/shapefile";
import { Shapefile } from "app/lib/convert/shapefile";
import type { ConvertResult } from "app/lib/convert/utils";
import { newFeatureId } from "app/lib/id";
import { usePersistence } from "app/lib/persistence/context";
import {
  fMoment,
  type MomentInput,
} from "app/lib/persistence/moment";
import { pluralize, truncate } from "app/lib/utils";
import { lib } from "app/lib/worker";
import type { FileWithHandle } from "browser-fs-access";
import * as Comlink from "comlink";
import { transfer } from "comlink";
import { generateNKeysBetween } from "fractional-indexing";
import { useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import { type Data, dataAtom, fileInfoAtom } from "state/jotai";
import type {
  Feature,
  FeatureCollection,
  IWrappedFeature,
} from "types";

/**
 * Creates the _input_ to a transact() operation,
 * given some imported result.
 */
export interface PropertyMapping {
  nameKey: string;
  descKey: string;
}

function applyPropertyMapping(feature: Feature, mapping?: PropertyMapping): Feature {
  if (!mapping || (!mapping.nameKey && !mapping.descKey)) return feature;
  const props = { ...(feature.properties ?? {}) };
  if (mapping.nameKey && mapping.nameKey !== "name" && props[mapping.nameKey] !== undefined) {
    props.name = String(props[mapping.nameKey]);
  }
  if (mapping.descKey && mapping.descKey !== "description" && props[mapping.descKey] !== undefined) {
    props.description = String(props[mapping.descKey]);
  }
  return { ...feature, properties: props };
}

function resultToTransact({
  result,
  file,
  track,
  existingFolderId,
  propertyMapping,
}: {
  result: ConvertResult;
  file: Pick<File, "name">;
  track: [
    string,
    {
      format: string;
    },
  ];
  existingFolderId?: string | undefined;
  propertyMapping?: PropertyMapping;
}): Partial<MomentInput> {
  // Flatten any root/folder structure into a plain feature list
  const fc =
    result.type === "geojson"
      ? result.geojson
      : {
          type: "FeatureCollection" as const,
          features: flattenRootFeatures(result.root),
        };

  const { features } = fc;
  const ats = generateNKeysBetween(null, null, features.length);

  return {
    note: `Imported ${file?.name ? file.name : "a file"}`,
    track: track,
    putFolders: [],
    putFeatures: features.map((feature, i) => {
      return {
        at: ats[i],
        folderId: existingFolderId ?? null,
        id: newFeatureId(),
        feature: applyPropertyMapping(feature, propertyMapping),
      };
    }),
  };
}

/**
 * Recursively extract all features from a Root/Folder tree,
 * discarding the folder hierarchy.
 */
function flattenRootFeatures(
  root: Root | Folder,
  features: Feature[] = [],
): Feature[] {
  for (const child of root.children) {
    if (child.type === "Feature") {
      features.push(child);
    } else if (child.type === "folder") {
      flattenRootFeatures(child, features);
    }
  }
  return features;
}


export function useImportString() {
  const rep = usePersistence();
  const transact = rep.useTransact();

  return useCallback(
    /**
     * Convert a given file or string and add it to the
     * current map content.
     */
    async (
      text: string,
      options: ImportOptions,
      progress: RawProgressCb,
      name: string = "Imported text",
      existingFolderId?: string,
    ) => {
      return (await stringToGeoJSON(text, options, Comlink.proxy(progress)))
        .map(async (result) => {
          await transact(
            resultToTransact({
              result,
              file: { name },
              track: [
                "import-string",
                {
                  format: "geojson",
                },
              ],
              existingFolderId,
            }),
          );
          return result;
        })
        .mapLeft((e) => {
          // eslint-disable-next-line no-console
          console.error(e);
          return e;
        });
    },
    [transact],
  );
}

export function getTargetMap(
  { featureMap }: Pick<Data, "featureMap">,
  joinTargetHeader: string,
) {
  const targetMap = new Map<string, IWrappedFeature[]>();
  let sourceMissingFieldCount = 0;

  for (const wrappedFeature of featureMap.values()) {
    const value = wrappedFeature.feature.properties?.[joinTargetHeader];
    if (value !== undefined) {
      const valueStr = String(value);
      const oldTarget = targetMap.get(valueStr);
      if (oldTarget) {
        targetMap.set(valueStr, [wrappedFeature].concat(oldTarget));
      } else {
        targetMap.set(valueStr, [wrappedFeature]);
      }
    } else {
      sourceMissingFieldCount++;
    }
  }

  return { targetMap, sourceMissingFieldCount };
}

function momentForJoin(
  features: Feature[],
  targetMap: ReturnType<typeof getTargetMap>["targetMap"],
  joinSourceHeader: string,
  result: ConvertResult,
) {
  const moment: MomentInput = {
    ...fMoment("Joined data"),
    track: "import-data-join",
  };

  for (const feature of features) {
    const value = feature.properties?.[joinSourceHeader];
    if (value === undefined) continue;
    const target = targetMap.get(String(value));

    if (!target) {
      result.notes.push(
        `No feature on the map found for ${truncate(
          joinSourceHeader,
        )} = "${truncate(String(value))}"`,
      );
      continue;
    }

    for (const wrappedFeature of target) {
      /**
       * Merge the new properties into the existing map
       * feature and update it.
       */
      moment.putFeatures.push({
        ...wrappedFeature,
        feature: {
          ...wrappedFeature.feature,
          properties: {
            ...(wrappedFeature.feature.properties || {}),
            ...(feature.properties || {}),
          },
        },
      });
    }
  }
  return moment;
}

function useJoinFeatures() {
  return useAtomCallback(
    useCallback(
      (
        get,
        _set,
        {
          options,
          geojson,
          result,
        }: {
          options: ImportOptions;
          geojson: FeatureCollection;
          result: ConvertResult;
        },
      ) => {
        const { features } = geojson;
        const { joinTargetHeader, joinSourceHeader } = options.csvOptions;
        const data = get(dataAtom);

        const { targetMap, sourceMissingFieldCount } = getTargetMap(
          data,
          joinTargetHeader,
        );

        if (sourceMissingFieldCount > 0) {
          result.notes.push(
            `${pluralize(
              "feature",
              sourceMissingFieldCount,
            )} in existing map data missing the join column.`,
          );
        }

        return momentForJoin(features, targetMap, joinSourceHeader, result);
      },
      [],
    ),
  );
}

export function useImportFile() {
  const rep = usePersistence();
  const setFileInfo = useSetAtom(fileInfoAtom);
  const transact = rep.useTransact();
  const joinFeatures = useJoinFeatures();

  return useCallback(
    /**
     * Convert a given file or string and add it to the
     * current map content.
     */
    async (
      file: FileWithHandle,
      options: ImportOptions,
      progress: RawProgressCb,
      propertyMapping?: PropertyMapping,
    ) => {
      const arrayBuffer = await file.arrayBuffer();

      const either = (
        await lib.fileToGeoJSON(
          transfer(arrayBuffer, [arrayBuffer]),
          options,
          Comlink.proxy(progress),
        )
      ).bimap(
        (err) => {
          return err;
        },
        async (result) => {
          if (
            options.csvOptions.kind === "join" &&
            (options.type === "csv" || options.type === "xls") &&
            result.type === "geojson"
          ) {
            const { geojson } = result;
            const moment = joinFeatures({
              options,
              geojson,
              result,
            });
            await transact(moment);
            return result;
          } else {
            const exportOptions = importToExportOptions(options);
            if (file.handle && exportOptions) {
              setFileInfo({ handle: file.handle, options: exportOptions });
            }
            const moment = resultToTransact({
              result,
              file,
              track: [
                "import",
                {
                  format: options.type,
                },
              ],
              propertyMapping,
            });
            await transact(moment);
            return result;
          }
        },
      );

      return either;
    },
    [setFileInfo, transact, joinFeatures],
  );
}

export function useImportShapefile() {
  const rep = usePersistence();
  const transact = rep.useTransact();

  return useCallback(
    /**
     * Convert a given file or string and add it to the
     * current map content.
     */
    async (file: ShapefileGroup, options: ImportOptions, propertyMapping?: PropertyMapping) => {
      const either = (await Shapefile.forwardLoose(file, options)).map(
        async (result) => {
          await transact(
            resultToTransact({
              result,
              file: file.files.shp,
              track: [
                "import",
                {
                  format: "shapefile",
                },
              ],
              propertyMapping,
            }),
          );
          return result;
        },
      );

      return either;
    },
    [transact],
  );
}
