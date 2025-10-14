import { Visitor, visitorKeys, type Function, type IdentifierName, type IdentifierReference, type Node, type ObjectProperty, type ObjectPropertyKind, type TSTypeQuery, type TSTypeReference } from "oxc-parser";
import { ResolverFactory, type NapiResolveOptions } from "oxc-resolver";
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pc from 'picocolors';
import { checkParseResult, resolve } from "./resolver";
import { isDeclaredInModule, type TraitAliasDeclaration, type TypeArguments, typeDeclarationSignatures, type TraitObjectProperty, type TraitCallExpression } from "./node";
import type { ParsedTraitConfigExport } from "../config";
import { DEFAULT, Flags, REQUIRED } from "./flags";
import { TraitDefinition } from "./definition";
import { TraitFile, type DeclarationRegistry } from "./file";
import { Registry, type ImportRegistry, type Import, type FileRegistry } from "./file/registry";
import { getCode, print, timestamp } from "./helpers";
import { Stack, type VisitFn } from "./stack";
import { TraitError } from "./error";
import { walk } from "oxc-walker";
import { analyze } from "eslint-scope";

export type ProjectOptions = {
    cwd: string,
    resolverOptions?: NapiResolveOptions,
    verbose?: boolean;
};



let VERBOSE = false;

const TRAIT_FN_NAME = 'trait';
// const TRAIT_TYPE_NAME = 'Trait';

export class Project {
    #cwd: string;
    #resolver: ResolverFactory;
    #files: TraitFile[];
    #ids: Record<string, number>;

    #traitFileNameFilter!: string;
    #indexFileNameFilter!: string;

    constructor(options: ProjectOptions) {
        const { cwd } = options;
        const resolverOptions = options.resolverOptions ??= Object.create(null) as NapiResolveOptions;
        resolverOptions.preferAbsolute = true;
        resolverOptions.extensions = Array.from(new Set(resolverOptions.extensions ?? []).union(new Set(['.ts'])))


        VERBOSE = options.verbose ?? false;

        if (VERBOSE) {
            print('Project', `cwd = ${cwd}`);
        }

        this.#resolver = new ResolverFactory(resolverOptions);
        this.#files = [];
        this.#ids = {};
        this.#cwd = cwd;
    }

    get cwd() {
        return this.#cwd;
    }

    get resolver() {
        return this.#resolver;
    }

    get indexFilter() {
        return this.#indexFileNameFilter;
    }

    get traitFileFilter() {
        return this.#traitFileNameFilter;
    }

    async createStack() {
        const then = performance.now();
        const { traits, traitFileNameFilter, indexFileNameFilter } = await this.#getEntry();

        this.#indexFileNameFilter = indexFileNameFilter;
        this.#traitFileNameFilter = traitFileNameFilter;

        const resolver = this.#resolver;
        const result = await resolve(resolver, traits, indexFileNameFilter);
        checkParseResult(result, traits);

        if (result.packageJson) {
            const json = await Bun.file(result.packageJson).json() as Record<string, any>;
            if ('traits-js' in json.devDependencies) {
                // const modifierPath = resolver.sync(this.#cwd, 'traits-js/modifier');
                // console.log(modifierPath.path);
            }
        }

        const s = new Stack<TraitFile>(result.path, new TraitFile(result, Registry.Index()));
        timestamp('resolve-entry', then);
        return s;
    }

    // loadDependencies(packageJson: string) {

    // }

    async addSourceFiles(stack: Stack<TraitFile>) {
        const self = this,
            files = self.#files,
            visit = createVisitFn(self.#resolver, files, self.#ids, self.#indexFileNameFilter);

        let then = performance.now();
        await Stack.dfs(stack, visit);

        console.log(timestamp('register', then));
        then = performance.now();
        for (let i = 0; i < files.length; i++) {
            const traits: Record<string, TraitDefinition> = {};
            const errors: Record<string, TraitError[]> = {};
            const file = files[i]!;
            const { vars, tracker } = collectBindings(file, traits, errors);
            file.addBindings(tracker, vars, traits);
            // TODO: only parse if errors.length === 0
            parseDerives(self, file);
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i]!;
            const traits = file.traits;
            for (const traitName in traits) {
                const trait = traits[traitName]!;
                parseDefinitionImplementation(file, trait)
            }

        }

        console.log(timestamp('initialize', then));

    }

