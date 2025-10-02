import type { Node, Span, TSTupleElement, TSTypeAliasDeclaration, ObjectPropertyKind } from "oxc-parser";
import type { ResolverFactory } from "oxc-resolver";
import { typeDeclarationSignatures, type TraitAliasDeclaration, type TraitObjectProperty, type TypeArguments } from "./node";
import { TraitError } from "./error";
import { Flags, type FlagsInterface, type NameSet } from "./flags";
import type { ParseFileResultResult } from "./types";
import { TraitDefinition } from "./definition";
import type { Stack } from "./stack";
import { Registry, type FileRegistry, type ReExportRegistry } from "./registry";
import { checkParseResult, resolve } from "./resolver";
import type { Project } from "./project";
import { DefaultMethods } from "./default-methods";

export type TraitTypeExports = Record<string, TraitAliasDeclaration>;
export type RegisterReExportsFn = (types: ReExportRegistry, vars: ReExportRegistry) => Promise<void>;
export type UninitializedTraits = Record<string, {
    start: number;
    end: number;
    base: FlagsInterface;
    derives: TSTupleElement[];
}>

export class TraitFile {
    #result: ParseFileResultResult;

    #types: TraitTypeExports;

    #traits: Record<string, TraitDefinition>;

    #registry: Registry;

    constructor(result: ParseFileResultResult, registry: Registry) {
        this.#result = result;
        this.#registry = registry;
        this.#traits = {};
        this.#types = {};
    }

    get path() {
        return this.#result.path;
    }

    get directory() {
        return this.#result.directory;
    }

    get name() {
        return this.#result.name;
    }

    get result() {
        return this.#result.result;
    }

    get code() {
        return this.#result.originalCode;
    }

