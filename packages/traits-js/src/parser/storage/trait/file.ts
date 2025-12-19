import type { ParseFileResultResult } from "../../resolve";
import { TraitDefinition } from "./definition";
import { Registry, type FileRegistry, type ForeignImpl, type ImplStatementMeta, type IndexRegistry, type OwnedImpl, type Reference } from "../registry";
import * as eslintScope from 'eslint-scope';
import { visitorKeys, type Node } from "oxc-parser";
import { walk } from "oxc-walker";

export class TraitFile<R extends Registry = Registry> {

    #result: ParseFileResultResult;

    #registry: R;
    #tracker!: eslintScope.ScopeManager;
    #isIndex: boolean;
    #size: number;

    constructor(result: ParseFileResultResult, registry: R) {
        this.#result = result;
        this.#registry = registry;
        this.#isIndex = registry.type === 'index';
        this.#size = 0;
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


    isIndex(): this is TraitFile<IndexRegistry> {
        return this.#isIndex;
    }


    isNeIndex(): this is TraitFile<FileRegistry> {
        return !this.#isIndex;
    }

    initialize() {
        walk(this.ast, {
            enter(node) {
                // TODO: wtf? why doesn't parseSync add range??
                this.replace({ ...node, range: [node.start, node.end] })
            },
        });

        this.#tracker = eslintScope.analyze(this.ast as any, {
            childVisitorKeys: visitorKeys,
            ecmaVersion: 2022,
            sourceType: 'module',
            impliedStrict: true,
        });

        this.#registry.store(this.ast, this.path);
    }


    setTraits(traits: Record<string, TraitDefinition>) {
        this.#registry.traits = traits;
    }

    get(bindingName: string) {
        const t = this.#registry.traits[bindingName];
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

    trait(name: string) {
        return this.#registry.traits[name];
    }

    *traits(): Generator<TraitDefinition> {
        for (const name in this.#registry.traits) {
            yield this.#registry.traits[name]!;
        }
    }

    *impls(): Generator<ImplStatementMeta> {
        for (const impl of this.#registry.ownedImpls) {
            yield impl;
        }

        for (const impl of this.#registry.impls) {
            yield impl;
        }
    }

    *foreignImpls(): Generator<ForeignImpl> {
        for (const impl of this.#registry.impls) {
            yield impl;
        }
    }

    *ownedImpls(): Generator<OwnedImpl> {
        for (const impl of this.#registry.ownedImpls) {
            yield impl;
        }
    }

    scope(node: Node) {
        return this.#tracker.acquire(node as any)
    }

}