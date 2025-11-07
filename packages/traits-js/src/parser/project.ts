import { type TSTypeQuery, type TSTypeReference } from "oxc-parser";
import { ResolverFactory, type NapiResolveOptions } from "oxc-resolver";
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pc from 'picocolors';
import { checkParseResult, resolve } from "./resolver";
import type { ParsedTraitConfigExport } from "../config";
import { TraitDefinition } from "./definition";
import { TraitFile } from "./file";
import { Registry, type ImportRegistry, type Import, type FileRegistry, type Reference } from "./file/registry";
import { print, timestamp } from "./helpers";
import { Stack, type VisitFn } from "./stack";
import { TraitError } from "./error";
import { collectBindings, parseDefinitionImplementation, parseDerives } from "./parser";

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

    async findAddSourceFiles(stack: Stack<TraitFile>) {
        const self = this,
            files = self.#files,
            then = performance.now();

        await Stack.dfs(stack, createVisitFn(self.#resolver, files, self.#ids, self.#indexFileNameFilter));
        console.log(timestamp('register', then));

        self.initializeSourceFiles(files);
    }

    initializeSourceFiles(files: TraitFile[]) {
        const project = this;
        const then = performance.now();
        for (let i = 0; i < files.length; i++) {
            const file = files[i]!;
            if (file.isIndex) {
                continue
            }
            const traits: Record<string, TraitDefinition> = {};
            const errors: Record<string, TraitError[]> = {};
            const { types, vars, tracker } = collectBindings(file, traits, errors);
            file.addBindings(tracker, types, vars, traits);
            // TODO: only parse if errors.length === 0
            parseDerives(project, file);
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i]!;
            if (file.isIndex) {
                continue
            }

            const traits = file.traits;
            for (const traitName in traits) {
                const trait = traits[traitName]!;
                if (trait.valid) {
                    parseDefinitionImplementation(file as TraitFile<FileRegistry>, trait);
                }
            }
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i]!;
            if (file.isIndex) {
                continue
            }

            const traits = file.traits;
            for (const traitName in traits) {
                const trait = traits[traitName]!;
                console.log('%s - %s = ', file.name, trait.name, trait.valid);
            }

        }

        console.log(timestamp('initialize', then));
    }

    get(path: string): TraitFile | undefined {
        const index = this.#ids[path];
        return index == null ? void 0 : this.#files[index];
    }

    getDerives(
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

    resolveImportReference(project: Project, importVar: Import, directory: string, localName: string) {
        const resolver = project.resolver;
        const resolvedRequest = resolver.sync(dirname(directory), importVar.moduleRequest);
        if (resolvedRequest.path) {
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

export type MethodParseResult = {
    readonly importRefs: Record<string, Reference[]>;
    readonly exportRefs: Reference[];
    readonly ambiguousCallSites: {
        identName: string;
        start: number;
        end: number;
    }[];
};

function createVisitFn(
    resolver: ResolverFactory,
    files: TraitFile[],
    ids: Record<string, number>,
    indexFilter: string
): VisitFn<TraitFile, string> {
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
                        start: e.importName.start ?? e.localName.start,
                        end: e.localName.end,
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
