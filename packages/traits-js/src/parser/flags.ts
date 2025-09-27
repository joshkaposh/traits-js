import type { TSSignature } from "oxc-parser";

export const CONST = 0x00001;
export const STATIC = 0x00010;
export const INSTANCE = 0x00100;
export const REQUIRED = 0x01000;
export const DEFAULT = 0x10000;

export function hasFlag(flags: number, flag: number) {
    return flags & flag;
}

const CHARS: Record<string, number> = {
    '0': 0,
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
} as const;

export type SerializedFlags = `${string}:${number}`;
/**
 * Provides functions used to create and check `Flags` of a [`Trait`]'s method(s).
 * 
 * ### API
 * 
 * use `Flags.evaluate()` or `Flags.make()` to create `Flags` for a method.
 * 
 * use `Flags.serialize()` and `Flags.deserialize()` when serializing.
 * 
 * 
 */

export const FLAGS = {
    evaluate(): number {
        return 0;
    },
    make(isStatic: boolean, isProvided: boolean) {
        return (isStatic ? STATIC : INSTANCE) | (isProvided ? DEFAULT : REQUIRED);
    },
    has(flags: number, flag: number) {
        return flags & flag;
    },

    serialize(name: string, flags: number): SerializedFlags {
        return `${name}:${flags}`;
    },

    deserialize(str: SerializedFlags) {
        let flags = 0;
        let index = 0;

        const [] = str.split(':');

        while (true) {
            const char = str[index]!;
            if (char in CHARS) {
                index++;
                flags |= CHARS[char]!;
            } else {
                return [flags, str.slice(index)] as [number, string];
            }
        }
    },

    toString(flags: number) {
        let result = '';

        if (hasFlag(flags, INSTANCE)) {
            result += 'instance';
        } else {
            result += 'static';
        }

        if (hasFlag(flags, DEFAULT)) {
            result += ", provided";
        } else {
            result += ', required';
        }

        return result;
    }
} as const;

export interface FlagsInterface {

    readonly names: readonly string[];
    readonly nameSet: Readonly<Set<string>>;

    readonly flags: readonly number[];

    isDisjointFrom(other: FlagsInterface): boolean
    isDisjointFromDerives(derives: FlagsInterface[]): boolean;

    hasName(name: string): boolean;
    has(name: string, flag: number): boolean;
    hasIndex(index: number, flag: number): boolean;

    get(name: string): number | undefined;
    getFlags(index: number): number;
    getName(index: number): string;

    namesOfType(flag: number): string[];
    flagsOfType(flag: number): number[];

    entries(): FlagsIterator;

    [Symbol.iterator](): FlagsIterator;
}

export class Flags implements FlagsInterface {
    #names: readonly string[];
    #nameSet: Set<string>;
    #flags: readonly number[];
    #byName: Record<string, number>;
    #len: number;

    constructor(
        names: readonly string[],
        flags: readonly number[],
        byName: Record<string, number>,
    ) {
        this.#names = names;
        this.#flags = flags;
        this.#nameSet = new Set(names);
        this.#byName = byName;
        this.#len = names.length;
    }

    static from(names: string[], flags: number[]) {
        const byName: Record<string, number> = {};
        for (let i = 0; i < flags.length; i++) {
            byName[names[i]!] = flags[i]!;
        }

        return new Flags(Object.freeze(names), Object.freeze(flags), Object.freeze(byName));
    }

    static fromEntries(entries: Iterable<[name: string, flags: number]>) {
        const names = [];
        const flags = [];
        for (const [name, flag] of entries) {
            names.push(name);
            flags.push(flag);
        }

        return new Flags(names, flags, Object.fromEntries(entries));
    }

