import type { ExportNamedDeclaration, TSTypeLiteral, TSTypeReference } from "oxc-parser";
import { ResolverFactory, type NapiResolveOptions } from "oxc-resolver";
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pc from 'picocolors';
import { checkParseResult, resolve } from "./resolver";
import { declarationName, isDeclaredInModule, type TraitDeclaration, type TraitAliasDeclaration } from "./node";
import type { ParsedTraitConfigExport } from "../config";
import { Flags, type FlagsInterface } from "./flags";
import { TraitDefinition } from "./definition";
import { TraitFile } from "./trait-file";
import { Registry, type ImportRegistry, type ModuleImport } from "./registry";
import { walk } from "oxc-walker";
import { print } from "./helpers";
import { Stack } from "./stack";
import { TraitError } from "./error";


type ExportedTraitDeclaration = {
    parent: ExportNamedDeclaration;
    node: TraitDeclaration;
    type?: TSTypeLiteral | TSTypeReference;
};

export type ProjectOptions = {
    cwd: string,
    resolverOptions?: NapiResolveOptions,
    verbose?: boolean;
};


type TraitExports = Record<string, ExportedTraitDeclaration>;
type TraitTypeExports = Record<string, TraitAliasDeclaration>;

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
        const { traits, traitFileNameFilter, indexFileNameFilter } = await this.#getEntry();

        this.#indexFileNameFilter = indexFileNameFilter;
        this.#traitFileNameFilter = traitFileNameFilter;

        const resolver = this.#resolver;
        const result = await resolve(resolver, traits, indexFileNameFilter);
        checkParseResult(result, traits);

        if (result.packageJson) {
            const json = await Bun.file(result.packageJson).json() as Record<string, any>;
            if ('traits-js' in json.devDependencies) {
                const modifierPath = resolver.sync(this.#cwd, 'traits-js/modifier');
                console.log(modifierPath.path);
            }
        }

        // if (VERBOSE) {
        //     print('Project', `trait dir = ${result.directory}`);
        // }

        const s = new Stack<TraitFile>();
        s.push(result.path, new TraitFile(result, Registry.Index(s, resolver, result.result.module.staticExports)))
        return s;
    }

    async register(stack: Stack<TraitFile>) {
        const self = this;
        while (stack.length) {
            const frame = stack.pop()!;
            await self.scan(stack, frame);
        }

    }

    async scan(stack: Stack<TraitFile>, file: TraitFile) {
        const project = this;
        const resolver = project.#resolver;
        const indexFilter = project.#indexFileNameFilter;
        const vars: TraitExports = {};
        const types: TraitTypeExports = {};
        // TODO: include these variables above in `registerReExports` and put in `TraitFile.register`

        const exportNames = await file.register(resolver, stack, indexFilter);

        if (VERBOSE) {
            print('Frame', file.path);
        }

        if (VERBOSE) {
            console.log('-'.repeat(32));
        }

        if (exportNames) {
            walk(file.result.program, {
                enter(node, parent) {
                    if (parent && isDeclaredInModule(parent, node)) {
                        if (node.type === 'VariableDeclaration') {
                            const name = declarationName(node);
                            if (name && exportNames.has(name)) {
                                vars[name] = {
                                    parent: parent as ExportNamedDeclaration,
                                    node: node as TraitDeclaration
                                };
                            }

                        } else if (node.type === 'TSTypeAliasDeclaration' && node.typeAnnotation.type === 'TSTypeLiteral' && exportNames.has(node.id.name)) {
                            types[node.id.name] = node as TraitAliasDeclaration;
                        }
                    }

                },
            });
        }


        const errors: Record<string, TraitError[]> = {};
        const traits: Record<string, TraitDefinition> = {};

        for (const varName in vars) {
            const traitDec = vars[varName]!;
            const { parent, node } = traitDec;
            if (node.kind !== 'const') {
                errors[varName] = [TraitError.LetDeclaration()];
                continue
            }

            const declarator = node.declarations[0];
            const start = parent.start;
            const end = parent.end;

            // TODO: use importName of "trait" instead of hard-coded here
            if (declarator.init.type === 'CallExpression' && declarator.init.callee.name === TRAIT_FN_NAME) {
                // console.log('REGISTER: ', varName);
                const call_expr = declarator.init;
                const args = call_expr.arguments;

                const definition_errors: TraitError[] = [];

                if (args.length !== 1) {
                    definition_errors.push(TraitError.InvalidTraitCallArguments());
                    errors[varName] = definition_errors;
                    traits[varName] = new TraitDefinition(varName, start, end, false)
                    continue;
                }

                // !PARSE
                const base = file.parseBase(file, call_expr.typeArguments.params, types[varName]);

                if (Array.isArray(base)) {
                    definition_errors.push(...base);
                    traits[varName] = new TraitDefinition(varName, start, end, false)
                    continue;
                }
                // console.log('REGISTER: parsed base flags', varName);
                traits[varName] = new TraitDefinition(varName, start, end, true, base);
            }
        }

        file.addDefinitions(traits);
        project.add(file);
    }

    initialize() {
        const project = this,
            files = project.#files;

        for (let i = 0; i < files.length; i++) {
            files[i]!.parseDerives(project);
        }
    }

    add(traitFile: TraitFile): number {
        const files = this.#files,
            ids = this.#ids;

        const id = files.length;
        files.push(traitFile);
        ids[traitFile.path] = id;
        return id;
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
                const actual = project.resolveReferenceFromRequest(project, file.directory, importVar, lookupName);
                if (actual) {
                    return actual;
                }
            }
        }
    }

    resolveReferenceFromRequest(project: Project, directory: string, importVar: ModuleImport, localName: string) {
        const resolver = project.resolver;
        console.log('RESOLVING REQUEST FOR: ', directory, importVar.moduleRequest);

        const resolvedRequest = resolver.sync(dirname(directory), importVar.moduleRequest);
        if (resolvedRequest.path) {
            console.log('FOUND TRAIT FILE:', resolvedRequest.path);
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


    constructDeriveFlags(
        project: Project,
        importTypes: ImportRegistry,
        importVars: ImportRegistry,
        types: TraitTypeExports,
        traits: Record<string, TraitDefinition>,
        derives: TSTypeReference[],
        path: string
    ) {

        console.log('CONSTRUCT:DERIVES', derives.map(d => d.typeName.type === 'Identifier' ? d.typeName.name : void 0).filter(Boolean));
        const errors: TraitError[] = [];

        if (!derives.every(d => d.type === 'TSTypeReference' && d.typeName.type === 'Identifier')) {
            console.error('CONSTRUCT ERROR CANNOT PROCEED', derives.map(d => [d.type, d.typeName.type]))
            errors.push(TraitError.InvalidDeriveType());
            return { valid: false, errors } as const;
        }
        // time to resolve derives
        const queuedDerives: { name: string; path?: string; flags: FlagsInterface }[] = [];
        for (let i = 0; i < derives.length; i++) {
            const element = derives[i]!;
            if (element.type === 'TSTypeReference' && element.typeName.type === 'Identifier') {
                const lookupName = element.typeName.name;
                if (traits[lookupName]) {
                    console.log('lookup:localTraits - ', lookupName);
                    const t = traits[lookupName]!;
                    // console.log('Pushing local trait: ', t.name);
                    queuedDerives.push(t);
                } else if (types[lookupName]) {
                    console.log('lookup:localTypes - ', lookupName);

                    const localType = types[lookupName];
                    // TODO: add to trait flags instead of adding flags right here
                    const flags = Flags.fromSignatures(localType.typeAnnotation.members);
                    if (!(flags instanceof Flags)) {
                        break;
                    }

                    queuedDerives.push({
                        name: localType.id.name,
                        path: path,
                        flags: flags
                    });
                } else if (importVars[lookupName]) {
                    console.log('lookup:importVars - ', lookupName);
                    const actual = project.resolveReferenceFromRequest(project, path, importVars[lookupName]!, lookupName);
                    console.log('lookup:importVars - resolved', lookupName, actual?.name, actual?.valid);

                    if (actual && actual.valid) {
                        // console.log('Pushing imported: ', actual.name);
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

        console.log('construct: len check', derives.length, queuedDerives.length);


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
