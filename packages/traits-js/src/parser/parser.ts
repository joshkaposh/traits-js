import { Scope } from 'eslint-scope';
import { type ArrowFunctionExpression, type Function, type Node, type ObjectExpression, type ObjectProperty, type ObjectPropertyKind, type Statement, type TSType, type TSTypeQuery, type TSTypeReference } from "oxc-parser";
import { walk } from "oxc-walker";
import { TraitDefinition } from "./storage";
import type { DeclarationRegistry, FileRegistry, ImplStatementMeta, Reference } from "./storage/registry";
import { TraitError } from "./errors";
import { is, type TraitAliasDeclaration, type TraitCallExpression, type TraitDeclaration, type TraitObjectProperty, type TypeArguments, type TypeDeclaration } from "./node";
import { TRAIT_FN_NAME } from "./constants";
import { DEFAULT, Flags, INSTANCE, INSTANCE_REQUIRED, REQUIRED, STATIC, STATIC_REQUIRED } from "./storage/flags";
import { addTypeRef, createFilteredExportOrImportNames } from "./helpers";
import type { TraitFile } from "./storage/trait-file";
import type { Project } from "./project";

type AmbiguousCallSite = { identName: string; start: number; end: number };

export type CheckMethodResult = {
    readonly importRefs: Record<string, Reference[]>;
    readonly exportRefs: Reference[];
    readonly ambiguousCallSites: AmbiguousCallSite[];
    readonly improperCasts: any[]
}

// -> trait(...) <- 
export function parseTraits(file: TraitFile<FileRegistry>) {
    const traits: Record<string, TraitDefinition> = {},
        errors: Record<string, TraitError[]> = {};
    const { path, registry: { types, vars } } = file;
    let errored = false;

    for (const varName in vars) {
        const { node: declaration, start, end } = vars[varName]!;
        if (
            declaration.type !== 'VariableDeclaration' ||
            declaration.kind !== 'const'
        ) {
            continue;
        }

        const declarator = declaration.declarations[0];

        // TODO: use importName of "trait" instead of hard-coded here
        if (declarator && declarator.init?.type === 'CallExpression' && declarator.init.callee.type === 'Identifier' && declarator.init.callee.name === TRAIT_FN_NAME) {
            const call_expr = declarator.init as TraitCallExpression;
            const args = call_expr.arguments;
            const definition_errors: TraitError[] = [];

            if (args.length !== 1) {
                // console.log('error: invalid trait argument length');
                definition_errors.push(TraitError.InvalidTraitCallArguments());
                errored = true;
                errors[varName] = definition_errors;
                traits[varName] = TraitDefinition.invalid(declaration as TraitDeclaration, varName, path, start, end);
                continue;
            }
            const base = parseType(call_expr.typeArguments.params as TypeArguments['params'], file.code, types);
            if (Array.isArray(base)) {
                errored = true;
                definition_errors.push(...base);
                traits[varName] = TraitDefinition.invalid(declaration as TraitDeclaration, varName, path, start, end)
                continue;
            }

            traits[varName] = TraitDefinition.valid(
                declaration as TraitDeclaration,
                varName,
                path,
                base,
                start,
                end,
            );
        }
    }

    return {
        traits,
        errors,
        errored
    }
}

// -> impl<Trait, Class>(() => {}) <-

export function parseImpl(project: Project, file: TraitFile<FileRegistry>, impl: ImplStatementMeta) {
    // let implObject!: ObjectExpression;
    // let body!: Statement[] | undefined;

    // const implFn = impl.impl;

    const trait = project.resolveTrait(file, impl.traitName);

    const implObject = getImplObject(impl);


    console.log('parse:impl', trait?.name, implObject != null);


    if (trait && implObject) {



        const flags = trait.flags;
        const requiredStaticNames = flags.get(STATIC_REQUIRED);
        const requiredInstanceNames = flags.get(INSTANCE_REQUIRED);

        const overriddenDefaults: any[] = [];


        const properties = implObject.properties;
        parseTraitProperties(properties as any, (propName, isStatic) => {
            console.log('Parsing impl property: ', propName);

            const propFlags = flags.getFlags(propName);
            console.log('propFlags: ', propFlags);



            return false;
            if (isStatic) {
                // const propFlag = flags.getFlags()
                // return 
            }
        });


        // for (const prop of properties) {
        // }



    }

    // Flags.tryFromObject(implObject);


}


// trait<  -> {} <-  >(...) 
export function parseDerives(project: Project, file: TraitFile<FileRegistry>) {
    const errors: Record<string, TraitError[]> = {};
    for (const def of file.traits()) {
        const uninitDerives = def.uninitializedDerives;

        if (!uninitDerives.length) {
            // console.log('trait = ', traitName);
            continue
        }

        if (!uninitDerives.every(t => t.type === 'TSTypeReference' || t.type === 'TSTypeQuery')) {
            errors[def.name] = [TraitError.InvalidDeriveType()];
            continue;
        }

        const derives = getDerives(
            project,
            file,
            uninitDerives,
        );

        if (derives.valid) {
            def.join(derives.derives);
        } else {
            console.log('[ fail (derives) ]: %s ', def.name,
                derives.errors.map(e => e.message)
            );
            def.invalidate();
        }

    }
}

