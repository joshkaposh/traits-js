import type { Declaration, ImportNameKind, Program, StaticExportEntry } from "oxc-parser";
import { is, type TraitAliasDeclaration, type TypeDeclaration } from "../node";
import type { TraitDefinition } from "./meta";
import { walk } from "oxc-walker";

export type Import = {
    type: ImportNameKind;
    localToImport: string | undefined;
    moduleRequest: string;
    start: number;
    end: number;
};

export type ReExport = {
    type: 're-export';
    moduleRequest: string;
    entries: StaticExportEntry[];
};

export type Reference = {
    name: string;
    isType: boolean;
    isTrait: boolean;
} & ((
    {
        isLocal: true;
    } | {
        isLocal: false;
        moduleRequest: string;
    }
) & (
        {
            isTrait: true;
            definition: TraitDefinition;
        } | {
            isTrait: false
        }
    ));

export type ImportRegistry = Record<string, Import>;
export type ReExportRegistry = Record<string, ReExport>;
export type LocalExportRegistry = Record<string, StaticExportEntry>;
export type DeclarationRegistry<T extends Declaration = Declaration> = Record<string, {
    node: T;
    start:
    number;
    end: number;
    // references: any[];
}>;

export type FileRegistry = ReturnType<typeof Registry['File']>;
export type IndexRegistry = ReturnType<typeof Registry['Index']>;
export type Registry = { [K in keyof typeof Registry]: ReturnType<typeof Registry[K]> }[keyof typeof Registry];
export const Registry = {
    Index() {
        return {
            type: 'index',
            types: {} as ReExportRegistry,
            vars: {} as ReExportRegistry,
            traits: {} as Record<string, TraitDefinition>,

            store(ast: Program, path: string) {

            },
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
            exportVars: {} as LocalExportRegistry,
            types: {} as DeclarationRegistry<TraitAliasDeclaration>,
            vars: {} as DeclarationRegistry,
            traits: {} as Record<string, TraitDefinition>,
            store(ast: Program, path: string) {

                const exportVars = this.exportVars, exportTypes = this.exportTypes;
                const types: DeclarationRegistry<TypeDeclaration> = {}, vars: DeclarationRegistry = {};

                walk(ast, {
                    enter(node, parent) {
                        if (parent && is.declaredInModule(parent, node)) {
                            if (
                                is.constVariableDeclaration(node)
                                && node.declarations[0].id.name in exportVars
                            ) {
                                vars[node.declarations[0].id.name] = {
                                    node,
                                    start: parent.start,
                                    end: parent.end,
                                };

                            } else if (
                                (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration')
                                && node.id
                            ) {
                                const name = node.id.name;
                                vars[name] = {
                                    node,
                                    start: parent.start,
                                    end: parent.end,
                                };

                            } else if (
                                node.type === 'TSTypeAliasDeclaration'
                                && node.typeAnnotation.type === 'TSTypeLiteral'
                            ) {
                                const typeDeclarationName = node.id.name;
                                if (!(typeDeclarationName in exportTypes)) {
                                    console.error('trait files must export all type declarations');
                                    console.log(`${path}`);
                                    console.error(`declared a private type ${typeDeclarationName}\n`);
                                    return;
                                }

                                types[node.id.name] = {
                                    node: node as TraitAliasDeclaration,
                                    start: node.start,
                                    end: node.end,
                                };
                            }
                        }
                    },

                });

                // @ts-expect-error
                this.types = types;
                // @ts-expect-error
                this.vars = vars;
            },

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
                        isTrait: false,
                        moduleRequest: importRef.moduleRequest,
                    }
                }

                importRef = this.importVars[name];
                if (importRef) {
                    return {
                        name: name,
                        isType: false,
                        isLocal: false,
                        isTrait: false,
                        moduleRequest: importRef.moduleRequest,
                    }
                }

                if (name in this.traits) {
                    return {
                        name: name,
                        isType: false,
                        isLocal: true,
                        isTrait: true,
                        definition: this.traits[name]!
                    }
                }

                if (name in this.exportTypes) {
                    return {
                        name: name,
                        isType: true,
                        isLocal: true,
                        isTrait: false,

                    }
                } else if (name in this.exportVars) {
                    return {
                        name: name,
                        isType: false,
                        isLocal: true,
                        isTrait: false,

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
                        isTrait: false,
                        moduleRequest: importRef.moduleRequest,
                    }
                }

                if (name in this.exportTypes) {
                    return {
                        name: name,
                        isType: true,
                        isLocal: true,
                        isTrait: false,
                    }
                }
            }


        } as const
    }
} as const;