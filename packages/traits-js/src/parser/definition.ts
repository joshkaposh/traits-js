import type { Span, TSTupleElement } from "oxc-parser";
import { Flags } from "./flags";
import type { DeriveTupleType, TraitCallExpression, TraitObjectExpression } from "./node";
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
    #call_expr: TraitCallExpression;
    #uninitDerives: TSTupleElement[];

    #name: string;
    #path: string;

    #start: number;
    #end: number;

    #valid: boolean;

    constructor(
        call_expr: TraitCallExpression,
        name: string,
        path: string,
        start: number,
        end: number,
        valid: boolean,
        base: Flags<Valid> = new Flags<Valid>()
    ) {
        console.log('new trait definition: ', name, valid);

        this.#call_expr = call_expr;
        this.#base = base;
        this.#joined = base.clone();
        this.#name = name;
        this.#path = path;
        this.#start = start;
        this.#end = end;
        this.#valid = valid;
        const params = call_expr.typeArguments.params;
        this.#uninitDerives = params.length === 2 ? params[1].elementTypes : [] as DeriveTupleType['elementTypes'];
    }

    get valid() {
        return this.#valid;
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

    #assertValid(propertyName: string) {
        if (!this.#valid) {
            throw new Error(`fatal - tried accessing ${propertyName} in ${this.#name} in file ${this.#path}...\nbut ${this.#name} is invalid`)
        }
    }

    filteredNames(type: number) {
        return this.#joined.names.filter((_, i) => Boolean(this.#joined.flags[i]! & type));
    }

    getAmbiguities() {
        const baseNames = this.#base.names;
        // const deriveNames = this.#joined.
        // const names = this.#joined.b;
        // const flags = this.#joined.flags;

        // 

    }

    join(derives: TraitDefinition[]) {
        // this.#assertValid('join');
        this.#joined = this.#joined.join(derives);
    }

    invalidate() {
        console.log('invalidated ', this.name);

        this.#valid = false;
    }
}
