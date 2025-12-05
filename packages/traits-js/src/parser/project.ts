import { dirname, normalize } from 'node:path';
import { ResolverFactory, type NapiResolveOptions, type ResolveResult } from "oxc-resolver";
import { checkParseResult, getConfig, parseConfig, resolve, resolverOptions } from "./resolve";
import { TraitFile } from "./storage/trait-file";
import { Registry, type FileRegistry } from "./storage/registry";
import { timestamp } from "./helpers";
import { Stack, type VisitFn } from "./stack";
import { parseDefinition, parseDerives, parseImpl, parseTraits } from "./parser";
import type { TraitConfig } from "../lib/config";
import type { TraitDefinition } from './storage';
import type { Class } from 'oxc-parser';

export type ProjectOptions = Pick<Required<TraitConfig>, 'cwd' | 'indexFileNameFilter' | 'traitFileNameFilter'> & {
    resolverOptions?: NapiResolveOptions;
    verbose?: boolean;
};

type ImplMeta<T> = {
    node: T;
    foreign: boolean;
}

export class Project {
    #config: TraitConfig;
    #root: string;
    #resolver: ResolverFactory;
    #files: TraitFile[];
    #ids: Record<string, number>;

    #traitFileNameFilter: string;
    #indexFileNameFilter: string;

    #dependencies: Record<string, Project>;

    #implementations: Record<string, {
        definition: ImplMeta<TraitDefinition>;
        class: ImplMeta<Class>;
    }>;

    private constructor(
        config: Required<TraitConfig>,
        resolver: ResolverFactory
    ) {
        const { cwd } = config;

        console.log('Project root: ', cwd);

        this.#resolver = resolver;
        this.#files = [];
        this.#implementations = {};
        this.#ids = {};
        this.#dependencies = {};
        this.#root = cwd;
        this.#config = config;
        this.#indexFileNameFilter = config.indexFileNameFilter;
        this.#traitFileNameFilter = config.traitFileNameFilter;
    }

    static async new(projectRoot: string) {
        return new Project(await getConfig(projectRoot), new ResolverFactory(resolverOptions()));
    }

    async initialize() {
        const stack = await this.#createStackFromProjectEntry();
        //* initialize any dependencies this project has before parsing the project itself
        const deps = this.#dependencies;
        for (const packageName in deps) {
            deps[packageName]!.initialize();
        }

        await this.#dfsSourceFiles(stack);

        this.#initialize(this.#files);
    }

    file(path: string): TraitFile | undefined {
        if (path.startsWith(this.#root)) {
            const index = this.#ids[path];
            return index == null ? void 0 : this.#files[index];
        }
    }

    /**
     * starting in `file`, searches for the trait that matches `bindingName`.
     * This will follow the file registry's imports / exports to resolve any references not found in this file or project
     * 
     */
    resolveTrait(file: TraitFile, bindingName: string) {
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
        const { traits, indexFileNameFilter } = await getConfig(this.#root);

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
            const root = this.#root;
            const json = await Bun.file(rootPackageJsonPath).json() as Record<string, any>;
            console.log('checking for dependencies...');

            const deps =
                (await getDependencies(resolver, root, json.devDependencies)).concat(
                    await getDependencies(resolver, root, json.dependencies)
                );

            this.#dependencies = Object.fromEntries(deps.map(d => [d[0], new Project(d[1].config, resolver)]));

            // if ('traits-js' in json.devDependencies) {
            //     const modifierPath = resolver.sync(this.#root, 'traits-js/modifier');
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

            file.initialize();

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
                    parseDefinition(file as TraitFile<FileRegistry>, trait);
                }
            }
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i]!;
            if (file.isIndex()) {
                continue
            }

            // console.log('Project Impls - file %s, owned = %O, foreign = %O', file.name,

            //     file.ownedImpls().map(e => `${e.traitName} -> ${e.className}`).toArray(),
            //     file.foreignImpls().map((e) => `${e.traitName} -> ${e.className}`).toArray()
            // );

            for (const impl of file.impls()) {
                // const trait = this.resolveTrait(file, impl.traitName);


                // if (!trait) {
                //     //* trait should exist at this point
                //     continue;
                // }

                // time to check implementation!

                parseImpl(this, file as TraitFile<FileRegistry>, impl)


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

    // #resolveImport(file: TraitFile<FileRegistry>, localName: string) {
    //     const importVar = file.registry.importVars[localName];
    //     if (!importVar) {
    //         return;
    //     }

    //     const resolvedRequest = this.#resolver.sync(dirname(file.path), importVar.moduleRequest);

    //     if (resolvedRequest.path) {
    //         if (resolvedRequest.path.startsWith(this.#root)) {
    //             if (importVar.localToImport != null) {
    //                 // TODO: use this instead of below
    //                 return this.file(resolvedRequest.path)?.get(importVar.localToImport)
    //             }
    //         } else {
    //             // TODO: node_module:
    //             // * if unparsed:
    //             // * 1. check directory of package.json for {trait,traits}.json or {trait,traits}.data.json
    //             // * 2. parse and if successful, add to cache for future lookups
    //         }
    //     }
    // }

    #findProject(moduleRequest: string) {
        console.log('searching for [ %s ]...', moduleRequest);

        for (const packageName in this.#dependencies) {
            const project = this.#dependencies[packageName]!;
            const root = project.#root;
            console.log(root.endsWith(normalize(`${moduleRequest}/`)));
            return project;
            // if (project.#root.endsWith(moduleRequest)) {
            //     return project;
            // }
        }
    }

    #resolveImportedTrait(file: TraitFile<FileRegistry>, localName: string) {
        const importVar = file.registry.importVars[localName];
        if (!importVar) {
            return;
        }

        const resolvedRequest = this.#resolver.sync(dirname(file.path), importVar.moduleRequest);

        if (resolvedRequest.path) {
            const foreign = !resolvedRequest.path.startsWith(this.#root);

            console.log('RESOLVE IMPORT: ', foreign, localName);


            const resolvedName = importVar.localToImport;
            if (resolvedName) {
                if (foreign) {

                    // TODO: use `packageJsonPath` instead of this nonsense
                    // TODO: for looking up projects

                    let index = Infinity;
                    for (let i = 0; i < importVar.moduleRequest.length; i++) {
                        const char = importVar.moduleRequest[i]!;
                        if (char === '/' || char === '\\') {
                            index = i;
                            break;
                        }
                    }

                    if (index < importVar.moduleRequest.length) {
                        const name = importVar.moduleRequest.slice(0, index);
                        // console.log('REQ PATH: ', resolvedRequest.path);

                        const project = this.#findProject(name);
                        // console.log('project files::', project ? project.#files.map(f => f.path) : 'N/A');

                        if (project) {
                            const files = project.#files;
                            for (let i = 0; i < files.length; i++) {
                                const trait = files[i]!.trait(resolvedName)
                                if (trait) {
                                    return trait;
                                }
                            }
                        }

                        return project?.file(resolvedRequest.path)?.trait(resolvedName);
                    }

                    // return this.#findProject(importVar.moduleRequest)?.file(resolvedRequest.path)?.trait(resolvedName);
                    // return this.#dependencies[importVar.moduleRequest]?.file(resolvedRequest.path)?.trait(resolvedName);
                    // importVar.moduleRequest
                } else {
                    return this.file(resolvedRequest.path)?.trait(resolvedName);
                }

            }
        }
    }

}

async function getDependencies(resolver: ResolverFactory, root: string, dependencies: Record<string, string> = {}) {
    const deps: [name: string, { root: string; result: ResolveResult, config: Required<TraitConfig> }][] = [];
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