    get(path: string): TraitFile | undefined {
        const index = this.#ids[path];
        return index == null ? void 0 : this.#files[index];
    }

    resolveImportReference(project: Project, importVar: Import, directory: string, localName: string) {
        const resolver = project.resolver;
        const resolvedRequest = resolver.sync(dirname(directory), importVar.moduleRequest);
        if (resolvedRequest.path) {
            // console.log('FOUND TRAIT FILE:', resolvedRequest.path);
            if (resolvedRequest.path.startsWith(project.#cwd)) {

                const previous = project.get(resolvedRequest.path);
                if (previous) {
                    const resolvedName = importVar.localToImport[localName]!;
                    if (resolvedName) {
                        return previous.trait(resolvedName);
                    }
                }
            } else {
                // TODO: node_module:
                // * if unparsed:
                // * 1. check directory of package.json for {trait,traits}.json or {trait,traits}.data.json
                // * 2. parse and if successful, add to cache for future lookups
            }
        }
    }

    async #getEntry() {
        const entryOrError = await parseConfig(this.#cwd);
        if (typeof entryOrError === 'string') {
            console.log(entryOrError);
            process.exit(1);
        }
        return entryOrError;
    }
}

function getDerives(
    project: Project,
    importTypes: ImportRegistry,
    importVars: ImportRegistry,
    traits: ReadOnlyDict<TraitDefinition>,
    derives: (TSTypeReference | TSTypeQuery)[],
    path: string
) {

    const errors: TraitError[] = [];
    const queuedDerives: TraitDefinition[] = [];

    for (let i = 0; i < derives.length; i++) {
        const element = derives[i]!;
        let lookupName;
        if (element.type === 'TSTypeReference' && element.typeName.type === 'Identifier') {
            lookupName = element.typeName.name;

        } else if (element.type === 'TSTypeQuery' && element.exprName.type === 'Identifier') {
            lookupName = element.exprName.name;
        }

        if (!lookupName) {
            continue;
        }

        if (traits[lookupName]) {
            const t = traits[lookupName]!;
            queuedDerives.push(t);
        } else if (importVars[lookupName]) {
            const actual = project.resolveImportReference(project, importVars[lookupName]!, path, lookupName);
            if (actual && actual.valid) {
                queuedDerives.push(actual);
            } else {
                errors.push(TraitError.RefNotFound(path, lookupName));
                break;
            }
        } else if (lookupName in importTypes) {
            console.log('Project.getDerives - TODO: resolve type');

        } else {
            errors.push(TraitError.RefNotFound(path, lookupName))
            break;
        }
    }

    if (derives.length !== queuedDerives.length) {
        errors.push(TraitError.InvalidDeriveType());
        return { valid: false, errors: errors } as const;
    }

    return { valid: true, derives: queuedDerives } as const;
}

function collectBindings(
    file: TraitFile,
    traits: Record<string, TraitDefinition>,
    errors: Record<string, TraitError[]>
) {
    const { exportTypes, exportVars } = file.registry as FileRegistry;
    const ast = file.ast;
    const path = file.path;
    const types: DeclarationRegistry<TraitAliasDeclaration> = {},
        vars: DeclarationRegistry = {};

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
                    // && node.kind === 'const'
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

    })


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
                traits[varName] = new TraitDefinition(call_expr as TraitCallExpression, varName, path, start, end, false);
                continue;
            }
            const base = parseType(call_expr.typeArguments.params as TypeArguments['params'], file.code, types);
            if (Array.isArray(base)) {
                definition_errors.push(...base);
                // console.log('error: failed parsing base type for ', varName, base.map(e => e.message));
                traits[varName] = new TraitDefinition(call_expr, varName, path, start, end, false)
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

    return { tracker, vars };
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
        return flagsFor(types, code, typeArgument);
    } else {
        return flagsFor(types, code, typeArguments[0]);
    }

}

