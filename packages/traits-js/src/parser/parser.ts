import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { Scope } from 'eslint-scope';
import { type Function, type ObjectProperty, type ObjectPropertyKind, type TSTypeQuery, type TSTypeReference } from "oxc-parser";
import { walk } from "oxc-walker";
import { TraitDefinition } from "./storage";
import type { DeclarationRegistry, FileRegistry, Reference } from "./storage/registry";
import { TraitError } from "./errors";
import { type TraitAliasDeclaration, type TraitCallExpression, type TraitDeclaration, type TraitObjectProperty, type TypeArguments } from "./node";
import { CONFIG_NAMES, DEFAULT_INDEX_FILTER, DEFAULT_TRAIT_FILTER, TRAIT_FN_NAME } from "./constants";
import { DEFAULT, Flags, REQUIRED } from "./storage/flags";
import { addTypeRef, createFilteredExportOrImportNames } from "./helpers";
import type { TraitFile } from "./storage/trait-file";
import type { Project } from "./project";
import type { TraitConfig } from "../lib/config";

type AmbiguousCallSite = { identName: string; start: number; end: number };

export type CheckMethodResult = {
    readonly importRefs: Record<string, Reference[]>;
    readonly exportRefs: Reference[];
    readonly ambiguousCallSites: AmbiguousCallSite[];
}

const configErrorMessage = (type: string, path: string, message: string) => `${pc.red(`ConfigError - ${type}:`)}\n${formatPath(path)}${message}\n`;

function formatPath(path: string, useFileName?: boolean) {
    if (useFileName) {
        let index = path.length - 1;
        while (index > 0) {
            const char = path.at(index)!;
            if (char === '/' || char === '\\') {
                index += 1;
                break;
            }
            index -= 1;
        }

        path = path.slice(index);
    }

    return `[ ${path} ]`;
}

export async function parseConfig(cwd: string): Promise<Required<TraitConfig> | string> {
    let path;

    for (let i = 0; i < CONFIG_NAMES.length; i++) {
        const p = join(cwd, CONFIG_NAMES[i]!);
        if (existsSync(p)) {
            path = p;
            break;
        }
    }

    if (!path) {
        return configErrorMessage('NoConfigFile', cwd, '\ndirectory has no {trait,traits}.config.{ts,js} file');
    }

    const module = await import(path);
    const config = module.default as unknown;
    const parsed: Partial<TraitConfig> = {
        cwd: cwd,
    };

    let errors = '';
    if (config) {
        if (typeof config === 'object') {
            parsed.indexFileNameFilter = 'indexFileNameFilter' in config && typeof config.indexFileNameFilter === 'string' ?
                config.indexFileNameFilter :
                DEFAULT_INDEX_FILTER;

            parsed.traitFileNameFilter = 'traitFileNameFilter' in config && typeof config.traitFileNameFilter === 'string' ?
                config.traitFileNameFilter :
                DEFAULT_TRAIT_FILTER;

            if ('traits' in config) {
                if (typeof config.traits === 'string') {
                    const path = join(cwd, config.traits);
                    if (existsSync(path)) {
                        parsed.traits = path;
                        return parsed as Required<TraitConfig>;
                    } else {
                        errors += configErrorMessage('FileNotFound', path, `\n${pc.yellow('...has a trait entry path')} ${formatPath(path)}\n${pc.yellow('...but no file exists at that path.')}`);
                    }
                } else {
                    errors += configErrorMessage('TraitsFieldTypeNotEqualString', path, `\n${pc.yellow('...')}expected typeof config.traits to equal "string", but was "${typeof config.traits}"`);
                }

            } else {
                errors += configErrorMessage('NoTraitsField', path, '\n...expected config.traits field to exist');
            }

        } else {
            errors += configErrorMessage('DefaultExportInvalidType', path, `\n...expected default export to be type "object", but was ${typeof config}`);
        }
    } else {
        errors += configErrorMessage('NoDefaultExport', path, '\n...expected a default export.');
    }

    if (errors.length) {
        return errors
    } else {
        return parsed as Required<TraitConfig>;
    }

}

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

