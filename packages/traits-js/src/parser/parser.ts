import { join, basename, normalize } from 'node:path';
import { existsSync } from 'node:fs';
import type { ExportNamedDeclaration, TSTypeAliasDeclaration, ExportExportNameKind, ImportNameKind, ParseResult, StaticExportEntry, TSIntersectionType, TSSignature, TSTypeLiteral, TSTypeReference } from 'oxc-parser';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import { ResolverFactory, type NapiResolveOptions } from 'oxc-resolver';
import pc from 'picocolors';
import type { ParsedTraitConfigExport } from '../config';
import { declarationName, isDeclaredInModule, typeDeclarationSignatures, type TraitDeclaration } from './node';
import { CONST, DEFAULT, INSTANCE, REQUIRED, STATIC, Flags, FlagsWithDerives, type FlagsInterface, } from './flags';
import { type TraitDefinitionError, ParseError } from './error';
import { Bindings } from './bindings';

const timestamp = (label: string, then: number) => `${label}: ${((performance.now() - then) / 1000)}`;

const print = (label: string, message: string) => console.log('[ %s ]: ', label, message);

let VERBOSE = false;

export async function register(filePath: string) {

    const project = new Project({
        cwd: filePath,
    });

    // const data = await project.load();

    // src/a.ts
    // src/b.ts

    // src/c.ts
    // src/d.ts

    // CHANGED = a.ts,  b.ts

    // src/c.ts // references b.ts

    // src/d.ts



    // if (data) {
    //* 1. deserialize
    //* 2. scan and skip parsing file if last modified was the same as previous parse
    // }

    let then = performance.now();

    console.log('Starting traits register...\n');
    const stack = await project.createStack();
    console.log(timestamp('resolve-entry', then));

    then = performance.now();

    console.log('-'.repeat(32));
    while (stack.length) {
        const frame = stack.pop()!;
        await scanFile(project, stack, frame);
    }

    console.log(timestamp('scan', then));

    then = performance.now();
    project.initialize();
    console.log(timestamp('initialize', then));

    process.exit(0);
}

type Result<T, E> = T | E;

//! REGISTRY

type ParseFileResultResult = {
    result: ParseResult;
    path: string;
    name: string;
    originalCode: string;
    originalRequest: string;
};

type ParseFileResult = Result<ParseFileResultResult, string[]>;

type ModuleImport = {
    type: ImportNameKind;
    localToImport: Record<string, string | undefined>;
    // entries: StaticImportEntry[];
    moduleRequest: string;
};

interface ModuleExportBase {
    type: ExportExportNameKind;
    moduleRequest: string | null;
}

interface ModuleReExport extends ModuleExportBase {
    type: ExportExportNameKind.None;
    moduleRequest: string;
    entries: StaticExportEntry[];
};

interface ModuleLocalExport extends ModuleExportBase {
    type: ExportExportNameKind.Name | ExportExportNameKind.Default;
    entries: StaticExportEntry[];
};

type ModuleExport = ModuleReExport | ModuleLocalExport;

type ImportRegistry = Record<string, ModuleImport>;
type ReExportRegistry = Record<string, ModuleExport>;
type LocalExportRegistry = Record<string, StaticExportEntry>;

type ExportedTraitDeclaration = {
    parent: ExportNamedDeclaration;
    node: TraitDeclaration;
    type?: TSTypeLiteral | TSTypeReference;
};

type ProjectOptions = {
    cwd: string,
    resolverOptions?: NapiResolveOptions,
    verbose?: boolean;
    onError?: Partial<RegisterErrorMap>;
};

type RegisterErrorMap = {
    TRAIT: (message: string) => void | Promise<void>;
}

type FilePath = string;

interface TraitMetadata {
    name: string;
    start: number;
    end: number;
    members: TSSignature[];
    derives: Record<string, TSTypeReference>;
}

class FileRegistry {
    #importTypes: ImportRegistry = {};
    #importVars: ImportRegistry = {};
    #localExportTypes: LocalExportRegistry = {};
    #reExportVars: ReExportRegistry = {};
    #reExportTypes: ReExportRegistry = {};
    #localExportVars: LocalExportRegistry = {}

