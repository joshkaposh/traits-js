import type { Node, Span, TSTupleElement, TSTypeAliasDeclaration, ObjectPropertyKind, ExportNamedDeclaration, TSTypeLiteral, TSTypeReference } from "oxc-parser";
import { visitorKeys } from 'oxc-parser';
import type { ResolverFactory } from "oxc-resolver";
import * as eslintScope from 'eslint-scope';
import { isDeclaredInModule, typeDeclarationSignatures, type TraitAliasDeclaration, type TraitDeclaration, type TraitObjectExpression, type TraitObjectProperty, type TypeArguments } from "./node";
import { TraitError } from "./error";
import { Flags, type FlagsInterface, type NameSet } from "./flags";
import type { ParseFileResultResult } from "./types";
import { TraitDefinition } from "./definition";
import type { Stack } from "./stack";
import { Registry, type FileRegistry, type ReExportRegistry } from "./registry";
import { checkParseResult, resolve } from "./resolver";
import type { Project } from "./project";
import { DefaultMethods } from "./default-methods";
import { walk } from "oxc-walker";
import { print } from "./helpers";

export type TraitTypeExports = Record<string, TraitAliasDeclaration>;
export type ExportedTraitDeclaration = {
    parent: ExportNamedDeclaration;
    node: TraitDeclaration;
    type?: TSTypeLiteral | TSTypeReference;
};

export type TraitExports = Record<string, ExportedTraitDeclaration>;

const TRAIT_FN_NAME = 'trait';

export type RegisterReExportsFn = (types: ReExportRegistry, vars: ReExportRegistry) => Promise<void>;
export type UninitializedTraits = Record<string, {
    start: number;
    end: number;
    base: FlagsInterface;
    derives: TSTupleElement[];
}>;


export class TraitFile {
    traits: ReadOnlyDict<TraitDefinition> = Object.create(null);

    #result: ParseFileResultResult;

    #vars: TraitExports;
    #types: TraitTypeExports;


    #registry: Registry;