export function parseImpls(file: TraitFile<FileRegistry>) {
    const traits: Record<string, TraitDefinition> = {},
        errors: Record<string, TraitError[]> = {};
    const { path, registry: { types, vars } } = file;
    let errored = false;

    for (const varName in vars) {
        const { node: declaration, start, end } = vars[varName]!;

        if (declaration.type === 'ClassDeclaration') {
            // check if this class has an impl call in the static block

            const elements = declaration.body.body;
            for (const element of elements) {
                if (element.type === 'StaticBlock') {
                    for (const statement of element.body) {
                        // TODO: remove hard code here
                        if (
                            statement.type === 'ExpressionStatement'
                            && statement.expression.type === 'CallExpression'
                            && statement.expression.callee.type === 'Identifier'
                            && statement.expression.callee.name === 'impl'
                        ) {
                            const call_expr = statement.expression;
                            const args = call_expr.arguments;
                            const type_args = call_expr.typeArguments;

                            if (!type_args || type_args.params.length !== 2) {
                                // error: impl TypeArgs should have trait and class
                                break;
                            }
                        }
                    }
                }
            }

        }
    }

    return {
        traits,
        errors,
        errored
    }

}

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

    const dependencies = getRefsInMethod(file, definition, deps.staticProps, deps.instanceProps);
    if (Array.isArray(dependencies)) {
        for (const message of dependencies) {
            console.log(message);

        }
        return;
    }

    definition.initialize(dependencies);
}


function parseType(typeArguments: TypeArguments['params'], code: string, types: DeclarationRegistry<TraitAliasDeclaration>): Flags<true> | TraitError[] {
    if (!typeArguments.length) {
        return [TraitError.EmptyTraitTypeArguments()];
    } else if (typeArguments.length > 2) {
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
    const { path } = file;
    for (let i = 0; i < derives.length; i++) {
        const element = derives[i]!;
        let lookupName;
        if (element.type === 'TSTypeReference' && element.typeName.type === 'Identifier') {
            lookupName = element.typeName.name;

        } else if (element.type === 'TSTypeQuery' && element.exprName.type === 'Identifier') {
            lookupName = element.exprName.name;
        }

        if (!lookupName) {
            break;
        }

        const derive = project.findTrait(file, lookupName);

        if (derive) {
            queuedDerives.push(derive);
        } else {
            errors.push(TraitError.RefNotFound(path, lookupName));
            break;
        }
    }

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
        const references = checkMethod(file.registry, definition, scope!, method);

        if (references.ambiguousCallSites.length) {
            definition.invalidate();
            const ambiguousCallSites = references.ambiguousCallSites;


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

            let message = `[ ${definition.name}.${propertyName} ] has ${ambiguousCallSites.length} ambiguous property access${ambiguousCallSites.length > 1 ? `(es)` : ''}:
            ${messages}\n${ambiguousFixMessage}`;
            errors.push(message);
        } else {

            if (references.exportRefs.length || Object.keys(references.importRefs).length) {
                console.log('REFERENCES: ', definition.name, Object.fromEntries(Object.entries(references.importRefs).map(([k, v]) => [k, createFilteredExportOrImportNames(v)])), createFilteredExportOrImportNames(references.exportRefs));
            }

            propsWithRefs[propertyName] = references;
        }

    }

    return propsWithRefs;
}

function getRefsInMethod(file: TraitFile<FileRegistry>, definition: TraitDefinition, staticProps: Record<string, ObjectProperty>, instanceProps: Record<string, TraitObjectProperty>) {

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
    // ! exclude globals such as console, require
    const bodyReferences = scope?.through.filter(
        r => registry.has(r.identifier.name)).map(
            r => registry.get(r.identifier.name)!);

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

    checkAmbiguities(definition, method, ambiguousCallSites);


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

function checkAmbiguities(definition: TraitDefinition, method: Function, ambiguousCallSites: AmbiguousCallSite[]) {
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
            }
        },
    });

}