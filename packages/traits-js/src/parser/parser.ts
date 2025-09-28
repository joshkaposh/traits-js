import { join, basename, normalize } from 'node:path';
import { existsSync } from 'node:fs';
import type { ExportNamedDeclaration, TSTypeAliasDeclaration, ExportExportNameKind, ImportNameKind, ParseResult, StaticExportEntry, TSIntersectionType, TSTypeLiteral, TSTypeReference, StaticExport, ObjectExpression, Span } from 'oxc-parser';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import { ResolverFactory, type NapiResolveOptions } from 'oxc-resolver';
import pc from 'picocolors';
import type { ParsedTraitConfigExport } from '../config';
import { declarationName, isDeclaredInModule, typeDeclarationSignatures, type TraitDeclaration, type TraitObjectProperty } from './node';
import { DeriveError, TraitDefinitionError, PARSE_ERR_TYPE } from './error';
import { CONST, DEFAULT, INSTANCE, REQUIRED, STATIC, Flags, type FlagsInterface, } from './flags';
import { TraitDefinition } from './definition';
import { DefaultMethods } from './default-methods';

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


class TraitFile {
    #result: ParseFileResultResult;

    #types: TraitTypeExports;
    #vars: TraitExports;
    #errors: Record<string, TraitDefinitionError[]>;
    #typeIds: Record<string, number>;
    #varIds: Record<string, number>;

    #uninitTraits: UninitializedTraits;
    #traits: Record<string, TraitDefinition>;

    #nextId = 0;

    #importTypes: ImportRegistry = {};
    #importVars: ImportRegistry = {};
    #localExportTypes: LocalExportRegistry = {};
    #reExportVars: ReExportRegistry = {};
    #reExportTypes: ReExportRegistry = {};
    #localExportVars: LocalExportRegistry = {};

    #parsedRefs: Record<string, FlagsInterface> = {};

    constructor(result: ParseFileResultResult) {
        this.#result = result;
        this.#uninitTraits = {};
        this.#traits = {};
        this.#types = {};
        this.#vars = {};
        this.#typeIds = {};
        this.#varIds = {};
        this.#errors = {};
    }

    get path() {
        return this.#result.path;
    }

    get directory() {
        return this.#result.originalRequest;
    }

    get name() {
        return this.#result.name;
    }

    get result() {
        return this.#result.result;
    }

    async register(resolver: ResolverFactory, stack: Stack, frame: Frame, file: TraitFile, indexFilter: string) {
        const current = frame.file.result;
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
        const originalRequest = self.directory;

        let index = 0;
        const add = (name: string, start: number, end: number, isType: boolean, imported: boolean) => {
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

                file.queue(name, isType);
            }
            starts[index] = start;
            ends[index] = end;
            names.add(name);
        }

