import type { ImportNameKind, StaticExportEntry } from "oxc-parser";

export type Import = {
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

export type ImportRegistry = Record<string, Import>;
export type ReExportRegistry = Record<string, ReExport>;
export type LocalExportRegistry = Record<string, LocalExport>;

type RegistryType = { [K in keyof typeof Registry]: ReturnType<typeof Registry[K]> };

export type Registry = RegistryType[keyof RegistryType];
export type FileRegistry = RegistryType['File'];
export type IndexRegistry = RegistryType['Index'];
export const Registry = {
    Index() {
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
            types: {} as ReExportRegistry,
            vars: {} as ReExportRegistry
        } as const;
    },
    File() {
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