import type { ParseFileResultResult } from "../types";
import { TraitDefinition } from "../definition";
import { Registry, type DeclarationRegistry } from "./registry";
import * as eslintScope from 'eslint-scope';

export class TraitFile {

    #result: ParseFileResultResult;


    #registry: Registry;
    #tracker!: eslintScope.ScopeManager;
    #vars!: DeclarationRegistry;
    #traits!: ReadOnlyDict<TraitDefinition>;

    constructor(result: ParseFileResultResult, registry: Registry) {
        this.#result = result;
        this.#registry = registry;
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


    addBindings(tracker: eslintScope.ScopeManager, vars: DeclarationRegistry, traits: Record<string, TraitDefinition>) {
        // console.log('ADD BINDINGS: ', typeof tracker);
        this.#tracker = tracker;
        this.#vars = vars;
        this.#traits = traits;
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