import type { Argument, ArrowFunctionExpression, Function, Class, Declaration, ImportNameKind, Node, Program, StaticExportEntry, TSTypeParameterInstantiation } from "oxc-parser";
import { is, typeName, type TraitAliasDeclaration, type TypeDeclaration, type VarDeclaration } from "../node";
import type { TraitDefinition } from "./trait-definition";
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

export type OwnedImpl = {
    readonly type: 'owned';
    className: string;
    traitName: string;
    impl: ArrowFunctionExpression | Function
};

export type ForeignImpl = {
    readonly type: 'foreign';
    className: string;
    traitName: string;
    impl: ArrowFunctionExpression | Function
}
export type ImplStatementMeta = OwnedImpl | ForeignImpl;

export type ImportRegistry = Record<string, Import>;
export type ReExportRegistry = Record<string, ReExport>;
export type LocalExportRegistry = Record<string, StaticExportEntry>;
export type DeclarationRegistry<T extends Declaration = Declaration> = Record<string, {
    node: T;
    start:
    number;
    end: number;
}>;

export type Registry = FileRegistry | IndexRegistry;

interface RegistryBase {
    traits: Record<string, TraitDefinition>;
    impls: ForeignImpl[];
    ownedImpls: OwnedImpl[];

    store(ast: Program, path: string): void;

    has(name: string): boolean;
    hasType(name: string): boolean;

    get(name: string): Reference | undefined | void;
    getType(name: string): Reference | undefined | void;

}

export interface IndexRegistry extends RegistryBase {
    readonly type: 'index';
    importTypes?: never;
    importVars?: never;
    exportTypes?: never;
    exportVars?: never;

    types: ReExportRegistry;
    vars: ReExportRegistry;
}

export interface FileRegistry extends RegistryBase {
    readonly type: 'file';
    importTypes: ImportRegistry;
    importVars: ImportRegistry;
    exportTypes: LocalExportRegistry;
    exportVars: LocalExportRegistry;
    types: DeclarationRegistry<TypeDeclaration>;
    vars: DeclarationRegistry<VarDeclaration>;

    classes: DeclarationRegistry<Class>;
}

// function getPropertyIdent(expr: MemberExpression) {
//     let node: Node = expr;
//     while (node.type === 'MemberExpression') {
//         if (node.property.type === 'MemberExpression') {
//             node = node.property;
//         }
//     }
// }

/**
 * Data needed for `impl`s -
 * 
 * class and it's properties
 */

