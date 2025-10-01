import type { ImportNameKind, StaticExport, StaticExportEntry, StaticImport } from "oxc-parser";
import { tryResolveSync } from "./resolver";
import type { ResolverFactory } from "oxc-resolver";
import type { Stack } from "./stack";

export type ModuleImport = {
    type: ImportNameKind;
    localToImport: Record<string, string | undefined>;
    moduleRequest: string;
};

export type LocalExport = StaticExportEntry;

export type ReExport = {
    type: 're-export';
    moduleRequest: string;
    entries: StaticExportEntry[];
};;

type R<T> = Record<string, T>;

export type ImportRegistry = R<ModuleImport>;
export type ReExportRegistry = R<ReExport>;
export type LocalExportRegistry = R<LocalExport>;


type RegistryType = { [K in keyof typeof Registry]: ReturnType<typeof Registry[K]> };

export type Registry = RegistryType[keyof RegistryType];
export type FileRegistry = RegistryType['File'];
export type IndexRegistry = RegistryType['Index'];
export const Registry = {
    Index(stack: Stack, resolver: ResolverFactory, staticExports: StaticExport[]) {


        //    for (const path in reExportTypes) {
        //             const resolveResult = tryResolveSync(resolver, originalRequest, path);
        //             const absolutePath = resolveResult?.path;
        //             if (absolutePath && !stack.visited(absolutePath)) {
        //                 const newParseResult = await resolve(resolver, absolutePath, indexFilter);
        //                 checkParseResult(newParseResult, absolutePath);
        //                 stack.push({
        //                     isIndex: newParseResult.path.endsWith(indexFilter),
        //                     file: new TraitFile(newParseResult)
        //                 });
        //             }
        //         };

        //         for (const path in reExportVars) {
        //             const resolveResult = tryResolveSync(resolver, originalRequest, path);
        //             const absolutePath = resolveResult?.path;

        //             if (absolutePath && !stack.visited(absolutePath)) {
        //                 const newResult = await resolve(resolver, absolutePath, path);
        //                 checkParseResult(newResult, absolutePath);
        //                 stack.push({ isIndex: newResult.name.endsWith(indexFilter), file: new TraitFile(newResult) });
        //             }
        //         }
        //     };


        const types: ReExportRegistry = {};
        const vars: ReExportRegistry = {};

        // const registerReExports: registerReExportsFn = async (originalRequest: string) => {
        //     for (const path in types) {
        //         const resolveResult = tryResolveSync(resolver, originalRequest, path);
        //         const absolutePath = resolveResult?.path;
        //         if (absolutePath && !stack.visited(absolutePath)) {
        //             const newParseResult = await resolve(resolver, absolutePath, indexFilter);
        //             checkParseResult(newParseResult, absolutePath);
        //             const isIndex = newParseResult.path.endsWith(indexFilter);
        //             const m = newParseResult.result.module;
        //             stack.push(new TraitFile(newParseResult, isIndex ? Registry.Index(m.staticExports) : Registry.File(m.staticImports, m.staticExports)));
        //         }
        //     };

        //     for (const path in reExportVars) {
        //         const resolveResult = tryResolveSync(resolver, originalRequest, path);
        //         const absolutePath = resolveResult?.path;

        //         if (absolutePath && !stack.visited(absolutePath)) {
        //             const newResult = await resolve(resolver, absolutePath, path);
        //             checkParseResult(newResult, absolutePath);
        //             const isIndex = newResult.path.endsWith(indexFilter);
        //             const m = newResult.result.module;
        //             stack.push(new TraitFile(newResult, isIndex ? Registry.Index(m.staticExports) : Registry.File(m.staticImports, m.staticExports)));
        //         }
        //     }
        // };

        return {
            type: 'index',
            types: types as ReExportRegistry,
            vars: vars as ReExportRegistry,
            async register() {

                for (let i = staticExports.length - 1; i >= 0; i--) {
                    const entries = staticExports[i]?.entries!;
                    for (let j = 0; j < entries.length; j++) {
                        const entry = entries[j]!;
                        // if entry has module request, it is not a local export
                        // e.g "export const someVar = someValue"
                        if (entry.moduleRequest) {
                            const moduleRequest = entry.moduleRequest;
                            const request = moduleRequest.value;
                            const r = entry.isType ? types : vars;
                            if (!r[request]) {
                                r[request] = {
                                    type: 're-export',
                                    moduleRequest: moduleRequest.value,
                                    entries: [],
                                };
                            }
                            r[request]!.entries.push(entry);
                        } else {
                            //    Error: local definition are not allowed in index files
                        }
                    }
                }

                // await registerExports(types, vars);

            }
        } as const;
    },
    File(staticImports: StaticImport[], staticExports: StaticExport[]) {
        // const importTypes: ImportRegistry = {};
        // for (let i = 0; i < staticImports.length; i++) {
        //     const staticImport = staticImports[i]!;

        // }

        // for (let i = 0; i < staticExports.length; i++) {
        //     const staticExport = staticExports[i]!;
        // }
        return {
            type: 'file',
            importTypes: {} as ImportRegistry,
            importVars: {} as ImportRegistry,
            exportTypes: {} as LocalExportRegistry,
            exportVars: {} as LocalExportRegistry
        } as const
    }
} as const;