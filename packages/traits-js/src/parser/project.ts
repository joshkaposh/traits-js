import type { ExportNamedDeclaration, Node, TSTupleElement, TSTypeAliasDeclaration, TSTypeLiteral, TSTypeReference } from "oxc-parser";
import { ResolverFactory, type NapiResolveOptions } from "oxc-resolver";
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pc from 'picocolors';
import { checkParseResult, resolve } from "./resolver";
import { isDeclaredInModule, type TraitDeclaration, type TraitAliasDeclaration, type TypeArguments, typeDeclarationSignatures } from "./node";
import type { ParsedTraitConfigExport } from "../config";
import { Flags, type FlagsInterface } from "./flags";
import { TraitDefinition, type TraitDefinitionMeta } from "./definition";
import { TraitFile, type TraitExports, type TraitTypeExports } from "./trait-file";
import { Registry, type ImportRegistry, type Import, type FileRegistry } from "./registry";
import { walk } from "oxc-walker";
import { print, timestamp } from "./helpers";
import { Stack, type VisitFn } from "./stack";
import { TraitError } from "./error";

export type ProjectOptions = {
    cwd: string,
    resolverOptions?: NapiResolveOptions,
    verbose?: boolean;
};



type ResolvedRef = TraitDefinition | { name: string; flags: FlagsInterface };

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
            file.initialize(self, traits, errors);

        }
        console.log(timestamp('initialize', then));

    }

    parseType(typeArguments: TypeArguments['params'], code: string, typeDeclaration: TSTypeAliasDeclaration | undefined): TraitDefinitionMeta
        | TraitError[] {
        if (!typeArguments.length) {
            return [TraitError.EmptyTraitTypeArguments()];
        } else if (typeArguments.length > 2) {
            return [TraitError.InvalidTraitTypeArgument()];
        }

        const flagsFor = (typeArgument: Node) => {
            if (typeArgument.type === 'TSTypeLiteral') {
                const flags = Flags.fromSignatures(typeDeclarationSignatures(typeArgument)!);
                return !(flags instanceof Flags) ? [TraitError.CannotConstructFlags()] : flags;
                // case 'TSTypeReference' 
            } else if (typeArgument.type === 'TSTypeReference') {
                if (typeArgument.typeName.type !== 'Identifier') {
                    return [TraitError.IdentifierNeLiteral(typeArgument, code)];
                } else if (
                    // e.g trait<Foo>
                    // this type is a reference for the trait type alias declaration,
                    // so we can retrieve it and parse it directly
                    typeArgument.typeName.name === typeDeclaration?.id.name
                    && typeDeclaration.typeAnnotation.type === 'TSTypeLiteral'
                ) {
                    const flags = Flags.fromSignatures(typeDeclarationSignatures(typeDeclaration)!);
                    return !(flags instanceof Flags) ? [TraitError.CannotConstructFlags()] : flags;
                } else {
                    return [TraitError.CannotConstructFlags()];
                    // TODO: parse 
                    // const flags = self.#parseTraitTypeArgumentReference(project, self, traitName, self.#types, typeArgument, typeDeclaration);
                    // return flags ?? [TraitError.CannotConstructFlags()];
                }
            } else {
                return [TraitError.CannotConstructFlags()];
            }
        }

        if (typeArguments.length === 1) {
            const typeArgument = typeArguments[0];
            if (!typeArgument) {
                return [TraitError.EmptyTraitTypeArguments()];
            }

            if (typeArgument.type !== 'TSTupleType') {
                const f = flagsFor(typeArgument);
                return f instanceof Flags ? { base: f, derives: [], implementationObject: null } : f;
            } else {
                const tupleTypes = typeArgument.elementTypes;
                if (!tupleTypes.length) {
                    return [TraitError.CannotConstructFlags()];
                } else if (tupleTypes.length === 1 && tupleTypes[0]) {
                    const f = flagsFor(tupleTypes[0]);
                    return f instanceof Flags ? { base: f, derives: [], implementationObject: null } : f;
                } else {
                    const baseType = tupleTypes.at(-1);

                    if (!baseType) {
                        return [TraitError.CannotConstructFlags()];
                    }


                    const f = flagsFor(baseType);
                    return f instanceof Flags ? {
                        base: f,
                        derives: tupleTypes.slice(0, tupleTypes.length - 1),
                        implementationObject: null
                    } : f;
                    // return !baseType ?
                    // [TraitError.CannotConstructFlags()] :
                    // {base: flagsFor(baseType), tupleTypes.slice(0, tupleTypes.length - 1)}
                }
            }
        }

        return [TraitError.CannotConstructFlags()];

    }

    parseDerives(traits: ReadOnlyDict<TraitDefinition>, registry: FileRegistry, path: string) {
        const self = this,
            { importTypes, importVars } = registry;

        const errors: Record<string, TraitError[]> = {};
        for (const traitName in traits) {
            const def = traits[traitName]!;
            const uninitDerives = def.uninitializedDerives;

            if (!uninitDerives.every(t => t.type === 'TSTypeReference')) {
                errors[traitName] = [TraitError.InvalidDeriveType()];
                continue;
            }

            const derives = self.resolveDerives(
                self,
                importTypes,
                importVars,
                traits,
                uninitDerives,
                path
            );

            if (derives.valid) {
                def.join(derives.derives);
                print('parseDerives', `name = ${def.name}`)
                print('parseDerives', `base = ${JSON.stringify(Object.fromEntries(Object.entries(def.flags.byName).map(([k, v]) => [k, Object.keys(v)])), null, 2)}`)
                print('parseDerives', `derives = ${JSON.stringify(Object.fromEntries(Object.entries(def.flags.derivesByName).map(([k, v]) => [k, Object.keys(v)])), null, 2)}`)
            } else {
                console.log('[fail]: %s ', traitName);
                def.invalidate();
            }

        }
    }

    get(path: string): TraitFile | undefined {
        const index = this.#ids[path];
        return index == null ? void 0 : this.#files[index];
    }

    resolveReference(project: Project, file: TraitFile, localTypes: TraitTypeExports, importRegistry: ImportRegistry, lookupName: string): ResolvedRef | undefined {
        const localType = localTypes[lookupName];
        if (localType) {
            const flags = Flags.fromSignatures(localType.typeAnnotation.members);
            if (!(flags instanceof Flags)) {
                return;
            }

            return { name: localType.id.name, flags: flags };
        } else {
            const importVar = importRegistry[lookupName];
            if (importVar) {
                const actual = project.resolveReferenceFromRequest(project, importVar, file.directory, lookupName);
                if (actual) {
                    return actual;
                }
            }
        }
    }

    resolveReferenceFromRequest(project: Project, importVar: Import, directory: string, localName: string) {
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

    resolveDerives(
        project: Project,
        importTypes: ImportRegistry,
        importVars: ImportRegistry,
        traits: ReadOnlyDict<TraitDefinition>,
        derives: TSTypeReference[],
        path: string
    ) {

        const errors: TraitError[] = [];

        if (!derives.every(d => d.type === 'TSTypeReference' && d.typeName.type === 'Identifier')) {
            console.error('CONSTRUCT ERROR CANNOT PROCEED', derives.map(d => [d.type, d.typeName.type]))
            errors.push(TraitError.InvalidDeriveType());
            return { valid: false, errors } as const;
        }

        const queuedDerives: TraitDefinition[] = [];
        for (let i = 0; i < derives.length; i++) {
            const element = derives[i]!;
            if (element.type === 'TSTypeReference' && element.typeName.type === 'Identifier') {
                const lookupName = element.typeName.name;
                if (traits[lookupName]) {
                    const t = traits[lookupName]!;
                    queuedDerives.push(t);
                } else if (importVars[lookupName]) {
                    const actual = project.resolveReferenceFromRequest(project, importVars[lookupName], path, lookupName);
                    if (actual && actual.valid) {
                        queuedDerives.push(actual);
                    } else {
                        errors.push(TraitError.RefNotFound(path, lookupName));
                        break;
                    }
                } else if (lookupName in importTypes) {

                } else {
                    errors.push(TraitError.RefNotFound(path, lookupName))
                    break;
                }
            }
        }

        if (derives.length !== queuedDerives.length) {
            errors.push(TraitError.InvalidDeriveType());
            return { valid: false, errors: errors } as const;
        }

        return { valid: true, derives: queuedDerives } as const;
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
            const staticExports = file.result.module.staticExports;
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
            const staticImports = file.result.module.staticImports;
            const staticExports = file.result.module.staticExports;

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