function parseDerives(project: Project, { traits, registry, path }: TraitFile) {
    const { importTypes, importVars } = registry as FileRegistry;

    const errors: Record<string, TraitError[]> = {};
    for (const traitName in traits) {
        const def = traits[traitName]!;

        const uninitDerives = def.uninitializedDerives;

        if (!uninitDerives.length) {
            console.log('trait = ', traitName);

            continue
        }

        if (!uninitDerives.every(t => t.type === 'TSTypeReference' || t.type === 'TSTypeQuery')) {
            errors[traitName] = [TraitError.InvalidDeriveType()];
            continue;
        }

        const derives = getDerives(
            project,
            importTypes,
            importVars,
            traits,
            uninitDerives,
            path
        );

        if (derives.valid) {
            console.log('trait = %s', def.valid, traitName, derives.derives.map(d => d.name));
            def.join(derives.derives);
        } else {
            console.log('[fail]: %s ', traitName);
            def.invalidate();
        }

    }
}

function parseDefinitionImplementation(file: TraitFile, definition: TraitDefinition) {
    const flags = definition.flags,
        properties = definition.properties,
        tracker = file.tracker,
        code = file.code;

    const staticDefaults: Record<string, TraitObjectProperty> = {};
    const instanceDefaults: Record<string, TraitObjectProperty> = {};

    const unknownStatic: ObjectProperty[] = [];
    const unknownInstance: Array<{
        type: 'SpreadAssigment' | 'KeyNeIdentifier' | 'DefinesRequired';
        start: number;
        end: number
    }> = [];

    const err_requiredStaticNames: string[] = [];
    const err_requiredInstanceNames: string[] = [];

    for (let i = 0; i < properties.length; i++) {
        const property = properties[i]!;
        const propertyName = property.key.name;

        if (property.value.type === 'FunctionExpression') {
            if (flags.has(propertyName, REQUIRED, true)) {
                err_requiredStaticNames.push(propertyName);
                continue
            } else if (flags.has(propertyName, DEFAULT, true)) {
                staticDefaults[propertyName] = property;
            } else {
                unknownStatic.push(property);
            }

        } else if (propertyName === 'instance' && property.value.type === 'ObjectExpression') {
            const instanceProperties = property.value.properties;
            parseInstanceProperties(instanceDefaults, instanceProperties, definition, unknownInstance, err_requiredInstanceNames);

        } else {
            unknownStatic.push(property);
        }
    }

    if (
        unknownStatic.length
        || unknownInstance.length
        || err_requiredInstanceNames.length
        || err_requiredStaticNames.length
    ) {
        return;
    }

    const addTypeRef = (node: Node, references: Node[]) => {
        if (node.type === 'TSTypeReference' && node.typeName.type === 'Identifier' && file.hasType(node.typeName.name)) {
            console.log('TYPE REF: ', node.typeName.name);
            references.push(node.typeName)
        } else if (node.type === 'TSTypeQuery' && node.exprName.type === 'Identifier' && file.hasType(node.exprName.name)) {
            console.log('TYPE QUERY: ', node.exprName.name);
            references.push(node.exprName);
        }
    }


    for (const staticName in staticDefaults) {
        const prop = staticDefaults[staticName]!;
        const method = prop.value as Function;
        if (!method.body) {
            //! error: default methods must have a body
            continue;
        }

        const ambiguousCallSites: { parent: Node; node: Node; identName: string }[] = [];

        const scope = tracker.acquire(method as any);
        // ! exclude globals such as console, require
        const bodyReferences = scope?.through.filter(t => file.has(t.identifier.name));
        const paramReferences: IdentifierName[] = [];
        const returnReferences: IdentifierName[] = [];


        for (const param of method.params) {
            walk(param, {
                enter(node) {
                    addTypeRef(node, paramReferences);
                },
            });
        }

        if (method.returnType) {
            walk(method.returnType, {
                enter(node) {
                    addTypeRef(node, returnReferences)
                },
            });
        }

        // TODO: parseDefinitionImplementation only looks for calls to traits
        walk(method.body, {
            enter(node, parent) {
                //* skip looking for `this` references in scopes that are not `trait.methodName` 
                if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
                    this.skip();
                }

                if (parent && node.type === 'ThisExpression') {
                    // console.log('ThisExpression: ', code.slice(parent.start, parent.end));

                    if (parent.type === 'MemberExpression') {
                        if (parent.property.type === 'Identifier') {
                            const identName = parent.property.name;
                            const f = definition.flags.getFlags(identName);
                            if (f && f?.length > 1) {
                                const obj = parent.object;
                                // TODO: check if cast is to a trait
                                // TODO: check if casted trait has a method with the proper call signature
                                if (obj.type === 'TSAsExpression') {
                                } else if (obj.type === 'CallExpression') {

                                } else {
                                    ambiguousCallSites.push({ parent: parent, node: node, identName: identName });
                                    // console.log(`${definition.name} - ${identName} has ${f.length} ambiguous call sites`);
                                }


                            }
                            // console.log('ident', getCode(code, parent.start, parent.end), f);
                        }
                    } else if (parent.type === 'CallExpression') {
                        // TODO: check if parent is a call to `as`
                    }
                    // console.log(parent.type, );
                    // }
                }
            },
        });

        console.log('References for method body %s ', prop.key.name, bodyReferences?.map(r => r.identifier.name));
        console.log('References for method params %s ', prop.key.name, paramReferences?.map(r => r.name));
        // console.log('References for method return type %s ', prop.key.name, returnReferences?.map(r => r.name));

        if (ambiguousCallSites.length) {
            const names = Array.from(new Set(ambiguousCallSites.map(acs => acs.identName)))
            console.error(`[${definition.name}.${staticName}] has ${ambiguousCallSites.length} ambiguous calls: ${names}`);
            for (const callSite of ambiguousCallSites) {
                console.log('"%s" %O', getCode(code, callSite.parent.start, callSite.parent.end), [callSite.parent.start, callSite.parent.end]);
            }
            console.log(`use \`as<Trait>(this).propertyName\`\nor \`(this as Trait).propertyName\`\nto resolve ambiguities`);

        }
    }
}