    #result: ParseFileResultResult;
    #directory: string;

    constructor(result: ParseFileResultResult) {
        this.#result = result;
        this.#directory = result.originalRequest;
    }

    get name() {
        return this.#result.name;
    }

    get directory() {
        return this.#directory
    }

    get path() {
        return this.#result.path;
    }

    get code() {
        return this.#result.originalCode;
    }

    get result() {
        return this.#result;
    }

    get parseResult() {
        return this.#result.result;
    }

    async register(resolver: ResolverFactory, stack: Stack, frame: Frame, file: TraitFile, indexFilter: string) {
        const current = frame.result;
        const staticImports = current.module.staticImports;
        const staticExports = current.module.staticExports;

        const self = this;

        const importTypes = self.#importTypes;
        const importVars = self.#importVars;

        const reExportTypes = self.#reExportTypes;
        const reExportVars = self.#reExportVars;

        const exportTypes = self.#localExportTypes;
        const exportVars = self.#localExportVars;

        const importStart: number[] = [];
        const importEnd: number[] = [];
        const exportStart: number[] = [];
        const exportEnd: number[] = [];

        const importNames = new Set<string>();
        const exportNames = new Set<string>();

        let index = 0

        const queue = (name: string, start: number, end: number, isType: boolean, imported: boolean) => {
            index += 1;

            let starts, ends, names;

            if (imported) {
                starts = importStart;
                ends = importEnd;
                names = importNames;
            } else {
                starts = exportStart;
                ends = exportEnd;
                names = exportNames;

                file.queue(name, start, end, isType);
            }

            starts[index] = start;
            ends[index] = end;
            names.add(name);
        }


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
                queue(local.value, local.start, local.end, e.isType, true);
            }
        }


        for (let i = staticExports.length - 1; i >= 0; i--) {
            const e = staticExports[i]!;
            const entries = e.entries;
            for (let j = 0; j < entries.length; j++) {
                const entry = entries[j]!;
                // if entry has module request, it is not a local export
                // e.g "export const someVar = someValue"
                if (entry.moduleRequest) {
                    const moduleRequest = entry.moduleRequest;
                    const request = moduleRequest.value;
                    const r = entry.isType ? reExportTypes : reExportVars;
                    if (!r[request]) {
                        r[request] = {
                            type: entry.exportName.kind,
                            moduleRequest: moduleRequest.value,
                            entries: [],
                        };
                    }
                    r[request]!.entries.push(entry);
                } else {
                    const name = entry.exportName.name!;
                    // can only be a local if not in imports
                    if (!(name in (entry.isType ? importTypes : importVars))) {
                        // locals adds every code string
                        if (entry.isType) {
                            exportTypes[name] = entry;
                        } else {
                            exportVars[name] = entry;
                        }
                        queue(name, e.start, e.end, entry.isType, false);

                    }
                }
            }


            const originalRequest = frame.registry.result.originalRequest;
            for (const path in reExportTypes) {
                const resolveResult = tryResolveSync(resolver, originalRequest, path);
                const absolutePath = resolveResult?.path;
                if (absolutePath && !stack.visited(absolutePath)) {
                    const newParseResult = await resolve(resolver, absolutePath, indexFilter);
                    checkParseResult(newParseResult, absolutePath);
                    stack.push(new Frame(
                        newParseResult.path.endsWith(indexFilter),
                        newParseResult,
                    ));
                }
            }

            for (const path in reExportVars) {
                const resolveResult = tryResolveSync(resolver, originalRequest, path);
                const absolutePath = resolveResult?.path;

                if (absolutePath && !stack.visited(absolutePath)) {
                    const newResult = await resolve(resolver, absolutePath, path);
                    checkParseResult(newResult, absolutePath);
                    stack.push(new Frame(newResult.name.endsWith(indexFilter), newResult));
                }
            }
        }

        return exportNames;
    }

    importVar(name: string) {
        return this.#importVars[name];
    }

    importType(name: string) {
        return this.#importVars[name];
    }

    var(name: string) {
        return this.#localExportVars[name];
    }

    debug() {
        const str = 'DEBUG REGISTRY';
        const len = Math.floor(str.length / 2);
        console.log(str.padStart(len, '-').padEnd(len, '-'));
        console.log('local types: ', Object.keys(this.#localExportTypes));
        console.log('local vars: ', Object.keys(this.#localExportVars));
    }

    type(name: string) {
        return this.#localExportTypes[name];
    }


    serialize(): Record<string, any> {
        return {
            name: this.name,
            path: this.path,
            importTypes: this.#importTypes,
            importVars: this.#importVars,
            reExportTypes: this.#reExportTypes,
            reExportVars: this.#reExportVars,
            localExportTypes: this.#localExportTypes,
            localExportVars: this.#localExportTypes,
        };
    }
}

class TraitDefinition {
    #flags: FlagsInterface;
    #name: string;
    #start: number;
    #end: number;

    constructor(name: string, start: number, end: number, flags: FlagsInterface) {
        this.#flags = flags;
        this.#name = name;
        this.#start = start;
        this.#end = end;
    }

    get name() {
        return this.#name;
    }

    get start() {
        return this.#start;
    }

    get end() {
        return this.#end;
    }

    get flags() {
        return this.#flags;
    }

}

class TraitFile {
    #registry: FileRegistry;
    #uninitMeta: TraitMetadata[];
    #uninitTraits: UninitializedTraits;
    #traits: Record<string, TraitDefinition>;
    #types: TraitTypeExports;
    #vars: TraitExports;
    #errors: Record<string, TraitDefinitionError[]>;
    #typeIds: Record<string, number>;
    #varIds: Record<string, number>;

    constructor(registry: FileRegistry) {
        this.#registry = registry;
        this.#uninitMeta = [];
        this.#uninitTraits = {};
        this.#traits = {};
        this.#types = {};
        this.#vars = {};
        this.#typeIds = {};
        this.#varIds = {};
        this.#errors = {};
    }

    get path() {
        return this.#registry.path;
    }

    get directory() {
        return this.#registry.directory;
    }

    get name() {
        return this.#registry.name;
    }

    get registry() {
        return this.#registry;
    }

    queue(name: string, start: number, end: number, isType: boolean) {
        if (VERBOSE) {
            print('Queue', `${isType ? 'type ' : ''} ${name}`)
        }

        const id = this.#uninitMeta.length;
        this.#uninitMeta.push({
            name: name,
            start: start,
            end: end,
            members: [],
            derives: {}
        });

        // const info: BindingInfo =  {
        //     name: name,
        //     isType: isType,
        //     parent: parent,
        //     node: node,
        // };

        const ids = isType ? this.#typeIds : this.#varIds;
        ids[name] = id;

    }

    setUninitialized(uninitializedTraits: UninitializedTraits, types: TraitTypeExports, vars: TraitExports) {
        this.#uninitTraits = uninitializedTraits;
        this.#types = types;
        this.#vars = vars;
    }

    initialize(project: Project) {
        const self = this;
        const registry = self.#registry,
            uninitialized = self.#uninitTraits,
            types = self.#types,
            traits = self.#traits,
            bar = '-'.repeat(32);

        if (VERBOSE) {
            print('Initialize', registry.path);
        }

        for (const name in uninitialized) {
            const uninit = uninitialized[name]!;
            const node = uninit.trait.node;
            const parent = uninit.trait.parent;
            const typeDeclaration = uninit.typeDeclaration;
            const declarator = node.declarations[0];
            const definition_errors: ParseError[] = [];
            const start = parent.start;
            const end = parent.end;
            if (VERBOSE) {
                print('init:parse', name)
            }
            // TODO: use importName of "trait" instead of hard-coded here
            if (declarator.init.type === 'CallExpression' && declarator.init.callee.name === 'trait') {
                const call_expr = declarator.init;
                if (call_expr.arguments.length === 1) {
                    const parsedFlags = self.#parseTraitType(project, registry, types, call_expr.typeArguments.params[0], typeDeclaration);
                    if (parsedFlags) {
                        const joined = FlagsWithDerives.fromDerives(parsedFlags.base, parsedFlags.derives);
                        let str = `[ ${name} ]:\n`;
                        str += `    constants: [ ${joined.namesOfType(CONST).join(', ')} ]\n`;
                        str += `    static: [ ${joined.namesOfType(STATIC).join(', ')} ]\n`;
                        str += `    instance: [ ${joined.namesOfType(INSTANCE).join(', ')} ]\n`;
                        str += `    default: [ ${joined.namesOfType(DEFAULT).join(', ')} ]\n`;
                        str += `    required: [ ${joined.namesOfType(REQUIRED).join(', ')} ]\n`;

                        console.log(str);

                        const traitObject = call_expr.arguments[0];
                        const properties = traitObject.properties;

                        let valid = true;
                        for (let i = 0; i < properties.length; i++) {
                            const prop = properties[i]!;
                            const propName = prop.key.name;
                            // checkProperty(prop as any, {}, errors);
                            if (prop.value.type === 'FunctionExpression') {
                                if (!joined.hasName(propName)) {
                                    valid = false;
                                    break;
                                }
                            }
                            // if (Flags.has(flags.flagsOfName(propName)!, REQUIRED)) {
                            //     errors.push(ParseError.RequiredMethodHasDefinition(propName));
                            // } else {

                            // }
                        }
                        traits[name] = new TraitDefinition(
                            name,
                            start,
                            end,
                            joined,
                        );

                    } else {
                        //!Invalid: failed to parse type argument for trait call...
                    }

                } else {
                    // invalid: trait call length should be 1
                }
            }

        }

        if (VERBOSE) {
            console.log(bar);
        }
    }

    trait(name: string) {
        return this.#traits[name];
        // const index = this.#varIds[name];
        // return index == null ? void 0 : this.#uninitMeta[index];
    }


    //! PARSE TRAIT TYPE
    #parseTraitType(
        project: Project,
        registry: FileRegistry,
        typeDecs: TraitTypeExports,
        typeArgument: TSTypeLiteral | TSTypeReference | TSIntersectionType,
        typeDeclaration: TSTypeAliasDeclaration | undefined
    ) {

        const errors = [];

        const self = this;

        switch (typeArgument.type) {
            //* e.g. trait<{}>(...)
            case 'TSTypeLiteral':
                return { base: Flags.fromSignatures(typeDeclarationSignatures(typeArgument)!), derives: [] };

            //* e.g. trait<Foo>(...)
            //* e.g. trait<Derive<[Foo, Bar, Baz],{}>>(...)
            case 'TSTypeReference':

                if (typeArgument.typeName.type === 'Identifier') {
                    const isReferenceForTrait = typeArgument.typeName.name === typeDeclaration?.id.name && typeDeclaration.typeAnnotation.type === 'TSTypeLiteral';
                    if (isReferenceForTrait) {
                        return { base: Flags.fromSignatures(typeDeclarationSignatures(typeDeclaration)!), derives: [] };
                    } else if (typeArgument.typeName.name === 'Derive' && typeArgument.typeArguments) {
                        const deriveArgs = typeArgument.typeArguments.params;
                        if (deriveArgs.length === 2 && deriveArgs[0]?.type === 'TSTupleType' && (deriveArgs[1]?.type === 'TSTypeLiteral' || deriveArgs[1]?.type === 'TSTypeReference')) {
                            const [tuple, type] = deriveArgs;
                            let baseFlags: Flags;
                            if (type.type === 'TSTypeLiteral') {
                                baseFlags = Flags.fromSignatures(type.members);
                            } else if (type.type === 'TSTypeReference' && type.typeName.type === 'Identifier') {
                                const typeName = type.typeName.name;

                                const localLiteral = typeDecs[typeName]?.typeAnnotation;
                                if (localLiteral) {
                                    baseFlags = Flags.fromSignatures(localLiteral.members);
                                    // time to resolve derives
                                    const derives = tuple.elementTypes;

                                    const derivedFlags: { name: string | undefined; flags: FlagsInterface }[] = [];

                                    let valid = true;
                                    for (let i = 0; i < derives.length; i++) {
                                        const element = derives[i]!;
                                        if (element.type === 'TSTypeLiteral') {
                                            derivedFlags.push({ name: void 0, flags: Flags.fromSignatures(element.members) });
                                        } else if (element.type === 'TSTypeReference' && element.typeName.type === 'Identifier') {
                                            const lookupName = element.typeName.name;
                                            const localType = this.#types[lookupName];
                                            if (localType) {
                                                // TODO: add to trait flags instead of adding flags right here
                                                derivedFlags.push({ name: localType.id.name, flags: Flags.fromSignatures(localType.typeAnnotation.members) });

                                            } else {
                                                const importVar = registry.importVar(lookupName);
                                                if (importVar) {
                                                    const actual = resolveReferenceFromOtherFile(project, registry.directory, importVar, lookupName);
                                                    if (actual) {
                                                        derivedFlags.push({ name: actual.name, flags: actual.flags });
                                                    }
                                                }
                                            }

                                        } else {
                                            valid = false;
                                            break;
                                        }
                                    }

                                    if (valid) {
                                        return { base: baseFlags, derives: derivedFlags }
                                    }



                                } else {
                                    // error: type not defined locally
                                }

                            }




                        } else {
                            //     //! ERROR: invalid type arg
                        }

                    }
                }
                else {
                    // errors.push(`trait type argument must equal trait type declaration (references an unknown type ${typeArgument.typeName.type === 'Identifier' ? typeArgument.typeName.name : ''}, but expected ${typeDeclaration?.id.name ?? name})`);
                }

                break;
            //* Foo = trait
            //* Bar = derived trait

            //* e.g. trait<Foo & Bar>(...)
            //* e.g. trait<Foo & {}>(...)
            //* e.g. trait<Infer<typeof Foo> & {}>(...)
            case 'TSIntersectionType':
                const types = typeArgument.types;
                const valid = types.every(type => {
                    return type.type === 'TSTypeLiteral' || type.type === 'TSTypeReference';
                });

                if (valid) {
                    const last = types.at(-1)!;
                    const deriveFlags = getDerivesOfTrait(project, self, types.slice(0, types.length - 1));
                    let flags;
                    if (last.type === 'TSTypeLiteral') {
                        flags = Flags.fromSignatures(last.members);
                    } else if (last.type === 'TSTypeReference' && last.typeName.type === 'Identifier') {
                        const lookupName = last.typeName.name;
                        const typeDeclaration = this.#uninitTraits[lookupName]?.typeDeclaration;
                        if (typeDeclaration) {
                            flags = Flags.fromSignatures(typeDeclaration.typeAnnotation.members);
                        } else {
                            console.error('could not resolve reference for type [ %s ]', lookupName, registry.code.slice(last.start, last.end));
                        }
                    }
                    if (!flags?.isDisjointFromDerives(deriveFlags.map(f => f.flags))) {
                        console.error('could not join derives for type...');
                    } else {
                        return { base: flags, derives: deriveFlags };
                    }
                }
                break;
            default:
                break;
        }

    }

    resolveRef(project: Project, derivedFlags: { name: string | undefined; flags: FlagsInterface }[], lookupName: string) {
        const registry = this.#registry;
        const localType = this.#types[lookupName];
        if (localType) {
            derivedFlags.push({ name: localType.id.name, flags: Flags.fromSignatures(localType.typeAnnotation.members) })
        } else {
            const importVar = registry.importVar(lookupName);
            if (importVar) {
                const actual = resolveReferenceFromOtherFile(project, registry.directory, importVar, lookupName);
                if (actual) {
                    derivedFlags.push({ name: actual.name, flags: actual.flags });
                }
            }
        }
    }
}

