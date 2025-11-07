import { Scope, ScopeManager, analyze } from 'eslint-scope';
import { visitorKeys, type Function, type ObjectProperty, type ObjectPropertyKind } from "oxc-parser";
import { walk } from "oxc-walker";
import { TraitDefinition } from "./definition";
import type { DeclarationRegistry, FileRegistry, Reference } from "./file/registry";
import { TraitError } from "./error";
import { isDeclaredInModule, type TraitAliasDeclaration, type TraitCallExpression, type TraitObjectProperty, type TypeArguments } from "./node";
import { TRAIT_FN_NAME } from "./constants";
import { DEFAULT, Flags, REQUIRED } from "./flags";
import { addTypeRef, createFilteredExportOrImportNames } from "./helpers";
import type { TraitFile } from "./file";
import type { MethodParseResult, Project } from "./project";


type CheckMethodResult = {
    readonly importRefs: Record<string, Reference[]>;
    readonly exportRefs: {
        name: string;
        isType: boolean;
        isLocal: true;
    }[];
    readonly ambiguousCallSites: {
        identName: string;
        start: number;
        end: number;
    }[];
}

export function collectBindings(
    file: TraitFile,
    traits: Record<string, TraitDefinition>,
    errors: Record<string, TraitError[]>
) {
    const { exportTypes, exportVars, types, vars } = file.registry as FileRegistry;
    const ast = file.ast;
    const path = file.path;
    // const types: DeclarationRegistry<TraitAliasDeclaration> = {},
    //     vars: DeclarationRegistry = {};

    walk(ast, {
        enter(node) {
            // TODO: wtf? why doesn't parseSync add range??
            this.replace({ ...node, range: [node.start, node.end] })
        },
    });


    const tracker = analyze(ast as any, {
        childVisitorKeys: visitorKeys,
        ecmaVersion: 2022,
        sourceType: 'module',
    });

    walk(ast, {
        enter(node, parent) {
            if (parent && isDeclaredInModule(parent, node)) {
                if (
                    node.type === 'VariableDeclaration'
                    && node.kind === 'const'
                    && node.declarations[0]?.id.type === 'Identifier'
                    && node.declarations[0].id.name in exportVars
                ) {

                    const name = node.declarations[0].id.name;
                    const references = tracker.acquire(node as any)?.references ?? [];
                    vars[name] = {
                        node,
                        start: parent.start,
                        end: parent.end,
                        references: references,
                    };

                } else if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) {
                    const name = node.id.name;
                    const references = tracker.acquire(node as any)?.references ?? [];
                    vars[name] = {
                        node,
                        start: parent.start,
                        end: parent.end,
                        references: references,
                    };

                } else if (
                    node.type === 'TSTypeAliasDeclaration'
                    && node.typeAnnotation.type === 'TSTypeLiteral'
                    // && node.id.name in exportTypes
                ) {
                    const typeDeclarationName = node.id.name;
                    if (!(typeDeclarationName in exportTypes)) {
                        console.error('trait files must export all type declarations');
                        console.log(`${file.path}`);
                        console.error(`declared a private type ${typeDeclarationName}\n`);
                    } else {
                        types[node.id.name] = { node: node as TraitAliasDeclaration, start: node.start, end: node.end, references: [] };
                    }
                }
            }

        },

    });

    for (const varName in vars) {
        const { node: declaration, start, end } = vars[varName]!;
        if (declaration.type !== 'VariableDeclaration') {
            continue;
        }
        if (declaration.kind !== 'const') {
            errors[varName] = [TraitError.LetDeclaration()];
            continue
        }

        const declarator = declaration.declarations[0];

        // TODO: use importName of "trait" instead of hard-coded here
        if (declarator && declarator.init?.type === 'CallExpression' && declarator.init.callee.type === 'Identifier' && declarator.init.callee.name === TRAIT_FN_NAME) {
            const call_expr = declarator.init as TraitCallExpression;
            const args = call_expr.arguments;
            const definition_errors: TraitError[] = [];

            if (args.length !== 1) {
                console.log('error: invalid trait argument length');
                definition_errors.push(TraitError.InvalidTraitCallArguments());
                errors[varName] = definition_errors;
                traits[varName] = new TraitDefinition(call_expr as TraitCallExpression, varName, path, start, end, false, Flags.empty);
                continue;
            }
            const base = parseType(call_expr.typeArguments.params as TypeArguments['params'], file.code, types);
            if (Array.isArray(base)) {
                definition_errors.push(...base);
                // console.log('error: failed parsing base type for ', varName, base.map(e => e.message));
                traits[varName] = new TraitDefinition(call_expr, varName, path, start, end, false, Flags.empty)
                continue;
            }

            traits[varName] = new TraitDefinition(
                call_expr,
                varName,
                path,
                start,
                end,
                true,
                base,
            );
        }
    }

    return { tracker, types, vars };
}


