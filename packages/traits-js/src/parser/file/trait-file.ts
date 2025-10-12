import type { Span, TSTupleElement, ExportNamedDeclaration, TSTypeLiteral, TSTypeReference, ObjectPropertyKind, Function, Program, Node, ObjectProperty } from "oxc-parser";
import { visitorKeys } from 'oxc-parser';
import * as eslintScope from 'eslint-scope';
import { ScopeTracker, walk } from "oxc-walker";
import { isDeclaredInModule, type DeriveTupleType, type TraitAliasDeclaration, type TraitDeclaration, type TraitObjectExpression, type TraitObjectProperty } from "../node";
import { TraitError } from "../error";
import { AMBIGUITY, CONST, DEFAULT, Flags, INSTANCE, REQUIRED, STATIC, STATIC_DEFAULT } from "../flags";
import type { ParseFileResultResult } from "../types";
import { TraitDefinition } from "../definition";
import { Registry, type FileRegistry, type ReExportRegistry } from "./registry";
import type { Project } from "../project";
import { getCode, print } from "../helpers";
import { DefaultMethods } from "./default-methods";

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
    base: Flags;
    derives: TSTupleElement[];
}>;

type EslintProgram = Parameters<typeof eslintScope.analyze>[0];
type EslintNode = Parameters<eslintScope.ScopeManager['getDeclaredVariables']>[0];

class Scope {
    #scope: eslintScope.ScopeManager | undefined;
    #referenceCache: WeakMap<Node, eslintScope.Variable[]>;
    constructor(scopeManager?: eslintScope.ScopeManager) {
        this.#scope = scopeManager;
        this.#referenceCache = new WeakMap();
    }

    get scope() {
        return this.#scope;
    }


    declaredVariables(node: Node) {
        const s = this.#scope;
        if (!s) {
            return;
        }

        const r = this.#referenceCache;
        if (!r.has(node)) {
            const references = s.getDeclaredVariables(node as EslintNode);
            r.set(node, references);
            return references;
        }

        return r.get(node);
    }
}

export class TraitFile {
    traits: ReadOnlyDict<TraitDefinition> = Object.create(null);

    #result: ParseFileResultResult;

    #vars: TraitExports;

    #registry: Registry;
    #scope: Scope;
    #ScopeTracker: ScopeTracker;