function parseInstanceProperties(
    instanceDefaults: Record<string, TraitObjectProperty>,
    properties: ObjectPropertyKind[],
    definition: TraitDefinition,
    unknownInstance: { type: string; start: number; end: number, name?: string }[],
    err_requiredInstanceNames: string[]
) {
    const flags = definition.flags;

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

        if (flags.has(key.name, REQUIRED, false)) {
            err_requiredInstanceNames.push(key.name);
        } else if (flags.has(key.name, DEFAULT, false)) {
            instanceDefaults[key.name] = instanceProperty as TraitObjectProperty;
        } else {
            unknownInstance.push({ type: 'NotRegisteredInTrait', start: instanceProperty.start, end: instanceProperty.end, name: key.name });
        }
    }
}

function createVisitFn(resolver: ResolverFactory, files: TraitFile[], ids: Record<string, number>, indexFilter: string): VisitFn<TraitFile, string> {
    return async (file, visited, queue) => {
        console.log('visit: ', file.path);

        const id = files.length;
        files.push(file);
        ids[file.path] = id;

        const directory = file.directory,
            registry = file.registry;

        if (registry.type === 'index') {
            const reExportTypes = registry.types;
            const reExportVars = registry.vars;
            const staticExports = file.module.staticExports;
            for (let i = staticExports.length - 1; i >= 0; i--) {
                const entries = staticExports[i]?.entries!;
                for (let j = 0; j < entries.length; j++) {
                    const entry = entries[j]!;
                    // if entry has module request, it is not a local export
                    // e.g "export const someVar = someValue"
                    // TODO: error if re-exports are not inside traits dir
                    if (entry.moduleRequest) {
                        const moduleRequest = entry.moduleRequest;
                        const request = moduleRequest.value;
                        const r = entry.isType ? reExportTypes : reExportVars;
                        const resolveResult = resolver.sync(directory, request);
                        const absolutePath = resolveResult.path;

                        if (!r[request]) {
                            r[request] = {
                                type: 're-export',
                                moduleRequest: moduleRequest.value,
                                entries: [],
                            };
                        }
                        r[request]!.entries.push(entry);

                        if (absolutePath && !visited.has(absolutePath)) {
                            const newParseResult = await resolve(resolver, absolutePath, indexFilter);
                            checkParseResult(newParseResult, absolutePath);
                            const isIndex = newParseResult.path.endsWith(indexFilter);
                            queue(newParseResult.path, new TraitFile(
                                newParseResult,
                                isIndex ? Registry.Index() : Registry.File()
                            ));
                        }

                    } else {
                        //    Error: local definition are not allowed in index files
                    }
                }
            }
        } else {
            const staticImports = file.module.staticImports;
            const staticExports = file.module.staticExports;

            const importTypes = registry.importTypes;
            const importVars = registry.importVars;

            const exportTypes = registry.exportTypes;
            const exportVars = registry.exportVars;

            for (let index = 0; index < staticImports.length; index++) {
                const staticImport = staticImports[index]!;
                const entries = staticImport.entries;
                const localToImport = Object.fromEntries(entries.map(e => [e.localName.value, e.importName.name]));
                for (let j = 0; j < entries.length; j++) {
                    const e = entries[j]!;
                    const r = e.isType ? importTypes : importVars;
                    const local = e.localName;
                    r[local.value] = {
                        type: e.importName.kind,
                        localToImport: localToImport,
                        moduleRequest: staticImport.moduleRequest.value
                    };
                }
            }

            for (let i = staticExports.length - 1; i >= 0; i--) {
                const entries = staticExports[i]?.entries!;
                for (let j = 0; j < entries.length; j++) {
                    const entry = entries[j]!;
                    // if entry has module request, it is not a local export
                    // e.g "export const someVar = someValue"
                    if (entry.moduleRequest) {
                        // Error: re-exports from a trait file is not allowed
                    } else {
                        const bindingName = entry.exportName.name;
                        // can only be a local if not in imports
                        if (bindingName && !(bindingName in (entry.isType ? importTypes : importVars))) {
                            // locals adds every code string
                            if (entry.isType) {
                                exportTypes[bindingName] = entry;
                            } else {
                                exportVars[bindingName] = entry;
                            }
                        }
                    }
                }
            }
        }
    }
}