    async register(
        resolver: ResolverFactory,
        stack: Stack<TraitFile>,
        indexFilter: string,
    ) {
        const self = this;
        const directory = self.#result.directory;
        const current = self.result;
        const staticImports = current.module.staticImports;
        const staticExports = current.module.staticExports;

        const r = self.#registry;
        if (r.type === 'index') {
            const reExportTypes = r.types;
            const reExportVars = r.vars;

            for (let i = staticExports.length - 1; i >= 0; i--) {
                const entries = staticExports[i]?.entries!;
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
                                type: 're-export',
                                moduleRequest: moduleRequest.value,
                                entries: [],
                            };
                        }
                        r[request]!.entries.push(entry);
                    } else {
                        //    Error: local definition are not allowed in index files
                    }
                }
            }

            for (const path in reExportTypes) {
                const resolveResult = resolver.sync(directory, path);
                const absolutePath = resolveResult?.path;
                if (absolutePath && !stack.visited(absolutePath)) {
                    const newParseResult = await resolve(resolver, absolutePath, indexFilter);
                    checkParseResult(newParseResult, absolutePath);
                    const isIndex = newParseResult.path.endsWith(indexFilter);
                    const m = newParseResult.result.module;
                    stack.push(newParseResult.path, new TraitFile(newParseResult, isIndex ? Registry.Index(stack, resolver, m.staticExports) : Registry.File(m.staticImports, m.staticExports)));
                }
            };

            for (const path in reExportVars) {
                const resolveResult = resolver.sync(directory, path);
                const absolutePath = resolveResult?.path;

                if (absolutePath && !stack.visited(absolutePath)) {
                    const newResult = await resolve(resolver, absolutePath, path);
                    checkParseResult(newResult, absolutePath);
                    const isIndex = newResult.path.endsWith(indexFilter);
                    const m = newResult.result.module;
                    stack.push(newResult.path, new TraitFile(newResult, isIndex ? Registry.Index(stack, resolver, m.staticExports) : Registry.File(m.staticImports, m.staticExports)));
                }
            }
        } else {
            const importTypes = r.importTypes;
            const importVars = r.importVars;

            const exportTypes = r.exportTypes;
            const exportVars = r.exportVars;

            const exportNames = new Set<string>();

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
                            exportNames.add(bindingName);
                        }
                    }
                }
            }

            return exportNames;
        }

        // const importStart: number[] = [];
        // const importEnd: number[] = [];
        // const exportStart: number[] = [];
        // const exportEnd: number[] = [];

        // const importNames = new Set<string>();

    }

    // importVar(name: string) {
    //     return this.#registry.type === 'file' ? this.#registry.importVars[name] : void 0;
    // }

    // importType(name: string) {
    //     return this.#registry.type === 'file' ? this.#registry.importTypes[name] : void 0;
    // }

    parseBase(self: TraitFile, typeArguments: TypeArguments['params'], typeDeclaration: TSTypeAliasDeclaration | undefined): { base: FlagsInterface; derives: TSTupleElement[] } | TraitError[] {
        if (!typeArguments.length) {
            return [TraitError.EmptyTraitTypeArguments()];
        } else if (typeArguments.length > 1) {
            return [TraitError.MultipleTraitTypeArguments()];
        }

        const flagsFor = (typeArgument: Node) => {
            if (typeArgument.type === 'TSTypeLiteral') {
                const flags = Flags.fromSignatures(typeDeclarationSignatures(typeArgument)!);
                return !(flags instanceof Flags) ? [TraitError.CannotConstructFlags()] : flags;
                // case 'TSTypeReference' 
            } else if (typeArgument.type === 'TSTypeReference') {
                if (typeArgument.typeName.type !== 'Identifier') {
                    return [TraitError.IdentifierNeLiteral(typeArgument, self.#result.originalCode)];
                } else if (
                    // e.g trait<Foo>
                    // this type is a reference for the trait type alias declaration,
                    // so we can retrieve it and parse it directly
                    typeArgument.typeName.name === typeDeclaration?.id.name
                    && typeDeclaration.typeAnnotation.type === 'TSTypeLiteral'
                ) {
                    const flags = Flags.fromSignatures(typeDeclarationSignatures(typeDeclaration)!);
                    console.log('PARSE BASE FLAGS FOR', typeDeclaration.id.name, flags instanceof Flags ? true : flags.errors.map(e => e.kind));

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
                return f instanceof Flags ? { base: f, derives: [] } : f;
            } else {
                const tupleTypes = typeArgument.elementTypes;
                if (!tupleTypes.length) {
                    return [TraitError.CannotConstructFlags()];
                } else if (tupleTypes.length === 1 && tupleTypes[0]) {
                    const f = flagsFor(tupleTypes[0]);
                    return f instanceof Flags ? { base: f, derives: [] } : f;
                } else {
                    const baseType = tupleTypes.at(-1);

                    if (!baseType) {
                        return [TraitError.CannotConstructFlags()];
                    }


                    const f = flagsFor(baseType);
                    return f instanceof Flags ? {
                        base: f,
                        derives: tupleTypes.slice(0, tupleTypes.length - 1)
                    } : f;
                    // return !baseType ?
                    // [TraitError.CannotConstructFlags()] :
                    // {base: flagsFor(baseType), tupleTypes.slice(0, tupleTypes.length - 1)}
                }
            }
        }

        return [TraitError.CannotConstructFlags()];

    }

    addDefinitions(traits: Record<string, TraitDefinition>) {
        this.#traits = traits;
    }

    parseDerives(project: Project) {
        const self = this;
        const traits = self.#traits,
            types = self.#types,
            { importTypes, importVars } = self.#registry as FileRegistry,
            path = self.path


        const errors: Record<string, TraitError[]> = {};
        // console.log('PARSE:DERIVE [ %s ]', this.path);

        for (const traitName in traits) {
            // console.log('PARSE-DERIVES: ', traitName);
            const def = traits[traitName]!;
            const uninitDerives = def.uninitializedDerives;

            if (!uninitDerives.every(t => t.type === 'TSTypeReference')) {
                errors[traitName] = [TraitError.InvalidDeriveType()];
                continue;
            }

            // console.log('constructing derived flags for', traitName);

            console.log('parsing derives for ', def.name, def.flags.names);

            const derives = project.constructDeriveFlags(
                project,
                importTypes,
                importVars,
                types,
                traits,
                uninitDerives,
                path
            );
            if (derives.valid) {
                if (derives.derives.length) {
                    // console.log('derives: ', derives.derives.map(d => d.flags.names));

                    if (def.flags.isDisjointFromDerives(derives.derives.flatMap(d => d.flags))) {
                        console.log('joined names before: ', def.flags.names);
                        def.join(derives.derives);
                        console.log('joined names after: ', def.flags.names);
                    } else {
                        console.log('[derive:failedOnJoin]: ', traitName);

                    }
                }


            } else {
                console.log('[fail]: %s ', traitName);
                def.invalidate();
            }

        }
    }

    #parseInstanceProperties(
        defaultMethods: DefaultMethods,
        properties: ObjectPropertyKind[],
        defaultInstance: NameSet,
        requiredInstance: NameSet,
        unknownInstance: { type: string; start: number; end: number, name?: string }[],
        err_requiredInstanceNames: string[]
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

            if (requiredInstance.has(key.name)) {
                err_requiredInstanceNames.push(key.name);
            } else if (defaultInstance.has(key.name)) {
                defaultMethods.add(key.name, instanceProperty.start, instanceProperty.end);
            } else {
                unknownInstance.push({ type: 'NotRegisteredInTrait', start: instanceProperty.start, end: instanceProperty.end, name: key.name });
            }
        }
    }

    checkTraitObjectExpression(flags: FlagsInterface, properties: TraitObjectProperty[]) {

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

        const err_requiredStaticNames: string[] = [];
        const err_requiredInstanceNames: string[] = [];

        for (let i = 0; i < properties.length; i++) {
            const property = properties[i]!;
            const propertyName = property.key.name;

            if (property.value.type === 'FunctionExpression') {
                if (requiredStatic.has(propertyName)) {
                    err_requiredStaticNames.push(propertyName);
                    continue
                }

                if (defaultStatic.has(propertyName)) {
                    defaultMethods.add(propertyName, property.start, property.end);
                }

            } else if (propertyName === 'instance' && property.value.type === 'ObjectExpression') {
                const instanceProperties = property.value.properties;
                this.#parseInstanceProperties(defaultMethods, instanceProperties, defaultInstance, requiredInstance, unknownInstance, err_requiredInstanceNames);
            } else {
                unknownStatic.push({
                    start: property.key.start,
                    end: property.key.end
                })
            }
        }

        // ! Parse ObjectExpression

        // console.log(`validated(${name})`);


        // if (!unknownStatic.length && !unknownInstance.length) {
        // print('valid', 'true', 4);
        // let str = `validated(${name})\n`;
        // str += `    constants: [ ${flags.namesOfType(CONST).join(', ')} ]\n`;
        // str += `    static: [ ${flags.namesOfType(STATIC).join(', ')} ]\n`;
        // str += `    instance: [ ${flags.namesOfType(INSTANCE).join(', ')} ]\n`;
        // str += `    default: [ ${flags.namesOfType(DEFAULT).join(', ')} ]\n`;
        // str += `    required: [ ${flags.namesOfType(REQUIRED).join(', ')} ]\n`;
        // console.log(str);
        // } else {

        //     const staticCount = unknownStatic.length;
        //     const instanceCount = unknownInstance.length;
        //     const errCount = staticCount + instanceCount;

        //     if (!VERBOSE) {
        //         console.log(`%s has %s errors (%s static errors, %s instance errors)`, name, errCount, staticCount, instanceCount);
        //     } else {
        //         const code = self.#result.originalCode;
        //         let str = `${name} has (${errCount}) errors...`;
        //         str += `  with ${staticCount} static errors...`;
        //         for (const { start, end } of unknownStatic) {
        //             str += `\n    code: ${getCode(code, start, end)}`;
        //         }

        //         str += `  with ${instanceCount} instance errors...`;
        //         for (const { start, end } of unknownInstance) {
        //             str += `\n    type: ${node.type}: ${getCode(code, start, end)}`;
        //         }

        //         console.log(str);


        //     }
        //     // }
        // }

        // }

        // }
    }


    trait(name: string) {
        return this.#traits[name];
    }

    constructDeriveFlags(project: Project, self: TraitFile, derives: TSTupleElement[]) {
        // time to resolve derives
        const errors: TraitError[] = [];
        const queuedDerives: { name: string; path?: string; flags: FlagsInterface }[] = [];
        for (let i = 0; i < derives.length; i++) {
            const element = derives[i]!;
            if (element.type === 'TSTypeReference' && element.typeName.type === 'Identifier') {
                const lookupName = element.typeName.name;
                if (self.#traits[lookupName]) {
                    const t = self.#traits[lookupName]!;
                    console.log('Pushing local trait: ', t.name);
                    queuedDerives.push(t);
                } else if (self.#types[lookupName]) {
                    const localType = self.#types[lookupName];
                    // TODO: add to trait flags instead of adding flags right here
                    const flags = Flags.fromSignatures(localType.typeAnnotation.members);
                    console.log('construct:localType', lookupName);

                    if (!(flags instanceof Flags)) {
                        break;
                    }

                    queuedDerives.push({
                        name: localType.id.name,
                        path: self.path,
                        flags: flags
                    });
                } else {
                    const importVar = self.#registry.type === 'file' ? self.#registry.importVars[lookupName] : void 0;
                    const importType = self.#registry.type === 'file' ? self.#registry.importTypes[lookupName] : void 0;
                    if (importVar) {
                        const actual = project.resolveReferenceFromRequest(project, self.directory, importVar, lookupName);
                        console.log('construct:importvar', actual?.name, actual?.valid);
                        if (actual && actual.valid) {
                            // console.log('Pushing imported: ', actual.name);
                            queuedDerives.push(actual);
                        } else {
                            errors.push(TraitError.RefNotFound(self.path, lookupName));
                            break;
                        }
                    } else if (importType) {

                    } else {
                        errors.push(TraitError.RefNotFound(self.path, lookupName))
                        break;
                    }
                }
            }
        }

        if (derives.length !== queuedDerives.length) {
            errors.push(TraitError.InvalidDeriveType());
            return { valid: false, errors: errors } as const;
        }

        return { valid: true, derives: queuedDerives } as const;
    }

}