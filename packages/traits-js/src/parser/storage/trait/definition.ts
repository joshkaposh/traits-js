import type { Class, Declaration, TSTupleElement } from "oxc-parser";
import { Properties } from "./properties";
import type { DeriveTupleType, TraitCallExpression, TraitDeclaration } from "../../node";
import type { CheckMethodResult } from "../../parser";

/** metadata for properly linking import statements at comp time */
type References = {
    static: Record<string, CheckMethodResult>;
    instance: Record<string, CheckMethodResult>
};

// TODO: 1: assume we can only impl inside static blocks
// TODO: 2: expand to allow impls for classes in other files, projects, etc.
type TraitImpl = {
    targetClass: Class;
    targetTrait: TraitDefinition;
    /**
     * true if and only if `definition` is local to this project
     */
    ownedTrait: boolean;
    /**
     * true if and only `impl` was called in a static block
     */
    ownedClass: boolean;
}

export class TraitDefinition<Valid extends boolean = boolean> {
    #props: Properties<Valid>;
    #node: TraitDeclaration;
    #call_expr: TraitCallExpression;
    #uninitDerives: TSTupleElement[];
    #references: References;

    #name: string;
    #path: string;
    #id: string;

    #start: number;
    #end: number;

    #valid: boolean;
    #initialized: boolean;

    private constructor(
        node: TraitDeclaration,
        name: string,
        path: string,
        start: number,
        end: number,
        valid: boolean,
        base: Properties<Valid>
    ) {
        const call_expr = node.declarations[0].init;
        this.#node = node;
        this.#call_expr = call_expr;
        this.#props = base.clone();
        this.#name = name;
        this.#path = path;
        this.#id = `${path}::${name}`
        this.#start = start;
        this.#end = end;
        this.#valid = valid;
        this.#initialized = false;
        const params = call_expr.typeArguments.params;
        this.#uninitDerives = params.length === 2 ? params[1].elementTypes : [] as DeriveTupleType['elementTypes'];
        this.#references = {
            static: {},
            instance: {}
        };
    }

    static valid(node: TraitDeclaration, name: string, path: string, flags: Properties<true>, start: number, end: number): TraitDefinition<true> {
        return new TraitDefinition<true>(node, name, path, start, end, true, flags);
    }

    static invalid(node: Declaration, name: string, path: string, start: number, end: number): TraitDefinition<false> {
        return new TraitDefinition(node as TraitDeclaration, name, path, start, end, false, Properties.empty as Properties<false>);
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

    get names() {
        return this.#props.names;
    }

    get flags() {
        return this.#props.flags;
    }

    get uninitializedDerives() {
        return this.#uninitDerives;
    }

    get properties() {
        return this.#call_expr.arguments[0].properties;
    }

    *superTraits() {
        for (const trait of this.#props.derives) {
            yield trait;
        }
    }

    invalidate() {
        this.#valid = false;
    }


    initialize(references: References) {
        this.#assertValid('initialize');

        if (this.#initialized) {
            throw new Error('Cannot re-initialize definitions');
        }

        this.#references = references;
    }

    hasBaseName(name: string) {
        return this.#props.baseNameSet.has(name)
    }

    superTrait(id: string) {
        // TODO: optimize
        return this.#props.derives.find(t => t.id === id);
    }

    check(name: string, flags: number, isStatic: boolean) {
        return this.#props.has(name, flags, isStatic);
    }

    getFlags(name: string) {
        return this.#props.getFlags(name)
    }

    serialize() {
        return {
            type: 'Definition',
            name: this.name,
            path: this.#path,
            valid: this.#valid,
            flags: this.#props.serialize(),
            references: this.#references
        }
    }


    #assertValid(propertyName: string) {
        if (!this.#valid) {
            throw new Error(`fatal - tried accessing ${propertyName} in ${this.#name} in file ${this.#path}...\nbut ${this.#name} is invalid`)
        }
    }

    filteredNames(type: number) {
        return this.#props.names.filter((_, i) => Boolean(this.#props.flags[i]! & type));
    }

    // getAmbiguities(result: CheckMethodResult) {
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
            this.#props = this.#props.join(derives);
        }
    }

}

// export class TraitImplementation<Valid extends boolean = boolean> {
//     constructor() {}
// }