function flagsFor(types: DeclarationRegistry<TraitAliasDeclaration>, code: string, typeArgument: Node): Flags<true> | TraitError[] {
    if (typeArgument.type === 'TSTypeLiteral') {
        const flags = Flags.fromSignatures(typeDeclarationSignatures(typeArgument)!);
        return flags instanceof Flags ? flags : flags.errors;
    } else if (typeArgument.type === 'TSTypeReference') {
        if (typeArgument.typeName.type !== 'Identifier') {
            return [TraitError.IdentifierNeLiteral(typeArgument, code)];
        } else {
            const typeDeclaration = types[typeArgument.typeName.name]?.node;
            if (
                // e.g trait<Foo>
                // this type is a reference for the trait type alias declaration,
                // so we can retrieve it and parse it directly
                typeDeclaration?.typeAnnotation.type === 'TSTypeLiteral'
            ) {
                const flags = Flags.fromSignatures(typeDeclarationSignatures(typeDeclaration)!);
                // console.log('parse_base (reference to literal): ', `${flags instanceof Flags ? `${flags.get(STATIC)} + ${flags.get(INSTANCE)}` : ''}`);
                return !(flags instanceof Flags) ? [TraitError.CannotConstructFlags()] : flags;
            } else {
                return [TraitError.CannotConstructFlags()];
                // TODO: parse 
                // const flags = self.#parseTraitTypeArgumentReference(project, self, traitName, self.#types, typeArgument, typeDeclaration);
                // return flags ?? [TraitError.CannotConstructFlags()];
            }
        }
    } else {
        return [TraitError.CannotConstructFlags()];
    }
}

async function parseConfig(cwd: string): Promise<ParsedTraitConfigExport | string> {
    const NAMES = [
        'traits.config.ts',
        'traits.config.js',
        'trait.config.ts',
        'trait.config.js'
    ];

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

    let path;

    for (let i = 0; i < NAMES.length; i++) {
        const p = join(cwd, NAMES[i]!);
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
    const parsed: Partial<ParsedTraitConfigExport> = {
        cwd: cwd,
    };

    let errors = '';
    if (config) {
        if (typeof config === 'object') {

            parsed.indexFileNameFilter = 'indexFileNameFilter' in config && typeof config.indexFileNameFilter === 'string' ?
                config.indexFileNameFilter :
                'index.ts';

            parsed.traitFileNameFilter = 'traitFileNameFilter' in config && typeof config.traitFileNameFilter === 'string' ?
                config.traitFileNameFilter :
                '.trait.ts';

            if ('traits' in config) {
                if (typeof config.traits === 'string') {
                    const path = join(cwd, config.traits);
                    if (existsSync(path)) {
                        parsed.traits = path;
                        return parsed as ParsedTraitConfigExport;
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
        return parsed as ParsedTraitConfigExport;
    }

}