interface FrameBase {
    isIndex: boolean;
    registry: FileRegistry;
    bindings: Bindings;
};

class Frame implements FrameBase {
    isIndex: boolean;
    registry: FileRegistry;
    bindings: Bindings;
    constructor(isIndex: boolean, result: ParseFileResultResult) {
        this.isIndex = isIndex;
        this.registry = new FileRegistry(result);
        this.bindings = new Bindings();
    }

    get result() {
        return this.registry.parseResult;
    }

}

class Stack {
    #stack: Frame[];
    #ids: Map<FilePath, number>;
    constructor(initial: Frame) {
        this.#stack = [initial];
        this.#ids = new Map([[initial.registry.path, 0]]);
    }

    get length() {
        return this.#stack.length;
    }

    push(frame: Frame): number {
        const id = this.#stack.length;
        this.#ids.set(frame.registry.path, id);
        this.#stack.push(frame);
        return id;
    }

    pop(): Frame | undefined {
        return this.#stack.pop();
    }

    peek(): Frame | undefined {
        return this.#stack.at(-1);
    }

    visited(path: string): boolean {
        return this.#ids.has(path);
    }
}

interface TraitAliasDeclaration extends TSTypeAliasDeclaration {
    typeAnnotation: TSTypeLiteral;
}

type UninitializedTraits = Record<string, {
    trait: ExportedTraitDeclaration;
    typeDeclaration: TraitAliasDeclaration | undefined;
}>;


