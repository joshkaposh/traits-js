import type { Span } from "oxc-parser";
import type { FlagsInterface } from "./flags";

export type UnknownStatic = Span[]
export type UnknownInstance = Array<{
    type: 'SpreadAssigment' | 'KeyNeIdentifier' | 'DefinesRequired';
    start: number;
    end: number
}>;

export class TraitDefinition {
    #flags: FlagsInterface;
    #name: string;
    #start: number;
    #end: number;

    #unknownStatic: UnknownStatic;
    #unknownInstance: UnknownInstance;
    #errored: boolean;

    constructor(
        name: string,
        start: number,
        end: number,
        flags: FlagsInterface,
        unknownStatic: UnknownStatic,
        unknownInstance: UnknownInstance
    ) {
        this.#flags = flags;
        this.#name = name;
        this.#start = start;
        this.#end = end;
        this.#unknownStatic = unknownStatic;
        this.#unknownInstance = unknownInstance;
        this.#errored = unknownStatic.length + unknownInstance.length !== 0;
    }

    get errored() {
        return this.#errored;
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
        return this.#flags;
    }

}