        const registerExports = ({ entries, start, end }: StaticExport) => {
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i]!;
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
                        add(name, start, end, entry.isType, false);
                    }
                }
            }
        }

        // register any
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
                add(local.value, local.start, local.end, e.isType, true);
            }
        }

        for (let i = staticExports.length - 1; i >= 0; i--) {
            registerExports(staticExports[i]!);


            for (const path in reExportTypes) {
                const resolveResult = tryResolveSync(resolver, originalRequest, path);
                const absolutePath = resolveResult?.path;
                if (absolutePath && !stack.visited(absolutePath)) {
                    const newParseResult = await resolve(resolver, absolutePath, indexFilter);
                    checkParseResult(newParseResult, absolutePath);
                    stack.push({
                        isIndex: newParseResult.path.endsWith(indexFilter),
                        file: new TraitFile(newParseResult)
                    });
                }
            }

            for (const path in reExportVars) {
                const resolveResult = tryResolveSync(resolver, originalRequest, path);
                const absolutePath = resolveResult?.path;

                if (absolutePath && !stack.visited(absolutePath)) {
                    const newResult = await resolve(resolver, absolutePath, path);
                    checkParseResult(newResult, absolutePath);
                    stack.push({ isIndex: newResult.name.endsWith(indexFilter), file: new TraitFile(newResult) });
                }
            }
        }

        return exportNames;
    }


    queue(name: string, isType: boolean) {
        if (VERBOSE) {
            print('Queue', `${isType ? 'type ' : ''} ${name}`)
        }

        const id = this.#nextId;
        this.#nextId += 1;
        const ids = isType ? this.#typeIds : this.#varIds;
        ids[name] = id;

    }

    setUninitialized(uninitializedTraits: UninitializedTraits, types: TraitTypeExports, vars: TraitExports) {
        this.#uninitTraits = uninitializedTraits;
        this.#types = types;
        this.#vars = vars;
    }

    initialize(project: Project) {
        const self = this,
            uninitialized = self.#uninitTraits,
            types = self.#types,
            traits = self.#traits,
            bar = '-'.repeat(32);

        if (VERBOSE) {
            print('Initialize', self.path);
        }

        for (const name in uninitialized) {
            const uninit = uninitialized[name]!;
            const node = uninit.trait.node;
            const parent = uninit.trait.parent;
            const typeDeclaration = uninit.typeDeclaration;
            const declarator = node.declarations[0];
            // const definition_errors: ParseError[] = [];
            const start = parent.start;
            const end = parent.end;
            if (VERBOSE) {
                print('init:parse', name)
            }
            // TODO: use importName of "trait" instead of hard-coded here
            if (declarator.init.type === 'CallExpression' && declarator.init.callee.name === 'trait') {
                const call_expr = declarator.init;
                if (call_expr.arguments.length === 1) {
                    const parsedFlags = self.#parseTraitTypeArgument(project, self, declarator.id.name, types, call_expr.typeArguments.params[0], typeDeclaration);
                    if (!Array.isArray(parsedFlags)) {
                        const flags = Flags.withDerives(parsedFlags.base, parsedFlags.derives);

                        const traitObject = call_expr.arguments[0];
                        const properties = traitObject.properties;

                        const defaultMethods = new DefaultMethods();
                        const defaultStatic = flags.staticDefaultNames;
                        const defaultInstance = flags.instanceDefaultNames;
                        const requiredStatic = flags.staticRequiredNames;
                        const requiredInstance = flags.instanceRequiredNames;

                        const unknownStatic: Span[] = [];
                        const unknownInstance: Array<{
                            type: 'SpreadAssigment' | 'KeyNeIdentifier' | 'DefinesRequired';
                            start: number;
                            end: number
                        }> = [];

                        const definedStaticRequireds: string[] = [];
                        const definedInstanceRequireds: string[] = [];


                        for (let i = 0; i < properties.length; i++) {
                            const property = properties[i]!;
                            const propertyName = property.key.name;

                            if (propertyName === 'instance' && property.value.type === 'ObjectExpression') {
                                const instanceProperties = property.value.properties;
                                for (let j = 0; j < instanceProperties.length; j++) {
                                    const instanceProperty = instanceProperties[j]!;
                                    if (instanceProperty.type === 'SpreadElement') {
                                        unknownInstance.push({ type: 'SpreadAssigment', start: instanceProperty.start, end: instanceProperty.end });
                                    } else {
                                        const key = instanceProperty.key;
                                        if (key.type === 'Identifier') {
                                            if (defaultInstance.has(key.name)) {
                                                defaultMethods.add(key.name, instanceProperty.start, instanceProperty.end);
                                                // console.log('INSTANCE KEY: ', defaultInstance.has(key.name));
                                            } else if (requiredInstance.has(key.name)) {
                                                definedInstanceRequireds.push(key.name);
                                            }
                                        } else {
                                            unknownInstance.push({
                                                type: 'KeyNeIdentifier',
                                                start: instanceProperty.key.start,
                                                end: instanceProperty.key.end,
                                            });
                                        }
                                    }
                                }

                            } else if (property.value.type === 'FunctionExpression') {
                                if (defaultStatic.has(propertyName)) {
                                    defaultMethods.add(propertyName, property.start, property.end);
                                } else if (requiredStatic.has(propertyName)) {
                                    definedStaticRequireds.push(propertyName);
                                }

                            } else {
                                unknownStatic.push({
                                    start: property.key.start,
                                    end: property.key.end
                                })
                            }
                        }

                        traits[name] = new TraitDefinition(
                            name,
                            start,
                            end,
                            flags,
                            unknownStatic,
                            unknownInstance
                        );

                        if (!unknownStatic.length && !unknownInstance.length) {
                            let str = `validated(${name})\n`;
                            str += `    constants: [ ${flags.namesOfType(CONST).join(', ')} ]\n`;
                            str += `    static: [ ${flags.namesOfType(STATIC).join(', ')} ]\n`;
                            str += `    instance: [ ${flags.namesOfType(INSTANCE).join(', ')} ]\n`;
                            str += `    default: [ ${flags.namesOfType(DEFAULT).join(', ')} ]\n`;
                            str += `    required: [ ${flags.namesOfType(REQUIRED).join(', ')} ]\n`;
                            console.log(str);
                        } else {
                            const staticCount = unknownStatic.length;
                            const instanceCount = unknownInstance.length;
                            const errCount = staticCount + instanceCount;

                            if (!VERBOSE) {
                                console.log(`%s has %s errors (%s static errors, %s instance errors)`, name, errCount, staticCount, instanceCount);
                            } else {
                                const code = self.#result.originalCode;
                                let str = `${name} has (${errCount}) errors...`;
                                str += `  with ${staticCount} static errors...`;
                                for (const node of unknownStatic) {
                                    str += `\n    code: ${code.slice(node.start, node.end)}`;
                                }

                                str += `  with ${instanceCount} instance errors...`;
                                for (const node of unknownInstance) {
                                    str += `\n    type: ${node.type}: ${code.slice(node.start, node.end)}`;
                                }

                                console.log(str);


                            }
                            // }
                        }

                    }

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

    #parseTraitTypeArgument(
        project: Project,
        self: TraitFile,
        name: string,
        typeDecs: TraitTypeExports,
        typeArgument: TSTypeLiteral | TSTypeReference | TSIntersectionType,
        typeDeclaration: TSTypeAliasDeclaration | undefined

    ): { base: FlagsInterface; derives: { name: string | undefined, flags: FlagsInterface }[] } | TraitDefinitionError[] {

        // const returnParsed = (parsed: ) => { };

        switch (typeArgument.type) {
            //* e.g. trait<{}>(...)
            case 'TSTypeLiteral':
                const flags = Flags.fromSignatures(typeDeclarationSignatures(typeArgument)!);
                return !flags ? [new TraitDefinitionError('cannot construct flags', { type: PARSE_ERR_TYPE.TypeDef, kind: 1 })] : { base: flags, derives: [] };

            //* e.g. trait<Foo>(...)
            //* e.g. trait<Derive<[Foo, Bar, Baz],{}>>(...)
            case 'TSTypeReference':
                return self.#parseTraitTypeArgumentReference(project, self, name, typeDecs, typeArgument, typeDeclaration) ?? [];
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

                if (!valid) {
                    return [];
                }

                const deriveFlags = project.getDerivesOfTrait(project, self.#types, self.#importVars, types.slice(0, types.length - 1), self.directory);
                console.log('INTERSECTION: %s', name, deriveFlags != null);

                if (!deriveFlags) {
                    return [];
                }

                const last = types.at(-1)!;
                let intersection: FlagsInterface | undefined;
                if (last.type === 'TSTypeLiteral') {
                    intersection = Flags.fromSignatures(last.members);
                } else if (last.type === 'TSTypeReference' && last.typeName.type === 'Identifier') {
                    const lookupName = last.typeName.name;
                    const typeDeclaration = this.#uninitTraits[lookupName]?.typeDeclaration;
                    if (typeDeclaration) {
                        intersection = Flags.fromSignatures(typeDeclaration.typeAnnotation.members);
                    } else {
                        console.error('could not resolve reference for type [ %s ]', lookupName, self.#result.originalCode.slice(last.start, last.end));
                    }
                }

                if (!intersection?.isDisjointFromDerives(deriveFlags.map(f => f.flags))) {
                    console.error('could not join derives for type...');
                } else {
                    return { base: intersection, derives: deriveFlags };
                }

                break;
            default:
                break;
        }

        return [];
    }

    #parseTraitTypeArgumentReference(project: Project, self: TraitFile, traitName: string, typeDecs: TraitTypeExports, typeArgument: TSTypeReference, typeDeclaration: TSTypeAliasDeclaration | undefined) {
        if (typeArgument.typeName.type === 'Identifier') {
            if (
                // e.g trait<Foo>
                // this type is a reference for the trait type alias declaration,
                // so we can retrieve it and parse it directly
                typeArgument.typeName.name === typeDeclaration?.id.name
                && typeDeclaration.typeAnnotation.type === 'TSTypeLiteral'
            ) {
                const flags = Flags.fromSignatures(typeDeclarationSignatures(typeDeclaration)!);
                return flags ? { base: flags, derives: [] } : void 0;
            } else if (typeArgument.typeName.name === 'Derive' && typeArgument.typeArguments) {
                const deriveArgs = typeArgument.typeArguments.params;
                const errors = [];
                const derivedFlags: { name: string | undefined; flags: FlagsInterface }[] = [];

                let baseFlags!: Flags;

                // e.g Derive
                // tuple: [ Reference | ObjectLiteral ]
                // type: Reference | ObjectLiteral
                if (deriveArgs.length === 2 && deriveArgs[0]?.type === 'TSTupleType' && (deriveArgs[1]?.type === 'TSTypeLiteral' || deriveArgs[1]?.type === 'TSTypeReference')) {
                    const [tuple, type] = deriveArgs;
                    if (type.type === 'TSTypeLiteral') {
                        const flags = Flags.fromSignatures(type.members);
                        if (!flags) {
                            return
                        }

                        baseFlags = flags;

                    } else if (type.type === 'TSTypeReference' && type.typeName.type === 'Identifier') {
                        const typeName = type.typeName.name;
                        const localLiteral = typeDecs[typeName]?.typeAnnotation;
                        if (localLiteral) {
                            const flags = Flags.fromSignatures(localLiteral.members);
                            if (!flags) {
                                return;
                            }

                            baseFlags = flags;

                        } else {
                            errors.push(DeriveError.RefNotFound(self.path, typeName))
                        }
                    }

                    // time to resolve derives
                    const derives = tuple.elementTypes;
                    const queuedDerives = [];
                    for (let i = 0; i < derives.length; i++) {
                        const element = derives[i]!;
                        if (element.type === 'TSTypeLiteral') {
                            const flags = Flags.fromSignatures(element.members);
                            if (!flags) {
                                break;
                            }
                            derivedFlags.push({ name: void 0, flags: flags });
                        } else if (element.type === 'TSTypeReference' && element.typeName.type === 'Identifier') {
                            const lookupName = element.typeName.name;
                            const localType = this.#types[lookupName];

                            if (localType) {
                                // TODO: add to trait flags instead of adding flags right here
                                const flags = Flags.fromSignatures(localType.typeAnnotation.members);
                                if (!flags) {
                                    break;
                                }

                                queuedDerives.push({ name: localType.id.name, flags: flags });
                            } else {
                                const importVar = self.importVar(lookupName);
                                if (importVar) {
                                    const actual = project.resolveReferenceFromOtherFile(project, self.directory, importVar, lookupName);
                                    if (actual && !actual.errored) {
                                        queuedDerives.push({ name: actual.name, flags: actual.flags });
                                    } else {
                                        errors.push(DeriveError.RefNotFound(self.path, lookupName));
                                        break;
                                    }
                                } else {
                                    errors.push(DeriveError.RefNotFound(self.path, lookupName))
                                    break;
                                }
                            }
                        }
                    }

                    if (derives.length === queuedDerives.length) {
                        derivedFlags.push(...queuedDerives);
                    } else {
                        errors.push(DeriveError.InvalidDeriveType(self.path, traitName, self.#result.originalCode.slice(typeArgument.start, typeArgument.end)))
                    }

                } else {
                    errors.push(DeriveError.InvalidDeriveType(self.path, traitName, self.#result.originalCode.slice(typeArgument.start, typeArgument.end)))
                }

                console.log('PARSE REFERENCE', traitName, errors.length, baseFlags.names, derivedFlags.flatMap(d => d.flags.names));


                if (!errors.length) {
                    return { base: baseFlags, derives: derivedFlags }
                } else {
                    errors.push(DeriveError.InvalidDeriveType(self.path, traitName, self.#result.originalCode.slice(typeArgument.start, typeArgument.end)))
                    return errors;
                }

            }
        } else {
            // errors.push(`trait type argument must equal trait type declaration (references an unknown type ${typeArgument.typeName.type === 'Identifier' ? typeArgument.typeName.name : ''}, but expected ${typeDeclaration?.id.name ?? name})`);
        }
    }

    importVar(name: string) {
        return this.#importVars[name];
    }
}

function check(property: any, flags: FlagsInterface) {
    if (property.type === 'Property') {
        const { type: keyType } = property.key;
        const type = property.value.type;
        if (keyType !== 'Identifier') {
            return false;
        } else if (
            type !== 'FunctionExpression'
            && type !== 'Literal'
            && type !== 'TemplateLiteral'
        ) {
            return false;
        } else if (!flags.has(property.key.name, STATIC | DEFAULT)) {
            return false;
        }
    } else {
        const properties = property.properties;
        for (let i = 0; i < properties.length; i++) {
            const p = properties[i]!;
            if (p.type === 'SpreadElement') {
                return false;
            } else if (
                p.value.type !== 'FunctionExpression'
            ) {
                return false;
            } else if (p.key.type === 'Identifier' && !flags.has(p.key.name, INSTANCE | DEFAULT)) {
                return false;
            }
        }
    }
    return true;

}

function parseTraitImplementation(properties: TraitObjectProperty[], flags: FlagsInterface): DefaultMethods | undefined {
    const defaultMethods = new DefaultMethods();
    let valid = true;
    for (let i = 0; i < properties.length; i++) {
        const prop = properties[i]!;
        const propName = prop.key.name;

        if (propName === 'instance' && prop.value.type === 'ObjectExpression') {
            if (!check(prop.value, flags)) {
                valid = false;
                break;
            }
            defaultMethods.add(propName, prop.value.start, prop.end);
        } else {
            if (!check(prop, flags)) {
                valid = false;
                break
            }
            defaultMethods.add(propName, prop.start, prop.end);
        }
    }

    return valid ? defaultMethods : void 0;
}

interface Frame {
    isIndex: boolean;
    file: TraitFile;
}

class Stack {
    #stack: Frame[];
    #ids: Map<FilePath, number>;
    constructor(initial: Frame) {
        this.#stack = [initial];
        this.#ids = new Map([[initial.file.path, 0]]);
    }

    get length() {
        return this.#stack.length;
    }

    push(frame: Frame): number {
        const id = this.#stack.length;
        this.#ids.set(frame.file.path, id);
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

type ResolvedRef = TraitDefinition | { name: string | undefined; flags: FlagsInterface };

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

        return new Stack({ isIndex: true, file: new TraitFile(result) });
    }

    initialize() {
        const project = this,
            files = project.#files;

        for (let i = 0; i < files.length; i++) {
            files[i]!.initialize(project);
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


    getDerivesOfTrait(project: Project, localTypes: TraitTypeExports, importRegistry: ImportRegistry, derives: UnresolvedDerivesOfTrait, directory: string): { name: string | undefined; flags: FlagsInterface }[] | undefined {
        const resolved: ResolvedRef[] = [];
        for (let i = 0; i < derives.length; i++) {
            const type = derives[i]!;
            if (type.type === 'TSTypeLiteral') {
                const flags = Flags.fromSignatures(type.members);
                if (!flags) {
                    return;
                }

                resolved.push({ name: void 0, flags: flags });
            } else {
                if (type.typeName.type !== 'Identifier') {
                    return

                }

                let ref;
                if (type.typeName.name === 'Infer' && type.typeArguments && type.typeArguments.params[0]?.type === 'TSTypeQuery' && type.typeArguments.params[0].exprName.type === 'Identifier') {
                    const typeQuery = type.typeArguments.params[0];
                    // @ts-expect-error
                    const typeName = typeQuery.exprName.name;
                    ref = project.resolveRef(project, localTypes, importRegistry, directory, typeName);

                } else {
                    ref = project.resolveRef(project, localTypes, importRegistry, directory, type.typeName.name);
                }

                if (ref) {
                    if (ref instanceof TraitDefinition) {
                        if (ref.errored) {
                            return
                        }
                        resolved.push(ref);

                    } else {
                        resolved.push(ref);
                    }

                }
            }

        }

        return resolved;
    }

    resolveRef(project: Project, localTypes: TraitTypeExports, importRegistry: ImportRegistry, directory: string, lookupName: string):
        ResolvedRef | undefined {
        const localType = localTypes[lookupName];
        if (localType) {
            const flags = Flags.fromSignatures(localType.typeAnnotation.members);
            if (!flags) {
                return;
            }

            return { name: localType.id.name, flags: flags };
        } else {
            const importVar = importRegistry[lookupName];
            if (importVar) {
                const actual = project.resolveReferenceFromOtherFile(project, directory, importVar, lookupName);
                if (actual) {
                    return actual;
                }
            }
        }
    }

    resolveReferenceFromOtherFile(project: Project, directory: string, importVar: ModuleImport, localName: string) {
        const resolver = project.resolver;
        const resolvedRequest = resolver.sync(directory, importVar.moduleRequest);
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

async function scanFile(project: Project, stack: Stack, frame: Frame) {
    const vars: TraitExports = {};
    const types: TraitTypeExports = {};
    const file = frame.file;
    const exportNames = await file.register(project.resolver, stack, frame, file, project.indexFilter);
    const uninitialized: UninitializedTraits = Object.create(null);

    if (VERBOSE) {
        print('Frame', file.path);
    }


    if (VERBOSE) {
        console.log('-'.repeat(32));
    }

    walk(frame.file.result.program, {
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
