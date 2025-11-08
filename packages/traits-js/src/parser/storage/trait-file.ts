import type { ParseFileResultResult } from "../types";
import { TraitDefinition } from ".";
import { Registry, type DeclarationRegistry, type FileRegistry, type IndexRegistry, type Reference } from "./registry";
import * as eslintScope from 'eslint-scope';
import type { Node, Span, TSInterfaceDeclaration, TSTypeAliasDeclaration } from "oxc-parser";

export class TraitFile<R extends Registry = Registry> {

    #result: ParseFileResultResult;

    #registry: R;
    #tracker!: eslintScope.ScopeManager;

    #types: DeclarationRegistry<TSTypeAliasDeclaration | TSInterfaceDeclaration>
    #vars: DeclarationRegistry;
    #traits: ReadOnlyDict<TraitDefinition>;
    #isIndex: boolean;
    #size: number;

    constructor(result: ParseFileResultResult, registry: R) {
        this.#result = result;
        this.#registry = registry;
        this.#isIndex = registry.type === 'index';
        this.#types = {};
        this.#vars = {};
        this.#traits = {};
        this.#size = 0;
    }

    isIndex(): this is TraitFile<IndexRegistry> {
        return this.#isIndex;
    }


    isNeIndex(): this is TraitFile<FileRegistry> {
        return !this.#isIndex;
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

    get imports() {
        return this.#result.result.module.staticImports;
    }

    get exports() {
        return this.#result.result.module.staticExports;
    }

    get ast() {
        return this.#result.result.program;
    }

    get registry() {
        return this.#registry;
    }

    // get tracker() {
    //     return this.#tracker;
    // }


    // get vars() {
    //     return this.#vars;
    // }


    set tracker(tracker: eslintScope.ScopeManager) {
        this.#tracker = tracker;
    }
    addBindings(
        tracker: eslintScope.ScopeManager,
        types: DeclarationRegistry<TSTypeAliasDeclaration | TSInterfaceDeclaration>,
        vars: DeclarationRegistry,
        traits: Record<string, TraitDefinition>
    ) {
        this.#tracker = tracker;
        // this.#registry.types = types
        this.#types = types;
        this.#vars = vars;
        this.#traits = traits;
        this.#size = Object.keys(traits).length
    }

    loc(name: string): Span | undefined {
        return this.#types[name] ?? this.#vars[name];
    }

    // has(name: string) {
    //     return this.#registry.has(name);
    // }

    // hasType(name: string) {
    //     return this.#registry.hasType(name);
    // }

    get(bindingName: string) {
        const t = this.#traits[bindingName];
        if (t) {
            return {
                name: t.name,
                definition: t,
                isLocal: true,
                isTrait: true,
                isType: false
            } satisfies Reference;
        } else {
            return (this.#registry.type === 'file' ? this.#registry.get(bindingName) : void 0);

        }
    }

    get totalCount() {
        return this.#size;
    }

    trait(name: string) {
        return this.#traits[name];
    }

    ids(): IteratorObject<string> {
        return this.traits().map(d => d.id);
    }

    *names(): Generator<string> {
        for (const key in this.#traits) {
            yield key;
        }
    }

    *traits(): Generator<TraitDefinition> {
        for (const key in this.#traits) {
            yield this.#traits[key]!;
        }
    }

    scope(node: Node) {
        return this.#tracker.acquire(node as any)
    }
}