export function parseDerives(project: Project, { traits, registry, path }: TraitFile) {
    const { importTypes, importVars } = registry as FileRegistry;

    const errors: Record<string, TraitError[]> = {};
    for (const traitName in traits) {
        const def = traits[traitName]!;

        const uninitDerives = def.uninitializedDerives;

        if (!uninitDerives.length) {
            // console.log('trait = ', traitName);

            continue
        }

        if (!uninitDerives.every(t => t.type === 'TSTypeReference' || t.type === 'TSTypeQuery')) {
            errors[traitName] = [TraitError.InvalidDeriveType()];
            continue;
        }

        const derives = project.getDerives(
            project,
            importTypes,
            importVars,
            traits,
            uninitDerives,
            path
        );

        if (derives.valid) {
            // console.log('trait = %s', def.valid, traitName, derives.derives.map(d => d.name));
            def.join(derives.derives);
        } else {
            // console.log('[fail]: %s ', traitName);
            def.invalidate();
        }

    }
}

function parseType(typeArguments: TypeArguments['params'], code: string, types: DeclarationRegistry<TraitAliasDeclaration>): Flags | TraitError[] {
    if (!typeArguments.length) {
        console.log('#parseType: no type arguments');

        return [TraitError.EmptyTraitTypeArguments()];
    } else if (typeArguments.length > 2) {
        console.log('#parseType: type arguments length greater than 2');
        return [TraitError.InvalidTraitTypeArgument()];
    }

    if (typeArguments.length === 1) {
        const typeArgument = typeArguments[0];
        if (!typeArgument) {
            return [TraitError.EmptyTraitTypeArguments()];
        }

        if (typeArgument.type !== 'TSTypeLiteral' && typeArgument.type !== 'TSTypeReference') {
            return [TraitError.InvalidTraitTypeArgument()];
        }
        return Flags.tryFrom(types, code, typeArgument);
    } else {
        return Flags.tryFrom(types, code, typeArguments[0]);
    }

}


export function parseDefinitionImplementation({ tracker, registry }: TraitFile<FileRegistry>, definition: TraitDefinition) {
    const flags = definition.flags,
        properties = definition.properties,
        err_requiredStaticNames: string[] = [],
        err_requiredInstanceNames: string[] = [],
        deps = parseTraitProperties(
            properties,
            (name, isStatic) => {
                const valid = flags.has(name, DEFAULT, isStatic);
                if (!valid) {
                    const hasRequired = !flags.has(name, REQUIRED, isStatic);
                    if (hasRequired) {
                        if (isStatic) {
                            err_requiredStaticNames.push(name);
                        } else {
                            err_requiredInstanceNames.push(name);
                        }
                    }
                }

                return valid;
            }
        );

    if (
        !deps.valid
        || err_requiredInstanceNames.length
        || err_requiredStaticNames.length
    ) {
        return;
    }

    const dependencies = parseMethodDependencies(tracker, registry, definition, deps.staticProps, deps.instanceProps);
    if (dependencies && definition.valid) {
        definition.initialize(dependencies)
    }
}

function parseTraitProperties(
    properties: TraitObjectProperty[],
    isValid: (propertyName: string, isStatic: boolean) => boolean,
) {
    const staticProps: Record<string, TraitObjectProperty> = {};
    const instanceProps: Record<string, TraitObjectProperty> = {};
    const unknownStatic: ObjectProperty[] = [],
        unknownInstance: Array<{
            type: 'SpreadAssigment' | 'KeyNeIdentifier' | 'DefinesRequired';
            start: number;
            end: number
        }> = [];

    for (let i = 0; i < properties.length; i++) {
        const property = properties[i]!;
        const propertyName = property.key.name;

        if (property.value.type === 'FunctionExpression') {
            if (isValid(propertyName, true)) {
                staticProps[propertyName] = property;
            }
        } else if (propertyName === 'instance' && property.value.type === 'ObjectExpression') {
            const instanceProperties = property.value.properties;

            parseTraitInstanceProperties(
                instanceProperties,
                instanceProps,
                unknownInstance,
                isValid,
            );

        } else {
            unknownStatic.push(property);
        }
    }

    return unknownInstance.length || unknownStatic.length ? { valid: false, unknownStatic, unknownInstance } as const : { valid: true, staticProps, instanceProps } as const
}

