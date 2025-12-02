import type { Declaration, Span, TSTupleElement } from "oxc-parser";
import { Flags } from "./flags";
import type { DeriveTupleType, TraitCallExpression, TraitDeclaration, TraitObjectExpression } from "../node";
import type { MethodParseResult } from "../parser";

export type UnknownStatic = Span[]
export type UnknownInstance = Array<{
    type: 'SpreadAssigment' | 'KeyNeIdentifier' | 'DefinesRequired';
    start: number;
    end: number
}>;

export type TraitDefinitionMeta = {
    base: Flags;
    derives: TSTupleElement[];
    implementationObject: TraitObjectExpression | null;
};

export class TraitDefinition<Valid extends boolean = boolean> {
    #joined: Flags<Valid>;
    #base: Flags<Valid>;
    #node: TraitDeclaration;
    #call_expr: TraitCallExpression;
    #uninitDerives: TSTupleElement[];
    #dependencies: {
        static: Record<string, MethodParseResult>;
        instance: Record<string, MethodParseResult>
    };

    #name: string;
    #path: string;
    #id: string;

    #start: number;
    #end: number;

    #valid: boolean;
    #initialized: boolean;

    private constructor(
        node: TraitDeclaration,
        // call_expr: TraitCallExpression,
        name: string,
        path: string,
        start: number,
        end: number,
        valid: boolean,
        base: Flags<Valid>
    ) {
        const call_expr = node.declarations[0].init;
        this.#node = node;
        this.#call_expr = call_expr;
        this.#base = base;
        this.#joined = base.clone();
        this.#name = name;
        this.#path = path;
        this.#id = `${path}::${name}`
        this.#start = start;
        this.#end = end;
        this.#valid = valid;
        this.#initialized = false;
        const params = call_expr.typeArguments.params;
        this.#uninitDerives = params.length === 2 ? params[1].elementTypes : [] as DeriveTupleType['elementTypes'];
        this.#dependencies = {
            static: {},
            instance: {}
        };
    }

    static valid(node: TraitDeclaration, name: string, path: string, flags: Flags<true>, start: number, end: number): TraitDefinition<true> {
        return new TraitDefinition<true>(node, name, path, start, end, true, flags);
    }

    static invalid(node: Declaration, name: string, path: string, start: number, end: number): TraitDefinition<false> {
        return new TraitDefinition<false>(node as TraitDeclaration, name, path, start, end, false, Flags.empty as Flags<false>);
    }

    get valid() {
        return this.#valid;
    }

    get id() {
        return this.#id;
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
        return this.#joined;
    }

    get uninitializedDerives() {
        return this.#uninitDerives;
    }

    get properties() {
        return this.#call_expr.arguments[0].properties;
    }

    serialize() {
        return {
            type: 'Definition',
            name: this.name,
            path: this.#path,
            valid: this.#valid,
            flags: this.flags.serialize(),
            dependencies: this.#dependencies
        }
    }

    initialize(dependencies: {
        static: Record<string, MethodParseResult>;
        instance: Record<string, MethodParseResult>
    }) {
        this.#assertValid('initialize');

        if (this.#initialized) {
            throw new Error('Cannot re-initialize definitions');
        }
        this.#dependencies = dependencies;

    }


    #assertValid(propertyName: string) {
        if (!this.#valid) {
            throw new Error(`fatal - tried accessing ${propertyName} in ${this.#name} in file ${this.#path}...\nbut ${this.#name} is invalid`)
        }
    }

    filteredNames(type: number) {
        return this.#joined.names.filter((_, i) => Boolean(this.#joined.flags[i]! & type));
    }

    // getAmbiguities(result: MethodParseResult) {
    //     const self = this;
    //     const flags = self.flags;
    //     const ambiguousCallSites = result.ambiguousCallSites;
    //     const derives = flags.derives;
    //     const traitNames = [];
    //     const added = new Set();

    //     for (const deriveName in derives) {
    //         const derive = derives[deriveName]!;
    //         for (const callSite of ambiguousCallSites) {
    //             if (derive.flags.nameSet.has(callSite.identName)) {
    //                 if (
    //                     flags.baseNameSet.has(callSite.identName)
    //                     && !added.has(self.id)
    //                 ) {
    //                     traitNames.push(self.name);
    //                     added.add(self.id)
    //                 }

    //                 if (!added.has(derive.id)) {
    //                     traitNames.push(derive.name);
    //                 }
    //                 added.add(derive.id);
    //             }
    //         }
    //     }

    //     return traitNames;
    // }

    join(derives: TraitDefinition[]) {
        // this.#assertValid('join');
        if (this.#valid) {
            this.#joined = this.#joined.join(derives);
        }
    }

    invalidate() {
        // console.log('invalidated ', this.name);
        this.#valid = false;
    }
}