// trait( -> {} <- )
export function parseDefinition(file: TraitFile<FileRegistry>, definition: TraitDefinition) {
    if (!definition.valid) {
        return;
    }

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

    const dependencies = checkMethodsGetRefs(file, definition, deps.staticProps, deps.instanceProps);
    if (Array.isArray(dependencies)) {
        for (const message of dependencies) {
            console.log(message);
        }
        return;
    }

    definition.initialize(dependencies);
}

function getImplObject(impl: ImplStatementMeta) {

    const implFn = impl.impl;

    if (
        implFn.type === 'FunctionDeclaration'
        || implFn.type === 'FunctionExpression'
    ) {
        console.log('implObject:Function');

        const body = implFn.body?.body;
        if (
            body?.length === 1
            && body[0]?.type === 'ReturnStatement'
            && body[0].argument?.type === 'ObjectExpression'
        ) {
            return body[0].argument;
        }
    } else if (implFn.type === 'ArrowFunctionExpression') {
        console.log('implObject:ArrowFunction', implFn.body.type);
        if (implFn.body.type === 'ParenthesizedExpression' && implFn.body.expression.type === 'ObjectExpression') {
            return implFn.body.expression;
        } else if (implFn.body.type === 'BlockStatement') {
            const body = implFn.body.body;
            if (
                body.length === 1
                && body[0]?.type === 'ReturnStatement'
                && body[0].argument?.type === 'ObjectExpression'
            ) {
                return body[0].argument;
            }
        }
    }


    // switch (implFn.type) {
    //     case 'FunctionDeclaration':

    //         break;
    //     case 'FunctionExpression':
    //         body = implFn.body?.body;
    //         if (
    //             body?.length === 1
    //             && body[0]?.type === 'ReturnStatement'
    //             && body[0].argument?.type === 'ObjectExpression'
    //         ) {
    //             implObject = body[0].argument;
    //         }
    //         break;

    //     case 'ArrowFunctionExpression':


    //         break;
    //     default:
    //         break;
    // }
}

