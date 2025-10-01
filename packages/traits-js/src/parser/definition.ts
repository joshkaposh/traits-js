import type { Span, TSTupleElement } from "oxc-parser";
import { Flags, type DerivedFlags, type FlagsInterface } from "./flags";

export type UnknownStatic = Span[]
export type UnknownInstance = Array<{
    type: 'SpreadAssigment' | 'KeyNeIdentifier' | 'DefinesRequired';
    start: number;
    end: number
}>;

export class TraitDefinition {
    #joined: FlagsInterface;
    #base: FlagsInterface;
    #uninitDerives: TSTupleElement[];
    #name: string;
    #start: number;
    #end: number;

    #valid: boolean;

    constructor(
        name: string,
        start: number,
        end: number,
        valid: boolean,
        flags?: { base: FlagsInterface; derives: TSTupleElement[] },
    ) {
        flags ??= { base: new Flags([], [], {}), derives: [] };
        this.#base = flags.base;
        this.#joined = flags.base.clone();
        this.#uninitDerives = flags.derives;
        this.#name = name;
        this.#start = start;
        this.#end = end;
        this.#valid = valid;
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

    get baseFlags() {
        return this.#base;
    }

    get flags() {
        return this.#joined;
    }

    get uninitializedDerives() {
        return this.#uninitDerives;
    }

    join(derives: DerivedFlags) {
        this.#joined = Flags.withDerives(this.#base, derives);
    }

    invalidate() {
        this.#valid = false;
    }
}
