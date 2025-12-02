import { type TSTypeQuery, type TSTypeReference } from "oxc-parser";
import { ResolverFactory, type NapiResolveOptions } from "oxc-resolver";
import { dirname } from 'node:path';
import { checkParseResult, resolve } from "./resolve";
import { TraitDefinition } from "./storage";
import { TraitFile } from "./storage/trait-file";
import { Registry, type FileRegistry } from "./storage/registry";
import { print, timestamp } from "./helpers";
import { Stack, type VisitFn } from "./stack";
import { TraitError } from "./errors";
import { parseDefinitionImplementation, parseDerives, parseConfig, parseTraits } from "./parser";
import type { ParseFileResultResult } from "./types";

export type ProjectOptions = {
    cwd: string,
    resolverOptions?: NapiResolveOptions,
    verbose?: boolean;
};

let VERBOSE = false;

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

        console.log('Project root: ', cwd);


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


    // loadDependencies(packageJson: string) {

    // }

    async init() {
        await this.#dfsSourceFiles(await this.#createStackFromProjectEntry());
    }

    file(path: string): TraitFile | undefined {
        const index = this.#ids[path];
        return index == null ? void 0 : this.#files[index];
    }

    /**
     * starting in `file`, searches for the trait that matches `bindingName`.
     * This will follow the file registry's imports / exports to resolve any references not found in this file or project
     * 
     */
    findTrait(file: TraitFile, bindingName: string) {
        const trait = file.trait(bindingName);
        if (trait) {
            return trait;
        }

        if (file.isNeIndex()) {
            return this.#resolveImportedTrait(file, bindingName);
        }
    }

    async #createStackFromProjectEntry() {
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

    async #dfsSourceFiles(stack: Stack<TraitFile>) {
        const self = this,
            files = self.#files,
            then = performance.now();

        await Stack.dfs(stack, createVisitFn(self.#resolver, files, self.#ids, self.#indexFileNameFilter));
        console.log(timestamp('register', then));

        self.#initialize(files);

        // console.log(files.map(f => ({ filePath: f.path, traits: f.totalCount })));

    }

    #initialize(files: TraitFile[]) {
        const project = this;
        const then = performance.now();
        for (let i = 0; i < files.length; i++) {
            const file = files[i]!;
            if (file.isIndex()) {
                continue
            }

            file.init();

            console.log('init: ', file.name);


            const { traits,
                errors,
                errored
            } = parseTraits(file as TraitFile<FileRegistry>);

            file.setTraits(traits);

            if (!errored) {
                parseDerives(project, file as TraitFile<FileRegistry>);
            }
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i]!;
            if (file.isIndex()) {
                continue
            }

            const traits = file.traits();
            for (const trait of traits) {
                if (trait.valid) {
                    parseDefinitionImplementation(file as TraitFile<FileRegistry>, trait);
                }
            }
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i]!;
            if (file.isIndex()) {
                continue
            }

            for (const trait of file.traits()) {
                console.log('%s - %s = ', file.name, trait.name, trait.valid);
            }
        }

        console.log(timestamp('initialize', then));
    }

    #resolveImport(file: TraitFile<FileRegistry>, localName: string) {
        const importVar = file.registry.importVars[localName];
        if (!importVar) {
            return;
        }

        const resolvedRequest = this.resolver.sync(dirname(file.path), importVar.moduleRequest);

        if (resolvedRequest.path) {
            if (resolvedRequest.path.startsWith(this.#cwd)) {
                if (importVar.localToImport != null) {
                    // TODO: use this instead of below
                    return this.file(resolvedRequest.path)?.get(importVar.localToImport)
                }
            } else {
                // TODO: node_module:
                // * if unparsed:
                // * 1. check directory of package.json for {trait,traits}.json or {trait,traits}.data.json
                // * 2. parse and if successful, add to cache for future lookups
            }
        }
    }

    #resolveImportedTrait(file: TraitFile<FileRegistry>, localName: string) {
        const importVar = file.registry.importVars[localName];
        if (!importVar) {
            return;
        }

        const resolvedRequest = this.resolver.sync(dirname(file.path), importVar.moduleRequest);

        if (resolvedRequest.path) {
            if (resolvedRequest.path.startsWith(this.#cwd)) {
                const previous = this.file(resolvedRequest.path);
                if (previous) {
                    const resolvedName = importVar.localToImport;
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


function createVisitFn(
    resolver: ResolverFactory,
    files: TraitFile[],
    ids: Record<string, number>,
    indexFilter: string
): VisitFn<TraitFile, string> {
    return async (file, add) => {
        // console.log('visit: ', file.path);
        const id = files.length;
        files.push(file);
        ids[file.path] = id;

        const directory = file.directory,
            registry = file.registry;

        if (registry.type === 'index') {
            const reExportTypes = registry.types;
            const reExportVars = registry.vars;
            const staticExports = file.exports;
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

                        if (absolutePath) {
                            const newParseResult = await resolve(resolver, absolutePath, indexFilter);
                            checkParseResult(newParseResult, absolutePath);
                            const isIndex = newParseResult.path.endsWith(indexFilter);
                            add(newParseResult.path, new TraitFile(
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
            const { importTypes, importVars, exportTypes, exportVars } = file.registry as FileRegistry,
                staticImports = file.imports,
                staticExports = file.exports;

            for (let index = 0; index < staticImports.length; index++) {
                const { entries, moduleRequest } = staticImports[index]!;
                // const localToImport = Object.fromEntries(entries.map(e => [e.localName.value, e.importName.name]));
                for (let j = 0; j < entries.length; j++) {
                    const e = entries[j]!;
                    const r = e.isType ? importTypes : importVars;
                    const local = e.localName;
                    r[local.value] = {
                        start: e.importName.start ?? e.localName.start,
                        end: e.localName.end,
                        type: e.importName.kind,
                        localToImport: e.importName.name,
                        moduleRequest: moduleRequest.value
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