// returns the flags for a given type
function parseType(typeArguments: TypeArguments['params'], code: string, types: DeclarationRegistry<TypeDeclaration>): Flags<true> | TraitError[] {
    if (!typeArguments.length) {
        return [TraitError.EmptyTraitTypeArguments()];
    } else if (typeArguments.length > 2) {
        return [TraitError.InvalidTraitTypeArgument()];
    }

    const typeDeclaration = null

    if (typeArguments.length === 1) {
        const typeArgument = typeArguments[0];
        if (!typeArgument) {
            return [TraitError.EmptyTraitTypeArguments()];
        }

        if (typeArgument.type !== 'TSTypeLiteral' && typeArgument.type !== 'TSTypeReference') {
            return [TraitError.InvalidTraitTypeArgument()];
        }

        return Flags.tryFromType(types as any, code, typeArgument);
    } else {
        return Flags.tryFromType(types as any, code, typeArguments[0]);
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

function getDerives(
    project: Project,
    file: TraitFile<FileRegistry>,
    derives: (TSTypeReference | TSTypeQuery)[],
) {
    const errors: TraitError[] = [];
    const queuedDerives: TraitDefinition[] = [];
    const path = file.path;

    for (let i = 0; i < derives.length; i++) {
        const element = derives[i]!;
        let lookupName;
        if (element.type === 'TSTypeReference' && element.typeName.type === 'Identifier') {
            lookupName = element.typeName.name;

        } else if (element.type === 'TSTypeQuery' && element.exprName.type === 'Identifier') {
            lookupName = element.exprName.name;
        }
        console.log('LOOKUP NAME:', lookupName);

        if (!lookupName) {

            break;
        }

        const derive = project.resolveTrait(file, lookupName);

        if (derive) {
            queuedDerives.push(derive);
        } else {
            errors.push(TraitError.RefNotFound(path, lookupName));
            break;
        }
    }

    console.log('GET DERIVES: ', derives.length, queuedDerives.length);


    if (derives.length !== queuedDerives.length) {
        errors.push(TraitError.InvalidDeriveType());
        return { valid: false, errors: errors } as const;
    }

    return { valid: true, derives: queuedDerives } as const;
}


const ambiguousFixMessage = `Fix: convert to\n    \`as<Trait>(this).propertyName\`
or  \`(this as Trait).propertyName\`
to resolve ambiguities`;

function checkMethods(
    file: TraitFile<FileRegistry>,
    definition: TraitDefinition,
    properties: Record<string, ObjectProperty>,
    errors: string[]
) {
    const propsWithRefs: Record<string, CheckMethodResult> = {}
    for (const propertyName in properties) {
        const method = properties[propertyName]!.value;

        if (method.type !== 'FunctionExpression') {
            continue;
        }

        if (!method.body) {
            //! error: default methods must have a body
            errors.push(`expected default method \`${propertyName}\` to have an implementation`)
            continue;
        }

        const scope = file.scope(method);
        // ! exclude globals such as console, require
        const result = checkMethod(file.registry, definition, scope!, method);

        if (result.ambiguousCallSites.length || result.improperCasts.length) {
            definition.invalidate();

            const ambiguousCallSites = result.ambiguousCallSites;
            const names = Array.from(new Set(ambiguousCallSites.map(acs => acs.identName)));
            const messages = names.map(name => {
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
                return `    ${name}    (defined in ${names.join(', ')} ) `
            });


            let message = `[ ${definition.name}.${propertyName} ] has ${ambiguousCallSites.length} ambiguous property access${ambiguousCallSites.length > 1 ? `es` : ''}:
            ${messages}\n${ambiguousFixMessage}`;
            errors.push(message);

            errors.push(...result.improperCasts)
        } else {

            if (result.exportRefs.length || Object.keys(result.importRefs).length) {
                console.log('REFERENCES: ', definition.name, Object.fromEntries(Object.entries(result.importRefs).map(([k, v]) => [k, createFilteredExportOrImportNames(v)])), createFilteredExportOrImportNames(result.exportRefs));
            }

            propsWithRefs[propertyName] = result;
        }

    }

    return propsWithRefs;
}

function checkMethodsGetRefs(file: TraitFile<FileRegistry>, definition: TraitDefinition, staticProps: Record<string, ObjectProperty>, instanceProps: Record<string, TraitObjectProperty>) {

    const errors: string[] = [];

    const staticRefs = checkMethods(file, definition, staticProps, errors);
    const instanceRefs = checkMethods(file, definition, instanceProps, errors);

    return errors.length ? errors : { static: staticRefs, instance: instanceRefs }
}

function checkMethod(
    registry: FileRegistry,
    definition: TraitDefinition,
    scope: Scope,
    method: Function
): CheckMethodResult {
    const ambiguousCallSites: { start: number; end: number; identName: string }[] = [];
    const improperCasts: string[] = []
    // ! exclude globals such as console, require
    const bodyReferences = scope?.through.filter(
        r => registry.has(r.identifier.name)).map(
            r => registry.get(r.identifier.name)!);

    const paramReferences: Reference[] = [];
    const returnReferences: Reference[] = [];
    const importRefs: Record<string, Reference[]> = {};
    const exportRefs: Reference[] = [];


    //! SAFETY: method body has been checked to be non-null

    checkAmbiguities(definition, method, ambiguousCallSites, improperCasts);



    if (ambiguousCallSites.length || improperCasts.length) {
        return {
            importRefs: importRefs,
            exportRefs: exportRefs,
            improperCasts,
            ambiguousCallSites
        }
    }

    // add references

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

    const references = paramReferences.concat(bodyReferences ?? []).concat(returnReferences);

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
        improperCasts,
        ambiguousCallSites
    };
}

function checkCast(definition: TraitDefinition, node: TSType, improperCasts: string[]) {
    let targetName: string | null = null;
    if (
        node.type === 'TSTypeReference'
        && node.typeName.type === 'Identifier'
    ) {
        targetName = node.typeName.name;
    } else if (
        node.type === 'TSTypeQuery'
        && node.exprName.type === 'Identifier'
    ) {
        targetName = node.exprName.name;
    }
    if (targetName != null) {
        const targetTrait = definition.derive(targetName);

        if (!targetTrait) {
            improperCasts.push(`CastError: trait ${definition.name} does not implement ${targetName}`)
        }

    }

}

function checkAmbiguities(definition: TraitDefinition, method: Function, ambiguousCallSites: AmbiguousCallSite[], improperCasts: string[]) {
    walk(method.body!, {
        enter(node, parent) {
            //* skip looking for `this` references in scopes that are not `trait.methodName` 
            if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
                this.skip();
            }

            // if (
            //     node.type === 'CallExpression'
            //     && node.callee.type === 'MemberExpression'
            //     && node.callee.object.type === 'CallExpression'
            //     && node.callee.object.callee.type === 'Identifier'
            //     && node.callee.object.callee.name === 'as'
            //     && node.callee.object.typeArguments
            //     && node.callee.object.typeArguments.params.length === 1
            // ) {
            //     console.log('(b) Checking cast', node.start, node.end);

            //     // as().prop();
            //     checkCast(definition, node.callee.object.typeArguments.params[0]!, improperCasts);

            // } else
            if (
                node.type === 'MemberExpression'
                && node.object.type === 'CallExpression'
                && node.object.callee.type === 'Identifier'
                && node.object.callee.name === 'as'
                && node.object.typeArguments
                && node.object.typeArguments.params.length === 1

            ) {
                // as().prop;
                checkCast(definition, node.object.typeArguments.params[0]!, improperCasts);
            }
            // check for any ambiguous calls
            if (node.type === 'ThisExpression' &&
                (parent
                    && parent.type === 'MemberExpression'
                    && parent.property.type === 'Identifier'
                )
            ) {
                const identName = parent.property.name;
                const f = definition.flags.getFlags(identName);
                if (f && f.flags.length > 1) {
                    ambiguousCallSites.push({ start: parent.start, end: parent.end, identName: identName });
                }
            }
        },
    });

}