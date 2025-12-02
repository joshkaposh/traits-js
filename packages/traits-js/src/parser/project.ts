import { ResolverFactory, type NapiResolveOptions, type ResolveResult } from "oxc-resolver";
import { dirname } from 'node:path';
import { checkParseResult, resolve, resolverOptions } from "./resolve";
import { TraitFile } from "./storage/trait-file";
import { Registry, type FileRegistry } from "./storage/registry";
import { print, timestamp } from "./helpers";
import { Stack, type VisitFn } from "./stack";
import { parseDefinitionImplementation, parseDerives, parseConfig, parseTraits } from "./parser";
import type { TraitConfig } from "../lib/config";
import type { ParseFileResult } from "./types";

export type ProjectOptions = Pick<Required<TraitConfig>, 'cwd' | 'indexFileNameFilter' | 'traitFileNameFilter'> & {
    resolverOptions?: NapiResolveOptions;
    verbose?: boolean;
};

let VERBOSE = false;

export class Project {
    #config: TraitConfig;
    #cwd: string;
    #resolver: ResolverFactory;
    #files: TraitFile[];
    #ids: Record<string, number>;

    #traitFileNameFilter: string;
    #indexFileNameFilter: string;

    #dependencies: Record<string, Project>;

    private constructor(
        config: Required<TraitConfig>,
        resolver: ResolverFactory
    ) {
        const { cwd } = config;

        console.log('Project root: ', cwd);

        this.#resolver = resolver;
        this.#files = [];
        this.#ids = {};
        this.#dependencies = {};
        this.#cwd = cwd;
        this.#config = config;
        this.#indexFileNameFilter = config.indexFileNameFilter;
        this.#traitFileNameFilter = config.traitFileNameFilter;
    }

    static async new(projectRoot: string, resolver = new ResolverFactory(resolverOptions())) {
        const config = await getEntry(projectRoot);
        return new Project(config, resolver);
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
        const stack = await this.#createStackFromProjectEntry();
        // const stack = new Stack<TraitFile>();
        //* initialize any dependencies this project has before parsing the project itself
        const deps = this.#dependencies;
        for (const packageName in deps) {
            const project = deps[packageName]!;
            await project.init();
        }
        await this.#dfsSourceFiles(stack);

        this.#initialize(this.#files);
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

    // resetStack(stack: Stack<TraitFile>) {
    //     stack.reset();
    // }

    async #createStackFromProjectEntry() {
        const then = performance.now();
        const { traits, indexFileNameFilter } = await getEntry(this.#cwd);

        const resolver = this.#resolver;
        const result = await resolve(resolver, traits, indexFileNameFilter);

        checkParseResult(result, traits);

        await this.#loadDependencies(resolver, result.packageJson);


        const s = new Stack<TraitFile>(result.path, new TraitFile(result, Registry.Index()));
        timestamp('resolve-entry', then);
        return s;
    }

    async #loadDependencies(resolver: ResolverFactory, rootPackageJsonPath: string | undefined) {
        if (rootPackageJsonPath) {
            const root = this.#cwd;
            const json = await Bun.file(rootPackageJsonPath).json() as Record<string, any>;
            console.log('checking for dependencies...');

            const deps =
                (await packageMetadata(resolver, root, json.devDependencies)).concat(
                    await packageMetadata(resolver, root, json.dependencies)
                );

            this.#dependencies = Object.fromEntries(deps.map(d => [d[0], new Project(d[1].config, resolver)]));
            // console.log('Dependencies: ', this.#dependencies);

            //             if ('traits-js' in json.devDependencies) {
            //     const modifierPath = resolver.sync(this.#cwd, 'traits-js/modifier');
            //     // console.log(modifierPath.path);
            // }

        }
    }

    async #dfsSourceFiles(stack: Stack<TraitFile>) {
        const then = performance.now();

        await Stack.dfs(stack, createVisitFn(this.#resolver, this.#files, this.#ids, this.#indexFileNameFilter));
        console.log(timestamp('register', then));
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

            // console.log('PROJECT PARSE: ', file.path);

            file.init();

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

            const traits = Object.fromEntries(file.traits().map(t => [t.name, t.valid]));

            console.log('%s = %O', file.name, traits);
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

}



async function packageMetadata(resolver: ResolverFactory, root: string, dependencies: Record<string, string> = {}) {
    const deps: [string, { root: string; result: ResolveResult, config: Required<TraitConfig> }][] = [];
    for (const name in dependencies) {
        const result = resolver.sync(root, name);
        if (result.packageJsonPath) {
            const config = await parseConfig(
                result.packageJsonPath.slice(0, result.packageJsonPath.length - 'package.json'.length
                )
            );

            if (typeof config === 'string') {
                continue;
            }
            deps.push([name, { root, result, config }]);
        }
    }

    return deps;

}


async function getEntry(root: string) {
    const entryOrError = await parseConfig(root);
    if (typeof entryOrError === 'string') {
        console.log(entryOrError);
        process.exit(1);
    }
    return entryOrError;
}

async function getDepsOfProject(resolver: ResolverFactory, root: string, packageJsonPath: string) {
    const projects = [];
    const ids: Record<string, number> = {};

    if (packageJsonPath) {
        const json = await Bun.file(packageJsonPath).json() as Record<string, any>;

        const deps = json.dependencies as Record<string, string>;
        // console.log('checking for dependencies...');


        const dependencies = Object.fromEntries(Object.keys(deps).map((name) => [name, resolver.sync(root, `${name}/traits`)]))

        // if ('traits-js' in json.dependencies) {

        // }

        //             if ('traits-js' in json.devDependencies) {
        //     const modifierPath = resolver.sync(this.#cwd, 'traits-js/modifier');
        //     // console.log(modifierPath.path);
        // }

    }


}


function createVisitFn(
    resolver: ResolverFactory,
    files: TraitFile[],
    ids: Record<string, number>,
    indexFilter: string
): VisitFn<TraitFile, string> {
    return async (file, add) => {
        const id = files.length;
        files.push(file);
        ids[file.path] = id;
        // console.log('new file: ', file.path);


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