    static fromSignatures(signatures: TSSignature[]) {
        const names: string[] = [];
        const flags: number[] = [];
        const byName: Record<string, number> = Object.create(null);
        for (let i = 0; i < signatures.length; i++) {
            const signature = signatures[i]!;
            if (signature.type === 'TSPropertySignature' && signature.key.type === 'Identifier' && signature.typeAnnotation) {
                const annot = signature.typeAnnotation.typeAnnotation;
                //! CONSTANT
                if (
                    annot.type === 'TSNumberKeyword'
                    || annot.type === 'TSBigIntKeyword'
                    || annot.type === 'TSBooleanKeyword'
                    || annot.type === 'TSStringKeyword'
                ) {
                    addFlags(CONST, signature.key.name, names, flags, byName);
                } else if (annot.type === 'TSTypeLiteral' && signature.key.name === 'instance') {
                    //! INSTANCE
                    const instanceSigs = annot.members;
                    for (let j = 0; j < instanceSigs.length; j++) {
                        const signature = instanceSigs[j]!;
                        if (signature.type === 'TSMethodSignature' && signature.key.type === 'Identifier') {
                            addFlags(INSTANCE | (signature.optional ? DEFAULT : REQUIRED), signature.key.name, names, flags, byName)
                        }
                    }
                }
            } else if (signature.type === 'TSMethodSignature' && signature.key.type === 'Identifier') {
                //! STATIC
                addFlags(STATIC | (signature.optional ? DEFAULT : REQUIRED), signature.key.name, names, flags, byName)
            }
        }

        return new Flags(names, flags, byName);
    }

    get names() {
        return this.#names;
    }

    get flags() {
        return this.#flags;
    }

    get nameSet() {
        return this.#nameSet;
    }

    has(name: string, flag: number) {
        const f = this.#byName[name];
        return f == null ? false : (f & flag) !== 0;
    }

    hasIndex(index: number) {
        return index < this.#len;
    }

    hasName(name: string): boolean {
        return this.#byName[name] != null;
    }