type TraitExports = Record<string, ExportedTraitDeclaration>;
type TraitTypeExports = Record<string, TraitAliasDeclaration>;

class Project {
    #cwd: string;
    #resolver: ResolverFactory;
    /** dict of error handlers */
    #errors: RegisterErrorMap;

    #files: TraitFile[];
    #ids: Record<string, number>;

    #traitFileNameFilter!: string;
    #indexFileNameFilter!: string;

    constructor(options: ProjectOptions) {
        const { cwd } = options;
        const resolverOptions = options.resolverOptions ??= Object.create(null) as NapiResolveOptions;
        resolverOptions.preferAbsolute = true;
        resolverOptions.extensions = Array.from(new Set(resolverOptions.extensions ?? []).union(new Set(['.ts'])))

        const errors = options.onError ?? Object.create(null);
        errors.TRAIT ??= () => { };

        VERBOSE = options.verbose ?? false;

        if (VERBOSE) {
            print('Project', `cwd = ${cwd}`);
        }

        this.#resolver = new ResolverFactory(resolverOptions);
        this.#errors = errors;
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

        this.#indexFileNameFilter = traitFileNameFilter;
        this.#traitFileNameFilter = indexFileNameFilter;

        const resolver = this.#resolver;
        const result = await resolve(resolver, traits, indexFileNameFilter);
        checkParseResult(result, traits);
        if (VERBOSE) {
            print('Project', `trait dir = ${result.originalRequest}`);
        }

        return new Stack(new Frame(true, result));
    }

