import type { Span, TSTupleElement } from "oxc-parser";
import { Flags } from "./flags";
import type { TraitObjectExpression } from "./node";
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
    #uninitDerives: TSTupleElement[];

    #name: string;
    #path: string;

    #start: number;
    #end: number;

    #valid: boolean;

    constructor(name: string,
        path: string,
        start: number,
        end: number,
        valid: boolean,
        base: Flags<Valid> = new Flags<Valid>(),
        derives: TSTupleElement[] = []
    ) {
        this.#base = base;
        this.#joined = base.clone();
        this.#uninitDerives = derives;
        this.#name = name;
        this.#path = path;
        this.#start = start;
        this.#end = end;
        this.#valid = valid;
    }

    // static Invalid(name: string, path: string, start: number, end: number) {
    //     return new TraitDefinition(name, path, start, end, false, { base: new Flags(), derives: [] })
    // }

    // static Valid(name: string, path: string, start: number, end: number, ) { }

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
        if (!this.#valid) {
            throw new Error(`join was called on invalid trait ${this.#name} in file ${this.#path}`)
        }
        this.#joined = this.#joined.join(derives);
    }

    invalidate() {
        this.#valid = false;
    }
}
