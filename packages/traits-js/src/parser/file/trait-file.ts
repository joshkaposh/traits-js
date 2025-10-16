import type { ParseFileResultResult } from "../types";
import { TraitDefinition } from "../definition";
import { Registry, type DeclarationRegistry } from "./registry";
import * as eslintScope from 'eslint-scope';
import type { Span, TSInterfaceDeclaration, TSTypeAliasDeclaration } from "oxc-parser";

export class TraitFile<R extends Registry = Registry> {

    #result: ParseFileResultResult;

    #registry: R;
    #tracker!: eslintScope.ScopeManager;

    #types: DeclarationRegistry<TSTypeAliasDeclaration | TSInterfaceDeclaration>
    #vars: DeclarationRegistry;
    #traits: ReadOnlyDict<TraitDefinition>;
    #isIndex: boolean;

    constructor(result: ParseFileResultResult, registry: R) {
        this.#result = result;
        this.#registry = registry;
        this.#isIndex = registry.type === 'index';
        this.#types = {};
        this.#vars = {};
        this.#traits = {};
    }

    get isIndex() {
        return this.#isIndex;
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

    get code() {
        return this.#result.originalCode;
    }

    get module() {
        return this.#result.result.module;
    }

    get ast() {
        return this.#result.result.program;
    }

    get registry() {
        return this.#registry;
    }

    get tracker() {
        return this.#tracker;
    }

    get traits() {
        return this.#traits;
    }

    get vars() {
        return this.#vars;
    }


    addBindings(
        tracker: eslintScope.ScopeManager,
        types: DeclarationRegistry<TSTypeAliasDeclaration | TSInterfaceDeclaration>,
        vars: DeclarationRegistry,
        traits: Record<string, TraitDefinition>
    ) {
        this.#tracker = tracker;
        this.#types = types;
        this.#vars = vars;
        this.#traits = traits;
    }

    loc(name: string): Span | undefined {
        return this.#types[name] ?? this.#vars[name];
    }

    has(name: string) {
        return this.#registry.has(name)
    }

    hasType(name: string) {
        return this.#registry.hasType(name);
    }

    trait(name: string) {
        return this.traits[name];
    }

}