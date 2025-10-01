import type { Node, ObjectPropertyKind, TSTupleElement, TSTypeAliasDeclaration, TSTypeReference } from "oxc-parser";
import type { ResolverFactory } from "oxc-resolver";
import { TraitError } from "./error";
import { Flags, type FlagsInterface } from "./flags";
import { typeDeclarationSignatures, type TraitAliasDeclaration, type TypeArguments } from "./node";
import type { ParseFileResultResult } from "./types";
import { TraitDefinition } from "./definition";
import { Registry, type ReExportRegistry } from "./registry";
import type { DefaultMethods } from "./default-methods";
import { print } from "./helpers";
import type { Project } from "./project";
import type { Stack } from "./stack";
import { checkParseResult, tryResolveSync, resolve } from "./resolver";
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
        return this.#result.originalRequest;
    }

    get name() {
        return this.#result.name;
    }

    get result() {
        return this.#result.result;
    }

    async register(
        resolver: ResolverFactory,
        stack: Stack<TraitFile>,
        indexFilter: string,
    ) {
        const self = this;
        const originalRequest = self.#result.originalRequest;
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
                const resolveResult = tryResolveSync(resolver, originalRequest, path);
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
                const resolveResult = tryResolveSync(resolver, originalRequest, path);
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

    // #constructFlagsFor(self: TraitFile, typeArgument: Node) {

    //     if (typeArgument.type === 'TSTypeLiteral') {
    //         const flags = Flags.fromSignatures(typeDeclarationSignatures(typeArgument)!);
    //         return !flags ? [TraitError.CannotConstructFlags()] : flags;
    //         // case 'TSTypeReference' 
    //     } else if (typeArgument.type === 'TSTypeReference') {
    //         if (typeArgument.typeName.type !== 'Identifier') {
    //             return [TraitError.IdentifierNeLiteral(typeArgument, self.#result.originalCode)];
    //         } else {
    //             const typeDeclaration = self.#types[typeArgument.typeName.name];
    //             if (
    //                 // e.g trait<Foo>
    //                 // this type is a reference for the trait type alias declaration,
    //                 // so we can retrieve it and parse it directly
    //                 typeDeclaration && typeDeclaration.typeAnnotation.type === 'TSTypeLiteral'
    //             ) {
    //                 const flags = Flags.fromSignatures(typeDeclarationSignatures(typeDeclaration)!);
    //                 return flags ? flags : [TraitError.CannotConstructFlags()];
    //             } else {
    //                 return [TraitError.CannotConstructFlags()];
    //             }

    //             // TODO: parse 
    //             // const flags = self.#parseTraitTypeArgumentReference(project, self, traitName, self.#types, typeArgument, typeDeclaration);
    //             // return flags ?? [TraitError.CannotConstructFlags()];
    //         }
    //     } else {
    //         return [TraitError.CannotConstructFlags()];
    //     }
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
                return !flags ? [TraitError.CannotConstructFlags()] : flags;
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
                    return flags ? flags : [TraitError.CannotConstructFlags()];
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

    addUninitializedTraits(traits: Record<string, TraitDefinition>) {
        this.#traits = traits;
    }

    parseDerives(project: Project) {

        const self = this;
        const traits = self.#traits;

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

            console.log('parsing derives for ', def.name);
            const derives = self.constructDeriveFlags(project, self, uninitDerives);
            if (derives.valid) {
                console.log('base: ', def.flags.names);
                if (derives.derives.length) {
                    // console.log('derives: ', derives.derives.map(d => d.flags.names));

                    if (def.flags.isDisjointFromDerives(derives.derives.flatMap(d => d.flags))) {
                        def.join(derives.derives);
                        console.log('joined names: ', def.flags.names);
                    } else {
                        console.log('[derive:failedOnJoin]: ', traitName);

                    }
                }


            } else {
                // console.log('[fail]: %s ', traitName);
                def.invalidate();
            }

        }
    }

    initializeTraitBaseFlags() {
        if (this.name.endsWith('.ts')) {
            print('parse:file', `${this.name}`);

        }

        const self = this,
            types = self.#types,
            traits = self.#traits,
            bar = '-'.repeat(32);

        // if (VERBOSE) {
        //     print('Initialize', self.path);
        // }

        const errors: Record<string, TraitError[]> = {};

        const parseInstanceProperties = (
            defaultMethods: DefaultMethods,
            properties: ObjectPropertyKind[],
            defaultInstance: Set<string>,
            requiredInstance: Set<string>,
            unknownInstance: { type: string; start: number; end: number, name?: string }[],
            err_requiredInstanceNames: string[]
        ) => {
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

        for (const name in traits) {
            print('parse:trait', `${name}`);
            // const { base: baseType, derives, start, end } = uninitialized[name]!;

            const definition_errors: TraitError[] = [];


            // TODO: add this part to `walk` in `project::Project`
            // const node = uninit.trait.node;
            // const parent = uninit.trait.parent;
            // const typeDeclaration = uninit.typeDeclaration;
            // const declarator = node.declarations[0];
            // const start = parent.start;
            // const end = parent.end;

            // TODO: use importName of "trait" instead of hard-coded here
            // if (declarator.init.type === 'CallExpression' && declarator.init.callee.name === 'trait') {
            //     const call_expr = declarator.init;
            //     const args = call_expr.arguments;

            //     if (args.length !== 1) {
            //         definition_errors.push(TraitError.InvalidTraitCallArguments());
            //         errors[name] = definition_errors;
            //         continue;
            //     }

            // !PARSE
            // const base = self.parseBase(self, call_expr.typeArguments.params, typeDeclaration);

            // if (Array.isArray(base)) {
            //     definition_errors.push(...base);
            //     continue;
            // }

            // !PARSE


            // ! Create DerivedFlags
            // const parsedFlags = self.#parseTraitTypeArgument(project, self, declarator.id.name, types, call_expr.typeArguments.params[0], typeDeclaration);
            // if (Array.isArray(parsedFlags)) {
            //     // console.log(parsedFlags.map(f => format('', f.message, '    ', `(${f.name}) - `)).join('\n'));
            //     definition_errors.push(...parsedFlags);
            //     errors[name] = definition_errors;
            //     continue
            // }

            // const flags = Flags.withDerives(parsedFlags.base, parsedFlags.derives);
            // ! Create DerivedFlags
            // ! Parse ObjectExpression
            // const traitObject = call_expr.arguments[0];
            // const properties = traitObject.properties;

            // const defaultMethods = new DefaultMethods();
            // const defaultStatic = flags.staticDefaultNames;
            // const defaultInstance = flags.instanceDefaultNames;
            // const requiredStatic = flags.staticRequiredNames;
            // const requiredInstance = flags.instanceRequiredNames;

            // const unknownStatic: Span[] = [];
            // const unknownInstance: Array<{
            //     type: 'SpreadAssigment' | 'KeyNeIdentifier' | 'DefinesRequired';
            //     start: number;
            //     end: number
            // }> = [];

            // const err_requiredStaticNames: string[] = [];
            // const err_requiredInstanceNames: string[] = [];

            // for (let i = 0; i < properties.length; i++) {
            //     const property = properties[i]!;
            //     const propertyName = property.key.name;

            //     if (property.value.type === 'FunctionExpression') {
            //         if (requiredStatic.has(propertyName)) {
            //             err_requiredStaticNames.push(propertyName);
            //             continue
            //         }

            //         if (defaultStatic.has(propertyName)) {
            //             defaultMethods.add(propertyName, property.start, property.end);
            //         }

            //     } else if (propertyName === 'instance' && property.value.type === 'ObjectExpression') {
            //         const instanceProperties = property.value.properties;
            //         parseInstanceProperties(defaultMethods, instanceProperties, defaultInstance, requiredInstance, unknownInstance, err_requiredInstanceNames);
            //     } else {
            //         unknownStatic.push({
            //             start: property.key.start,
            //             end: property.key.end
            //         })
            //     }
            // }

            // ! Parse ObjectExpression


            // traits[name] = new TraitDefinition(
            //     name,
            //     start,
            //     end,
            //     base,
            // );

            console.log(`validated(${name})`);


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

        }

        // }
    }

    trait(name: string) {
        return this.#traits[name];
        // const index = this.#varIds[name];
        // return index == null ? void 0 : this.#uninitMeta[index];
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
                    if (!flags) {
                        break;
                    }

                    queuedDerives.push({
                        name: localType.id.name,
                        path: self.path,
                        flags: flags
                    });
                } else {
                    const importVar = self.importVar(lookupName);
                    const importType = self.importType(lookupName);
                    if (importVar) {
                        const actual = project.resolveReferenceFromRequest(project, self.directory, importVar, lookupName);
                        // console.log('CONSTRUCT IMPORT VAR', actual?.name, actual?.errored);

                        if (actual && !actual.errored) {
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

    #constructFlagsFromDerivesAndBase(project: Project, tuple: TSTupleElement[], baseFlags: FlagsInterface) {
        const self = this;
        const errors = [];
        const derivedFlags: { name: string; flags: FlagsInterface }[] = [];

        // time to resolve derives
        const queuedDerives = [];
        for (let i = 0; i < tuple.length; i++) {
            const element = tuple[i]!;
            if (element.type === 'TSTypeReference' && element.typeName.type === 'Identifier') {
                const lookupName = element.typeName.name;
                const localType = this.#types[lookupName];
                if (localType) {
                    const flags = this.#traits[lookupName]?.baseFlags
                    if (!flags) {
                        // TODO: derive error: local trait was not parsed successfully 
                        break;
                    }

                    queuedDerives.push({ name: localType.id.name, flags: flags });
                } else {
                    const importVar = self.importVar(lookupName);
                    if (importVar) {
                        const actual = project.resolveReferenceFromRequest(project, self.directory, importVar, lookupName);
                        if (actual && !actual.errored) {
                            queuedDerives.push({ name: actual.name, flags: actual.flags });
                        } else {
                            errors.push(TraitError.RefNotFound(self.path, lookupName));
                            break;
                        }
                    } else {
                        errors.push(TraitError.RefNotFound(self.path, lookupName))
                        break;
                    }
                }
            }
        }

        if (tuple.length === queuedDerives.length) {
            derivedFlags.push(...queuedDerives);
        } else {
            errors.push(TraitError.InvalidDeriveType())
        }

        if (!errors.length) {
            return { base: baseFlags, derives: derivedFlags }
        } else {
            errors.push(TraitError.InvalidDeriveType())
            return errors;
        }
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
                            errors.push(TraitError.RefNotFound(self.path, typeName))
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
                                    const actual = project.resolveReferenceFromRequest(project, self.directory, importVar, lookupName);
                                    if (actual && !actual.errored) {
                                        queuedDerives.push({ name: actual.name, flags: actual.flags });
                                    } else {
                                        errors.push(TraitError.RefNotFound(self.path, lookupName));
                                        break;
                                    }
                                } else {
                                    errors.push(TraitError.RefNotFound(self.path, lookupName))
                                    break;
                                }
                            }
                        }
                    }

                    if (derives.length === queuedDerives.length) {
                        derivedFlags.push(...queuedDerives);
                    } else {
                        errors.push(TraitError.InvalidDeriveType())
                    }

                } else {
                    errors.push(TraitError.InvalidDeriveType())
                }

                if (!errors.length) {
                    return { base: baseFlags, derives: derivedFlags }
                } else {
                    errors.push(TraitError.InvalidDeriveType())
                    return errors;
                }
            }
        } else {
            // errors.push(`trait type argument must equal trait type declaration (references an unknown type ${typeArgument.typeName.type === 'Identifier' ? typeArgument.typeName.name : ''}, but expected ${typeDeclaration?.id.name ?? name})`);
        }
    }

    importVar(name: string) {
        return this.#registry.type === 'file' ? this.#registry.importVars[name] : void 0;
    }


    importType(name: string) {
        return this.#registry.type === 'file' ? this.#registry.importTypes[name] : void 0;
    }
}