    initialize() {
        const project = this;
        const files = project.#files;
        for (let i = 0; i < files.length; i++) {
            const file = files[i]!;
            file.initialize(project);
        }
    }

    add(traitFile: TraitFile): number {
        const id = this.#files.length;
        this.#files.push(traitFile);
        this.#ids[traitFile.path] = id;
        return id;
    }

    get(path: string): TraitFile | undefined {
        const index = this.#ids[path];
        return index == null ? void 0 : this.#files[index];
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

async function scanFile(project: Project, stack: Stack, frame: Frame) {
    const registry = frame.registry;
    const file = new TraitFile(registry);
    const vars: TraitExports = {};
    const types: TraitTypeExports = {};
    const exportNames = await registry.register(project.resolver, stack, frame, file, project.indexFilter);

    const uninitialized: UninitializedTraits = Object.create(null);

    if (VERBOSE) {
        print('Frame', registry.path);
    }


    if (VERBOSE) {
        console.log('-'.repeat(32));
    }

    walk(frame.result.program, {
        enter(node, parent) {
            if (parent && isDeclaredInModule(parent, node)) {
                if (node.type === 'VariableDeclaration') {
                    const name = declarationName(node)!;
                    if (exportNames.has(name)) {
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

    for (const name in vars) {
        const traitDec = vars[name]!;
        const typeDec = types[name];
        uninitialized[name] = {
            trait: traitDec,
            typeDeclaration: typeDec as TraitAliasDeclaration,
        }
    }

    file.setUninitialized(uninitialized, types, vars);

    project.add(file);
}

async function resolve(
    resolver: ResolverFactory,
    /**
    * can be a path to a file or a directory containing `index.ts`
    */
    path: string,
    indexFileNameFilter: string
): Promise<ParseFileResult> {
    const errors: string[] = [];
    if (existsSync(path)) {
        const file = Bun.file(path);
        const stats = await file.stat();
        let result!: ParseFileResultResult;

        if (stats.isDirectory()) {
            const request = normalize(`${path}/${indexFileNameFilter}`);
            const resolved = resolver.sync(path, request);
            if (resolved.path) {
                const absolutePath = resolved.path;
                const file = Bun.file(absolutePath);
                const name = basename(path);
                const code = await file.text();
                result = {
                    name: name,
                    originalRequest: path,
                    path: absolutePath,
                    originalCode: code,
                    result: parseSync(name, code, {
                        astType: 'ts',
                        range: true
                    })
                };
            } else {
                errors.push(`Project has no index file (tried finding ${indexFileNameFilter} in directory ${path})`);
            }

        } else {
            const name = basename(path);
            const code = await file.text();
            result = {
                name: name,
                path: path,
                originalRequest: join(path, '../'),
                originalCode: code,
                result: parseSync(name, code, {
                    astType: 'ts',
                })
            };
        }

        return errors.length ? errors : result;

    } else {
        return [`invalid path: ${path}`];
    }

}

type UnresolvedDerivesOfTrait = (TSTypeLiteral | TSTypeReference)[];

function getDerivesOfTrait(project: Project, file: TraitFile, derives: UnresolvedDerivesOfTrait): { name: string | undefined; flags: FlagsInterface }[] {
    const resolved: { name: string | undefined; flags: FlagsInterface }[] = [];
    for (let i = 0; i < derives.length; i++) {
        const type = derives[i]!;
        if (type.type === 'TSTypeLiteral') {
            resolved.push({ name: void 0, flags: Flags.fromSignatures(type.members) });
        } else {
            if (type.typeName.type === 'Identifier') {
                if (type.typeName.name === 'Infer' && type.typeArguments && type.typeArguments.params[0]?.type === 'TSTypeQuery' && type.typeArguments.params[0].exprName.type === 'Identifier') {
                    const typeQuery = type.typeArguments.params[0];
                    // @ts-expect-error
                    const typeName = typeQuery.exprName.name;
                    // const local = file.trait(typeName);
                    // console.log('GET DERIVES OF TRAIT - LOCAL: ', local);
                    file.resolveRef(project, resolved, typeName)
                } else {
                    file.resolveRef(project, resolved, type.typeName.name);
                    // const ref = resolveReferenceFromOtherFile(project, file.directory, file.registry.importVar(type.typeName.name)!, type.typeName.name);
                    // if (ref) {
                    //     resolved.push(ref);
                    // } else {
                    //     // error: not found ???
                    // }
                }
            }
        }

    }


    return resolved;
}

function resolveReferenceFromOtherFile(project: Project, directory: string, importVar: ModuleImport, localName: string) {
    const resolver = project.resolver;
    const resolvedRequest = resolver.sync(directory, importVar.moduleRequest);
    // console.log(project.get(res));

    // console.log('found import var, time to resolve!', resolvedRequest.path);
    if (resolvedRequest.path) {
        const previous = project.get(resolvedRequest.path);
        if (previous) {
            const resolvedName = importVar.localToImport[localName]!;

            // const resolvedName = importVar.entries.find(e => e.localName.value === localName)?.importName.name;
            if (resolvedName) {
                return previous.trait(resolvedName);
            }
        }
    }
}

function resolveReference(project: Project, registry: FileRegistry, lookupName: string, derivedFlags: { name: string | undefined; flags: FlagsInterface }[]) {
    const importVar = registry.importVar(lookupName);
    if (importVar) {
        const actual = resolveReferenceFromOtherFile(project, registry.directory, importVar, lookupName);
        if (actual) {
            derivedFlags.push({ name: actual.name, flags: actual.flags });
        }
    }
}

//! PARSE TRAIT TYPE END

function tryResolveSync(resolver: ResolverFactory, directory: string, request: string) {
    try { return resolver.sync(directory, request) } catch (error) { }
}

function checkParseResult(result: ParseFileResult, path: string): asserts result is ParseFileResultResult {
    if (Array.isArray(result)) {
        console.error(`(traits-js) - Encountered errors in config file: ${path}`);
        console.log(result.join('\n'));
        process.exit(1);
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