function parseTraitInstanceProperties(
    properties: ObjectPropertyKind[],
    instanceProps: Record<string, TraitObjectProperty>,
    unknownInstance: { type: string; start: number; end: number, name?: string }[],
    isValid: (propertyName: string, isStatic: boolean) => boolean,
) {
    for (let i = 0; i < properties.length; i++) {
        const instanceProperty = properties[i]!;
        if (instanceProperty.type === 'SpreadElement') {
            unknownInstance.push({ type: 'SpreadAssigment', start: instanceProperty.start, end: instanceProperty.end });
            continue;
        }

        const key = instanceProperty.key;
        if (key.type !== 'Identifier') {
            unknownInstance.push({
                type: 'KeyNeIdentifier',
                start: instanceProperty.key.start,
                end: instanceProperty.key.end,
            });
            continue;
        }

        if (isValid(key.name, false)) {
            instanceProps[key.name] = instanceProperty as TraitObjectProperty;
        } else {
            unknownInstance.push({ type: 'NotRegisteredInTrait', start: instanceProperty.start, end: instanceProperty.end, name: key.name });
        }
    }
}

function parseMethodDependencies(tracker: ScopeManager, registry: FileRegistry, definition: TraitDefinition, staticProps: Record<string, ObjectProperty>, instanceProps: Record<string, TraitObjectProperty>) {
    const staticDependencies: Record<string, MethodParseResult> = {};
    const instanceDependencies: Record<string, MethodParseResult> = {};

    let erroredOn: string | undefined;
    for (const propertyName in staticProps) {
        const prop = staticProps[propertyName]!;
        const method = prop.value as Function;
        if (!method.body) {
            //! error: default methods must have a body
            erroredOn = propertyName;
            break;
        }

        const scope = tracker.acquire(method as any);
        // ! exclude globals such as console, require

        const references = checkMethod(registry, definition, scope!, method);

        if (references.ambiguousCallSites.length) {
            definition.invalidate();
            const ambiguousCallSites = references.ambiguousCallSites;
            const names = Array.from(new Set(ambiguousCallSites.map(acs => acs.identName)))
            console.error(`[${definition.name}.${propertyName}] has ${ambiguousCallSites.length} ambiguous property access(es):\n${names.map(name => {
                const names = [];
                if (definition.flags.baseNameSet.has(name)) {
                    names.push(definition.name);
                }

                const derives = definition.flags.derives;
                for (const deriveName in derives) {
                    const derive = derives[deriveName]!;
                    if (derive.flags.baseNameSet.has(name)) {
                        names.push(derive.name);
                    }
                }
                return `    ${name}, defined in [ ${names.join(', ')}] `
            })}`);

            console.log(`use \`as<Trait>(this).propertyName\`\nor \`(this as Trait).propertyName\`\nto resolve ambiguities`);
        } else {
            if (references.exportRefs.length || Object.keys(references.importRefs).length) {
                console.log('REFERENCES: ', definition.name, Object.fromEntries(Object.entries(references.importRefs).map(([k, v]) => [k, createFilteredExportOrImportNames(v)])), createFilteredExportOrImportNames(references.exportRefs));
            }

            // const importStatements = Object.entries(references.importRefs).map((entry) => {
            //     const [moduleRequest, references] = entry;
            //     return createImportDeclaration(moduleRequest, createFilteredExportOrImportNames(references));
            // });
            staticDependencies[propertyName] = references;
        }



        // const importStatements = Object.entries(references.importRefs).map((entry) => {
        //     const [moduleRequest, references] = entry;
        //     return createImportDeclaration(moduleRequest, createFilteredExportOrImportNames(references));
        // });

        // if (Object.keys(references.importRefs).length) {
        //     console.log(importStatements);
        // }

        // if (references.exportRefs.length) {
        //     console.log([createImportDeclaration(file.path, createFilteredExportOrImportNames(references.exportRefs))]);
        // }

    }

    for (const propertyName in instanceProps) {
        const prop = instanceProps[propertyName]!;
        const method = prop.value as Function;
        if (!method.body) {
            //! error: default methods must have a body
            erroredOn = propertyName;
            break;
        }

        const scope = tracker.acquire(method as any);
        // ! exclude globals such as console, require

        const references = checkMethod(registry, definition, scope!, method);

        if (references.ambiguousCallSites.length) {
            definition.invalidate();
            const ambiguousCallSites = references.ambiguousCallSites;
            const names = Array.from(new Set(ambiguousCallSites.map(acs => acs.identName)))
            console.error(`[${definition.name}.${propertyName}] has ${ambiguousCallSites.length} ambiguous property access(es):\n${names.map(name => {
                const names = [];
                if (definition.flags.baseNameSet.has(name)) {
                    names.push(definition.name);
                }

                const derives = definition.flags.derives;
                for (const deriveName in derives) {
                    const derive = derives[deriveName]!;
                    if (derive.flags.baseNameSet.has(name)) {
                        names.push(derive.name);
                    }
                }
                return `    ${name}, defined in [ ${names.join(', ')}] `
            })}`);

            console.log(`use \`as<Trait>(this).propertyName\`\nor \`(this as Trait).propertyName\`\nto resolve ambiguities`);
        } else {
            if (references.exportRefs.length || Object.keys(references.importRefs).length) {
                console.log('REFERENCES: ', definition.name, Object.fromEntries(Object.entries(references.importRefs).map(([k, v]) => [k, createFilteredExportOrImportNames(v)])), createFilteredExportOrImportNames(references.exportRefs));
            }

            instanceDependencies[propertyName] = references;
        }
    }

    return erroredOn ? void 0 : { static: staticDependencies, instance: instanceDependencies }
}