export const Registry = {
    Index() {
        // const refCache: Record<string, Reference> = {};
        return {
            type: 'index',
            types: {},
            vars: {},
            traits: {},
            impls: [],
            ownedImpls: [],

            store(_ast: Program, _path: string) { },
            has(name: string) {
                return name in this.types || name in this.vars;
            },
            hasType(name: string) {
                return name in this.types;
            },
            get(_name) {
                // let importRef = this.types[name];
                // if (importRef) {
                //     refCache[name] ??= {
                //         name: name,
                //         isType: true,
                //         isLocal: false,
                //         isTrait: false,
                //         moduleRequest: importRef.moduleRequest,
                //     }

                //     return refCache[name];
                // }

                // importRef = this.vars[name];
                // if (importRef) {
                //     refCache[name] ??= {
                //         name: name,
                //         isType: false,
                //         isLocal: false,
                //         isTrait: false,
                //         moduleRequest: importRef.moduleRequest,
                //     }

                //     return refCache[name];
                // }
            },

            getType(_name) { },
        } satisfies IndexRegistry;
    },
    File() {

        const refCache: Record<string, Reference> = {};
        return {
            type: 'file',
            importTypes: {},
            importVars: {},
            exportTypes: {},
            exportVars: {},

            types: {},
            vars: {},
            classes: {},

            traits: {},
            impls: [],
            ownedImpls: [],

            store(ast: Program, path: string) {

                const exportVars = this.exportVars,
                    exportTypes = this.exportTypes;

                const types: DeclarationRegistry<TypeDeclaration> = {},
                    vars: DeclarationRegistry<VarDeclaration> = {},
                    classes: DeclarationRegistry<Class> = {},
                    impls: ForeignImpl[] = [],
                    ownedImpls: OwnedImpl[] = [];

                // console.log('STORING ', path);

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

                        addImpls(impls, ownedImpls, parent, node);

                    },
                });

                // console.log('REGISTRY:: STORE', path, ownedImpls.length);


                this.types = types;
                this.vars = vars;
                this.impls = impls;
                this.ownedImpls = ownedImpls;
                this.classes = classes;
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
                    refCache[name] ??= {
                        name: name,
                        isType: true,
                        isLocal: false,
                        isTrait: false,
                        moduleRequest: importRef.moduleRequest,
                    }

                    return refCache[name];
                }

                importRef = this.importVars[name];
                if (importRef) {
                    refCache[name] ??= {
                        name: name,
                        isType: false,
                        isLocal: false,
                        isTrait: false,
                        moduleRequest: importRef.moduleRequest,
                    }

                    return refCache[name];
                }

                if (name in this.traits) {
                    refCache[name] ??= {
                        name: name,
                        isType: false,
                        isLocal: true,
                        isTrait: true,
                        definition: this.traits[name]!
                    }
                    return refCache[name];
                }

                if (name in this.exportTypes) {
                    refCache[name] ??= {
                        name: name,
                        isType: true,
                        isLocal: true,
                        isTrait: false,
                    }
                    return refCache[name];

                } else if (name in this.exportVars) {
                    refCache[name] ??= {
                        name: name,
                        isType: false,
                        isLocal: true,
                        isTrait: false,
                    }
                    return refCache[name];

                }

            },
            getType(name: string): Reference | undefined {
                const importRef = this.importTypes[name];
                if (importRef) {
                    refCache[name] ??= {
                        name: name,
                        isType: true,
                        isLocal: false,
                        isTrait: false,
                        moduleRequest: importRef.moduleRequest,
                    }
                    return refCache[name];
                }

                if (name in this.exportTypes) {
                    refCache[name] ??= {
                        name: name,
                        isType: true,
                        isLocal: true,
                        isTrait: false,
                    }
                    return refCache[name];

                }
            }


        } satisfies FileRegistry
    }
} as const;

function addImpls(
    impls: ForeignImpl[],
    ownedImpls: OwnedImpl[],
    parent: Node | null, node: Node
) {

    // TODO: proper error messages
    //* not passing type params...

    if (
        parent && (parent.type === 'ExportDefaultDeclaration' || parent.type === 'ExportNamedDeclaration')
        && node.type === 'ClassDeclaration'
    ) {
        const body = node.body.body;
        for (const element of body) {
            if (element.type === 'StaticBlock') {
                for (const statement of element.body) {
                    if (is.implStatement(statement) || is.implDeclaration(statement)) {
                        addImpl(ownedImpls, statement, 'owned')
                    }
                }
            }
        }
    } else if (
        parent?.type === 'Program'
        || parent?.type === 'ExportNamedDeclaration'
        || parent?.type === 'ExportDefaultDeclaration'
    ) {
        addImpl(impls, node, 'foreign');
    }
}

function addImpl(impls: ImplStatementMeta[], node: Node, type: 'foreign' | 'owned') {
    if (is.implStatement(node)) {
        addImplInner(
            impls,
            node.expression.arguments,
            node.expression.typeArguments,
            type
        )
    } else if (is.implDeclaration(node)) {
        addImplInner(
            impls,
            node.declarations[0].init.arguments,
            node.declarations[0].init.typeArguments,
            type
        )
    }
}

function addImplInner(impls: ImplStatementMeta[], args: Argument[], typeArguments: TSTypeParameterInstantiation | null | undefined, type: 'foreign' | 'owned') {
    if (args.length !== 1 || (args[0]?.type !== 'ArrowFunctionExpression' && args[0]?.type !== 'FunctionDeclaration' && args[0]?.type !== 'FunctionExpression')) {
        return;
    }

    const implFn = args[0];

    if (typeArguments && typeArguments.params.length === 2) {
        const [traitType, classType] = typeArguments.params;

        const traitName = typeName(traitType);
        const className = typeName(classType);


        if (traitName && className) {
            impls.push({
                type: type,
                impl: implFn,
                className: className,
                traitName: traitName,
            });
            return true;
        }

    }

}