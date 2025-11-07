import type { Declaration, ImportNameKind, StaticExportEntry } from "oxc-parser";
import type { TraitAliasDeclaration } from "../node";

export type Import = {
    type: ImportNameKind;
    localToImport: Record<string, string | undefined>;
    moduleRequest: string;
    start: number;
    end: number;
};

export type LocalExport = StaticExportEntry;

export type ReExport = {
    type: 're-export';
    moduleRequest: string;
    entries: StaticExportEntry[];
};


export type Reference = {
    name: string;
    // start: number;
    // end: number;
    isType: boolean;
    isLocal: true;
} | {
    name: string;
    // start: number;
    // end: number;
    isType: boolean;
    isLocal: false;
    moduleRequest: string;
    // isNodeModule: string;
};


export type ImportRegistry = Record<string, Import>;
export type ReExportRegistry = Record<string, ReExport>;
export type LocalExportRegistry = Record<string, LocalExport>;
export type DeclarationRegistry<T extends Declaration = Declaration> = Record<string, {
    node: T;
    start:
    number;
    end: number;
    references: any[];
}>;

type RegistryType = { [K in keyof typeof Registry]: ReturnType<typeof Registry[K]> };

export type Registry = RegistryType[keyof RegistryType];
export type FileRegistry = RegistryType['File'];
export type IndexRegistry = RegistryType['Index'];
export const Registry = {
    Index() {
        return {
            type: 'index',
            types: {} as ReExportRegistry,
            vars: {} as ReExportRegistry,
            has(name: string) {
                return name in this.types || name in this.vars;
            },
            hasType(name: string) {
                return name in this.types;
            },
        } as const;
    },
    File() {
        return {
            type: 'file',
            importTypes: {} as ImportRegistry,
            importVars: {} as ImportRegistry,
            exportTypes: {} as LocalExportRegistry,
            types: {} as DeclarationRegistry<TraitAliasDeclaration>,
            vars: {} as DeclarationRegistry,
            exportVars: {} as LocalExportRegistry,
            has(name: string) {
                return name in this.importTypes
                    || name in this.importVars
                    || name in this.exportTypes
                    || name in this.exportVars
            },
            hasType(name: string) {
                return name in this.importTypes
                    || name in this.exportTypes
            },
            get(name: string): Reference | undefined {
                let importRef = this.importTypes[name];
                if (importRef) {
                    return {
                        name: name,
                        isType: true,
                        isLocal: false,
                        moduleRequest: importRef.moduleRequest,
                    }
                }

                importRef = this.importVars[name];
                if (importRef) {
                    return {
                        name: name,
                        isType: false,
                        isLocal: false,
                        moduleRequest: importRef.moduleRequest,
                    }
                }

                if (name in this.exportTypes) {
                    return {
                        name: name,
                        isType: true,
                        isLocal: true
                    }
                } else if (name in this.exportVars) {
                    return {
                        name: name,
                        isType: false,
                        isLocal: true
                    }
                }

            },
            getType(name: string): Reference | undefined {
                const importRef = this.importTypes[name];
                if (importRef) {
                    return {
                        name: name,
                        isType: true,
                        isLocal: false,
                        moduleRequest: importRef.moduleRequest,
                    }
                }

                if (name in this.exportTypes) {
                    return {
                        name: name,
                        isType: true,
                        isLocal: true
                    }
                }
            }


        } as const
    }
} as const;