function checkMethod(
    registry: FileRegistry,
    definition: TraitDefinition,
    scope: Scope,
    method: Function
): CheckMethodResult {
    const ambiguousCallSites: { start: number; end: number; identName: string }[] = [];
    // ! exclude globals such as console, require
    const bodyReferences = scope?.through.filter(t => {
        return registry.has(t.identifier.name);
    }).map(r => registry.get(r.identifier.name)!);

    const paramReferences: Reference[] = [];
    const returnReferences: Reference[] = [];

    for (const param of method.params) {
        walk(param, {
            enter(node) {
                addTypeRef(registry, node, paramReferences);
            },
        });
    }

    if (method.returnType) {
        walk(method.returnType, {
            enter(node) {
                addTypeRef(registry, node, returnReferences)
            },
        });
    }

    //! SAFETY: method body has been checked to be non-null
    walk(method.body!, {
        enter(node, parent) {
            //* skip looking for `this` references in scopes that are not `trait.methodName` 
            if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
                this.skip();
            }

            if (node.type === 'ThisExpression' &&
                (parent
                    && parent.type === 'MemberExpression'
                    && parent.property.type === 'Identifier'
                )
            ) {
                const identName = parent.property.name;
                const f = definition.flags.getFlags(identName);
                if (f && f.flags.length > 1) {
                    const obj = parent.object;
                    // TODO: check if cast is to a trait
                    // TODO: check if casted trait has a method with the proper call signature
                    if (obj.type === 'TSAsExpression') {
                    } else if (obj.type === 'CallExpression') {

                    } else {
                        ambiguousCallSites.push({ start: parent.start, end: parent.end, identName: identName });
                    }
                }
                // console.log('ident', getCode(code, parent.start, parent.end), f);
            }
        },
    });

    const references = paramReferences.concat(bodyReferences ?? []).concat(returnReferences);
    const importRefs: Record<string, Reference[]> = {};
    const exportRefs = [];

    for (let i = 0; i < references.length; i++) {
        const reference = references[i]!;
        if (!reference.isLocal) {
            if (!importRefs[reference.moduleRequest]) {
                importRefs[reference.moduleRequest] = [];
            };

            importRefs[reference.moduleRequest]!.push(reference)
        } else {
            exportRefs.push(reference);
        }
    }

    return {
        importRefs,
        exportRefs,
        ambiguousCallSites
    };
}

// function parseImplementationImplementation({ tracker, registry }: TraitFile<FileRegistry>, definition: TraitDefinition) {
//     const flags = definition.flags,
//         properties = definition.properties,
//         err_missingStaticNames: string[] = [],
//         err_missingInstanceNames: string[] = [],
//         props = parseTraitProperties(
//             properties,
//             (name, isStatic) => {
//                 const valid = flags.has(name, REQUIRED, isStatic);
//                 if (!valid) {
//                     if (flags.nameSet.has(name)) {
//                         if (isStatic) {
//                             err_missingStaticNames.push(name)
//                         } else {
//                             err_missingInstanceNames.push(name);
//                         }
//                     }

//                 }
//                 return valid;
//             }
//         );

//     if (
//         !props.valid
//         || err_missingInstanceNames.length
//         || err_missingStaticNames.length
//     ) {
//         return;
//     }

//     const dependencies = parseMethodDependencies(tracker, registry, definition, props.staticProps, props.instanceProps);
//     if (dependencies && definition.valid) {
//         definition.initialize(dependencies)
//     }
// }