    constructor(result: ParseFileResultResult, registry: Registry) {
        this.#result = result;
        this.#registry = registry;
        // this.#scope = new Scope(registry.type === 'file' ? eslintScope.analyze(result.result.program as EslintProgram, {
        //     ecmaVersion: 2022,
        //     childVisitorKeys: visitorKeys,
        //     impliedStrict: true,
        //     ignoreEval: true,
        //     sourceType: 'module'
        // }) : void 0);
        this.#scope = new Scope();
        this.#ScopeTracker = new ScopeTracker({ preserveExitedScopes: true });
        this.traits = {};
        this.#vars = {};
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
        self.traits = Object.freeze(traits);
        project.parseDerives(traits, self.#registry as FileRegistry, self.path);
    }

    checkDefinitions() {
        const traits = this.traits;
        for (const traitName in traits) {
            const definition = traits[traitName]!;
            const implementationObject = this.implementationObject(traitName)!;
            const properties = implementationObject.properties;
            this.#checkImplementation(definition, properties);
        }
    }

    #parseInstanceProperties(
        instanceDefaults: Record<string, TraitObjectProperty>,
        properties: ObjectPropertyKind[],
        definition: TraitDefinition,
        unknownInstance: { type: string; start: number; end: number, name?: string }[],
        err_requiredInstanceNames: string[]
    ) {
        const flags = definition.flags;

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

            if (flags.has(key.name, REQUIRED, false)) {
                err_requiredInstanceNames.push(key.name);
            } else if (flags.has(key.name, DEFAULT, false)) {
                instanceDefaults[key.name] = instanceProperty as TraitObjectProperty;
            } else {
                unknownInstance.push({ type: 'NotRegisteredInTrait', start: instanceProperty.start, end: instanceProperty.end, name: key.name });
            }
        }
    }

    #checkImplementation(definition: TraitDefinition, properties: TraitObjectProperty[]) {
        const flags = definition.flags;

        const staticDefaults: Record<string, TraitObjectProperty> = {}
        const instanceDefaults: Record<string, TraitObjectProperty> = {}

        const unknownStatic: ObjectProperty[] = [];
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
                if (flags.has(propertyName, REQUIRED, true)) {
                    err_requiredStaticNames.push(propertyName);
                    continue
                } else if (flags.has(propertyName, DEFAULT, true)) {
                    staticDefaults[propertyName] = property;
                } else {
                    unknownStatic.push(property);
                }

            } else if (propertyName === 'instance' && property.value.type === 'ObjectExpression') {
                const instanceProperties = property.value.properties;
                // TODO: fix me
                this.#parseInstanceProperties(instanceDefaults, instanceProperties, definition, unknownInstance, err_requiredInstanceNames);

            } else {
                unknownStatic.push(property);
            }
        }

        if (
            unknownStatic.length
            || unknownInstance.length
            || err_requiredInstanceNames.length
            || err_requiredStaticNames.length
        ) {
            return;
        }


        const code = this.code;
        for (const staticName in staticDefaults) {
            const prop = staticDefaults[staticName]!;
            const method = prop.value as Function;
            const tracker = this.#ScopeTracker;
            const rootScope = tracker.getCurrentScope();
            const ambiguousCallSites: { parent: Node; node: Node; identName: string }[] = [];
            walk(method.body!, {
                scopeTracker: tracker,
                enter(node, parent, ctx) {
                    if (parent && node.type === 'ThisExpression') {
                        const currentScope = tracker.getCurrentScope();
                        if (currentScope === rootScope) {
                            if (parent.type === 'MemberExpression') {
                                if (parent.property.type === 'Identifier') {
                                    const identName = parent.property.name;
                                    const f = definition.flags.getFlags(identName);
                                    if (f && f?.length > 1) {
                                        const obj = parent.object;
                                        // TODO: check if cast is to a trait
                                        // TODO: check if casted trait has a method with the proper call signature
                                        if (obj.type === 'TSAsExpression') {
                                        } else if (obj.type === 'CallExpression') {

                                        } else {
                                            ambiguousCallSites.push({ parent: parent, node: node, identName: identName });
                                            // console.log(`${definition.name} - ${identName} has ${f.length} ambiguous call sites`);
                                        }


                                    }
                                    // console.log('ident', getCode(code, parent.start, parent.end), f);
                                }
                            } else if (parent.type === 'CallExpression') {
                                // TODO: check if parent is a call to `as`
                            }
                            // console.log(parent.type, );
                        }
                    }
                },
            });

            if (ambiguousCallSites.length) {
                const names = Array.from(new Set(ambiguousCallSites.map(acs => acs.identName)))
                console.error(`[${definition.name}.${staticName}] has ${ambiguousCallSites.length} ambiguous calls: ${names}`);
                for (const callSite of ambiguousCallSites) {
                    console.log('"%s" %O', getCode(code, callSite.parent.start, callSite.parent.end), [callSite.parent.start, callSite.parent.end]);
                }
            }
        }
        // console.log(scope.variables.map(v => v.name));
    }

    #checkAmbiguities(definition: TraitDefinition, propertyName: string, propertyFlags: number) { }

    #collectTraitBindings(
        project: Project,
        traits: Record<string, TraitDefinition>,
        errors: Record<string, TraitError[]>
    ) {
        const self = this;
        const { exportTypes, exportVars } = self.#registry as FileRegistry;

        const ast = self.#result.result.program;
        const path = self.#result.path;

        const scopeTracker = self.#ScopeTracker;

        const types: TraitTypeExports = {},
            vars: TraitExports = {};


        walk(ast, {
            scopeTracker: scopeTracker,
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

        scopeTracker.freeze();

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
                const definition_errors: TraitError[] = [];

                if (args.length !== 1) {
                    definition_errors.push(TraitError.InvalidTraitCallArguments());
                    errors[varName] = definition_errors;
                    traits[varName] = new TraitDefinition(varName, path, start, end, false);
                    continue;
                }

                // !PARSE
                const base = project.parseType(call_expr.typeArguments.params, self.#result.originalCode, types[varName]);
                if (Array.isArray(base)) {
                    // console.log("Error parsing base for %s: ", varName, base.map(e => e.message));

                    definition_errors.push(...base);
                    traits[varName] = new TraitDefinition(varName, path, start, end, false)
                    continue;
                }

                const params = call_expr.typeArguments.params;
                const derives = params.length === 2 ? params[0].elementTypes : [] as DeriveTupleType['elementTypes'];
                traits[varName] = new TraitDefinition(
                    varName,
                    path,
                    start,
                    end,
                    true,
                    base,
                    derives
                );
            }
        }

        // self.#types = types;
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