    hasFlagsIndex(index: number, flag: number): boolean {
        return (flag & (this.#flags[index] ?? 0)) !== 0;
    }

    isDisjointFrom(other: FlagsInterface) {
        return this.#nameSet.isDisjointFrom(other.nameSet);
    }

    isDisjointFromDerives(derives: FlagsInterface[]) {
        return derives.every(d => this.#nameSet.isDisjointFrom(d.nameSet))
    }


    get(name: string): number | undefined {
        return this.#byName[name];
    }

    getIndex(index: number): number | undefined {
        return this.#flags[index];
    }

    getName(index: number): string {
        return this.#names[index]!;
    }

    getFlags(index: number): number {
        return this.#flags[index]!;
    }

    namesOfType(flag: number) {
        const flags = this.#flags;
        return this.#names.filter((_, i) => flags[i]! & flag);
    }

    flagsOfType(flag: number) {
        return this.#flags.filter((f) => flag & f);
    }

    namesAndFlagsOfType(flag: number) {
        const result: Array<[string, number]> = [];
        const names = this.#names;
        const flags = this.#flags;
        for (let i = 0; i < names.length; i++) {
            const f = flags[i]!;
            if (hasFlag(f, flag)) {
                result.push([names[i]!, flag]);
            }
        }
        return result;
    }

    entries() {
        return new FlagsIterator(this.#flags, this.#names);
    }

    [Symbol.iterator]() {
        return new FlagsIterator(this.#flags, this.#names);
    }
}

function addFlags(flag: number, name: string, names: string[], flags: number[], byName: Record<string, number>) {
    names.push(name);
    flags.push(flag);
    byName[name] = flag;
}

type DerivedFlags = Array<{ name: string | undefined; flags: FlagsInterface }>;

export class FlagsWithDerives implements FlagsInterface {
    #flags: FlagsInterface;
    #joined: FlagsInterface;
    #namedDerives: Record<string, FlagsInterface>;
    constructor(named: Record<string, FlagsInterface>, base: FlagsInterface, joined: FlagsInterface) {
        this.#flags = base;
        this.#joined = joined;
        this.#namedDerives = named;
    }

    static fromDerives(base: FlagsInterface, derives: DerivedFlags) {

        const named: Record<string, FlagsInterface> = Object.create(null);
        const byName: Record<string, number> = Object.create(null);
        const derivedNames: Array<string> = [];
        const derivedFlags: Array<number> = [];

        for (let i = 0; i < derives.length; i++) {
            const { name, flags } = derives[i]!;

            if (name) {
                named[name] = flags;
            }

            const names = flags.names;
            const flagsFlags = flags.flags;


            for (let j = 0; j < names.length; j++) {
                const n = names[j]!;
                const f = flagsFlags[j]!;
                byName[n] = f;
                derivedFlags.push(f);
                derivedNames.push(n);
            }
        }


        derivedNames.push(...base.names);
        derivedFlags.push(...base.flags);

        return new FlagsWithDerives(
            named,
            base,
            new Flags(
                derivedNames.flatMap(n => n),
                derivedFlags.flatMap(f => f),
                {}
            ),
        );
    }

    get names() {
        return this.#joined.names;
    }

    get nameSet() {
        return this.#joined.nameSet;
    }

    get flags() {
        return this.#joined.flags;
    }

    get baseNames() {
        return this.#flags.names;
    }

    get baseNameSet() {
        return this.#flags.nameSet;
    }

    // get derivedNames() {
    //     // return this.#de
    // }

    derivedNamesFor(name: string) {
        return this.#namedDerives[name]?.flags;
    }

    derivedFlagsFor(name: string) {
        return this.#namedDerives[name]?.flags;
    }

    intoImmutable(): FlagsInterface {
        return void 0 as unknown as FlagsInterface;
        // return new TraitFlagsWithDerivedFlags()
    }

    has(name: string, flag: number) {
        return this.#joined.has(name, flag);
    }

    hasIndex(index: number, flag: number) {
        return this.#joined.hasIndex(index, flag);
    }

    hasName(name: string) {
        return this.#joined.hasName(name);
    }

    isDisjointFrom(other: FlagsInterface) {
        return this.#joined.isDisjointFrom(other);
    }

    isDisjointFromDerives(derives: FlagsInterface[]) {
        return this.#joined.isDisjointFromDerives(derives);
    }

    getFlags(index: number) {
        return this.flags[index]!;
    }

    getName(index: number) {
        return this.names[index]!;
    }

    get(name: string) {
        return this.#joined.get(name);
    }

    namesOfType(flag: number) {
        const flags = this.flags;
        return this.names.filter((_, i) => flags[i]! & flag);
    }

    flagsOfType(flag: number) {
        return this.flags.filter((f) => flag & f);
    }

    namesAndFlagsOfType(flag: number) {
        const result: Array<[string, number]> = [];
        const names = this.names;
        const flags = this.flags;
        for (let i = 0; i < names.length; i++) {
            const f = flags[i]!;
            if (hasFlag(f, flag)) {
                result.push([names[i]!, flag]);
            }
        }
        return result;
    }

    entries() {
        return new FlagsIterator(this.flags, this.names);
    }

    [Symbol.iterator]() {
        return this.entries();
    }

}

export class FlagsIterator {
    #index: number;
    #flags: readonly number[];
    #names: readonly string[];

    #done: IteratorResult<[name: string, flags: number]>;

    constructor(
        flags: readonly number[],
        names: readonly string[],
        index?: number
    ) {
        this.#flags = flags;
        this.#names = names;
        this.#index = index ?? 0;
        this.#done = { done: true, value: void 0 };
    }


    clone() {
        return new FlagsIterator(this.#flags, this.#names, this.#index);
    }

    chain(other: ChainedFlagsIterator | FlagsIterator) {
        return new ChainedFlagsIterator(this, other);
    }

    next() {
        const f = this.#flags;
        const len = f.length;
        const index = this.#index;
        if (index >= len) {
            return this.#done
        }

        this.#index += 1;

        return {
            done: false,
            value: [this.#names[index]!, f[index]!] as [string, number]
        }
    }

    [Symbol.iterator]() {
        return this;
    }
}

class ChainedFlagsIterator {
    #aIter: ChainedFlagsIterator | FlagsIterator;
    #bIter: ChainedFlagsIterator | FlagsIterator;

    constructor(
        a: ChainedFlagsIterator | FlagsIterator,
        b: ChainedFlagsIterator | FlagsIterator,
    ) {
        this.#aIter = a;
        this.#bIter = b;
    }

    clone(): any {
        return new ChainedFlagsIterator(this.#aIter.clone(), this.#bIter.clone())
    }

    next(): any {
        const first = this.#aIter.next();
        return first.done ? this.#bIter.next() : first;
    }

    chain(other: FlagsIterator | ChainedFlagsIterator) {
        return new ChainedFlagsIterator(this, other);
    }

    [Symbol.iterator]() {
        return this;
    }
}