    constructor(result: ParseFileResultResult, registry: Registry) {
        this.#result = result;
        this.#registry = registry;
        this.traits = {};
        this.#vars = {};
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

    get registry() {
        return this.#registry;
    }

    initialize(project: Project, traits: Record<string, TraitDefinition>, errors: Record<string, TraitError[]>) {
        const self = this;
        self.#collectTraitBindings(project, traits, errors);


        const ast = self.#result.result.program as any
        const scopeManager = eslintScope.analyze(ast, {
            ecmaVersion: 2022,
            childVisitorKeys: visitorKeys,
            impliedStrict: true,
            ignoreEval: true,
            sourceType: 'module'
        });

        const programScope = scopeManager.acquire(ast);

        self.traits = Object.freeze(traits);
        project.parseDerives(traits, self.#registry as FileRegistry, self.path);
    }

    // #parseInstanceProperties(
    //     defaultMethods: DefaultMethods,
    //     properties: ObjectPropertyKind[],
    //     defaultInstance: NameSet,
    //     requiredInstance: NameSet,
    //     unknownInstance: { type: string; start: number; end: number, name?: string }[],
    //     err_requiredInstanceNames: string[]
    // ) {
    //     for (let i = 0; i < properties.length; i++) {
    //         const instanceProperty = properties[i]!;
    //         if (instanceProperty.type === 'SpreadElement') {
    //             unknownInstance.push({ type: 'SpreadAssigment', start: instanceProperty.start, end: instanceProperty.end });
    //             continue;
    //         }

    //         const key = instanceProperty.key;
    //         if (key.type !== 'Identifier') {
    //             unknownInstance.push({
    //                 type: 'KeyNeIdentifier',
    //                 start: instanceProperty.key.start,
    //                 end: instanceProperty.key.end,
    //             });
    //             continue;
    //         }

    //         if (key.name in requiredInstance) {
    //             err_requiredInstanceNames.push(key.name);
    //         } else if (key.name in defaultInstance) {
    //             defaultMethods.add(key.name, instanceProperty.start, instanceProperty.end);
    //         } else {
    //             unknownInstance.push({ type: 'NotRegisteredInTrait', start: instanceProperty.start, end: instanceProperty.end, name: key.name });
    //         }
    //     }
    // }

    checkTraitObjectExpression(flags: FlagsInterface, properties: TraitObjectProperty[]) {

        const defaultMethods = new DefaultMethods();

        const hasDefault = (name: string, prefix: 'static' | 'instance') => name in flags.byName[`${prefix}Default`] || name in flags.derivesByName[`${prefix}Default`];
        const hasRequired = (name: string, prefix: 'static' | 'instance') => name in flags.byName[`${prefix}Required`] || name in flags.derivesByName[`${prefix}Required`];

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
                if (hasRequired(propertyName, 'static')) {
                    err_requiredStaticNames.push(propertyName);
                    continue
                }

                if (hasDefault(propertyName, 'static')) {
                    defaultMethods.add(propertyName, property.start, property.end);
                }

            } else if (propertyName === 'instance' && property.value.type === 'ObjectExpression') {
                const instanceProperties = property.value.properties;
                // TODO: fix me
                // this.#parseInstanceProperties(defaultMethods, instanceProperties, defaultInstance, requiredInstance, unknownInstance, err_requiredInstanceNames);
            } else {
                unknownStatic.push({
                    start: property.key.start,
                    end: property.key.end
                })
            }
        }

        // ! Parse ObjectExpression
        // if (!unknownStatic.length && !unknownInstance.length) {
        // print('valid', 'true', 4);
        // let str = `validated(${name})\n`;
        // str += `    constants: [ ${flags.namesOfType(CONST).join(', ')} ]\n`;
        // str += `    static: [ ${flags.namesOfType(STATIC).join(', ')} ]\n`;
        // str += `    instance: [ ${flags.namesOfType(INSTANCE).join(', ')} ]\n`;
        // str += `    default: [ ${flags.namesOfType(DEFAULT).join(', ')} ]\n`;
        // str += `    required: [ ${flags.namesOfType(REQUIRED).join(', ')} ]\n`;
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

    #collectTraitBindings(
        project: Project,
        traits: Record<string, TraitDefinition>,
        errors: Record<string, TraitError[]>
    ) {
        const self = this;
        const { exportTypes, exportVars } = self.#registry as FileRegistry;
        const types: TraitTypeExports = {},
            vars: TraitExports = {};

        const ast = self.#result.result.program;

        walk(ast, {
            enter(node, parent) {
                if (parent && isDeclaredInModule(parent, node)) {
                    if (
                        node.type === 'VariableDeclaration'
                        && node.kind === 'const'
                        && node.declarations.length === 1
                        && node.declarations[0]?.id.type === 'Identifier'
                        && node.declarations[0].id.name in exportVars
                    ) {
                        const name = node.declarations[0].id.name;
                        vars[name] = {
                            parent: parent as ExportNamedDeclaration,
                            node: node as TraitDeclaration
                        };
                    } else if (
                        node.type === 'TSTypeAliasDeclaration'
                        && node.typeAnnotation.type === 'TSTypeLiteral'
                        && node.id.name in exportTypes
                    ) {
                        types[node.id.name] = node as TraitAliasDeclaration;
                    }
                }

            },
        });

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
                const call_expr = declarator.init;
                const args = call_expr.arguments;
                const implementationObject = args[0];
                const definition_errors: TraitError[] = [];

                if (args.length !== 1) {
                    definition_errors.push(TraitError.InvalidTraitCallArguments());
                    errors[varName] = definition_errors;
                    traits[varName] = new TraitDefinition(varName, start, end, false, { base: new Flags(), derives: [] });
                    continue;
                }

                // !PARSE
                const base = project.parseType(call_expr.typeArguments.params, self.#result.originalCode, types[varName]);
                if (Array.isArray(base)) {
                    definition_errors.push(...base);
                    traits[varName] = new TraitDefinition(varName, start, end, false, {
                        base: new Flags(),
                        derives: [],
                    })
                    continue;
                }
                // console.log('REGISTER: parsed base flags', varName);
                traits[varName] = new TraitDefinition(varName, start, end, true, base);
            }
        }

        self.#types = types;
        self.#vars = vars;
    }

    trait(name: string) {
        return this.traits[name];
    }

    implementationObject(name: string): TraitObjectExpression | undefined {
        const varDec = this.#vars[name]?.node;
        if (!varDec) {
            return;
        }
        return varDec.declarations[0].init.arguments[0];
    }
}