import type { Class, Node, TSSignature } from "oxc-parser";
import type { TraitDefinition } from "./trait-definition";
import { TraitError } from "../errors";
import type { DeclarationRegistry } from "./registry";
import { typeDeclarationSignatures, type TraitAliasDeclaration } from "../node";

// export type SerializedFlags = `${string}:${number}`;

// const CHARS: Record<string, number> = {
//     '0': 0,
//     '1': 1,
//     '2': 2,
//     '3': 3,
//     '4': 4,
//     '5': 5,
//     '6': 6,
//     '7': 7,
//     '8': 8,
//     '9': 9,
// } as const;

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

const FLAGS = {
    // serialize(name: string, flags: number): SerializedFlags {
    //     return `${name}:${flags}`;
    // },

    // deserialize(str: SerializedFlags) {
    //     let flags = 0;
    //     let index = 0;

    //     const [] = str.split(':');

    //     while (true) {
    //         const char = str[index]!;
    //         if (char in CHARS) {
    //             index++;
    //             flags |= CHARS[char]!;
    //         } else {
    //             return [flags, str.slice(index)] as [number, string];
    //         }
    //     }
    // },

    toString(flags: number) {
        let result = '';

        if (flags & INSTANCE) {
            result += 'instance';
        } else {
            result += 'static';
        }

        if (flags & DEFAULT) {
            result += ", provided";
        } else {
            result += ', required';
        }

        return result;
    }
} as const;

export const REQUIRED = 1 << 1;
export const DEFAULT = 1 << 2;
export const STATIC = 1 << 3;
export const INSTANCE = 1 << 4;
export const CONST = 1 << 5;
export const DERIVE = 1 << 6;
export const AMBIGUITY = 1 << 7;

export const STATIC_DEFAULT = DEFAULT | STATIC;
export const STATIC_REQUIRED = REQUIRED | STATIC;
export const INSTANCE_DEFAULT = DEFAULT | INSTANCE;
export const INSTANCE_REQUIRED = REQUIRED | INSTANCE;


class ByName {
    readonly staticDefault: NameSet;
    readonly staticRequired: NameSet;

    readonly instanceDefault: NameSet;
    readonly instanceRequired: NameSet;

    constructor(staticDefault: NameSet = {}, staticRequired: NameSet = {}, instanceDefault: NameSet = {}, instanceRequired: NameSet = {}) {
        this.staticDefault = staticDefault;
        this.staticRequired = staticRequired;
        this.instanceDefault = instanceDefault;
        this.instanceRequired = instanceRequired;
    }
};

// export interface Flags {

//     readonly flags: readonly number[];
//     readonly names: readonly string[];

//     // readonly baseNames: ReadonlySet<string>;
//     // readonly deriveNames: ReadonlySet<string>;
//     // readonly byName: ByName;
//     // readonly derivesByName: ByName;


//     entries(): FlagsIterator;

//     clone(): Flags;

//     [Symbol.iterator](): FlagsIterator;
// }

const PROPERTY_INSTANCE_KEY = 'instance';


const CONSTANT_VALUE = {
    TSBooleanKeyword: 0,
    TSNumberKeyword: 1,
    TSBigIntKeyword: 2,
    TSStringKeyword: 3,
} as const;

export type NameSet = Record<string, number>;
export class Flags<Valid extends boolean = boolean> {

    #isValid!: Valid;

    #names: readonly string[];
    #flags: readonly number[];
    #derives: ReadOnlyDict<TraitDefinition>;

    #nameSet: ReadonlySet<string>;
    #baseNameSet: ReadonlySet<string>;

    #static: Record<string, number>;
    #instance: Record<string, number>;

    #staticDerive: Record<string, number[]>;
    #instanceDerive: Record<string, number[]>;

    #cache: Map<number, readonly string[]>;
    #flagsCache: Map<string, {
        flags: readonly number[];
    }>;


    // #ambiguities: Record<string, Record<string, number>>;

    private constructor(
        names: readonly string[],
        flags: readonly number[],
        derives: ReadOnlyDict<TraitDefinition>,
    ) {
        this.#names = names;
        this.#flags = flags;
        this.#derives = derives;
        const baseStatics: Record<string, number> = {};
        const baseInstances: Record<string, number> = {};
        const deriveStatics: Record<string, number[]> = {};
        const deriveInstances: Record<string, number[]> = {};

        const baseNameSet = new Set<string>();
        const nameSet = new Set<string>();
        // const ambiguities: Record<string, Record<string, number>> = {};

        for (let i = 0; i < names.length; i++) {
            const name = names[i]!;
            const flag = flags[i]!;
            const isStatic = flag & STATIC;
            const isDerive = flag & DERIVE;
            nameSet.add(name);
            if (isStatic) {
                if (isDerive) {
                    if (!deriveStatics[name]) {
                        deriveStatics[name] = [];
                    }
                    deriveStatics[name].push(flag);

                } else {
                    baseNameSet.add(name);
                    baseStatics[name] = flag;
                }
            } else {
                if (isDerive) {
                    if (!deriveInstances[name]) {
                        deriveInstances[name] = [];
                    }
                    deriveInstances[name].push(flag);
                } else {
                    baseNameSet.add(name);
                    baseInstances[name] = flag;
                }
            }
        }



        this.#static = baseStatics;
        this.#instance = baseInstances;
        this.#staticDerive = deriveStatics;
        this.#instanceDerive = deriveInstances;
        this.#nameSet = nameSet;
        this.#baseNameSet = baseNameSet;
        // this.#ambiguities = ambiguities;
        this.#cache = new Map();
        this.#flagsCache = new Map();
    }

    static readonly empty = new Flags([], [], {});

    static tryFromType(
        types: DeclarationRegistry<TraitAliasDeclaration>,
        code: string,
        typeArgument: Node,
    ): Flags<true> | TraitError[] {
        if (typeArgument.type === 'TSTypeLiteral') {
            const flags = Flags.fromSignatures(typeDeclarationSignatures(typeArgument)!);
            return flags instanceof Flags ? flags : flags.errors;
        } else if (typeArgument.type === 'TSTypeReference') {
            if (typeArgument.typeName.type !== 'Identifier') {
                return [TraitError.IdentifierNeLiteral(typeArgument, code)];
            } else {
                const typeDeclaration = types[typeArgument.typeName.name]?.node;
                if (
                    // e.g trait<Foo>
                    // this type is a reference for the trait type alias declaration,
                    // so we can retrieve it and parse it directly
                    typeDeclaration?.typeAnnotation.type === 'TSTypeLiteral'
                ) {
                    const flags = Flags.fromSignatures(typeDeclarationSignatures(typeDeclaration)!);
                    // console.log('parse_base (reference to literal): ', `${flags instanceof Flags ? `${flags.get(STATIC)} + ${flags.get(INSTANCE)}` : ''}`);
                    return !(flags instanceof Flags) ? [TraitError.CannotConstructFlags()] : flags;
                } else {
                    return [TraitError.CannotConstructFlags()];
                    // TODO: parse 
                    // const flags = self.#parseTraitTypeArgumentReference(project, self, traitName, self.#types, typeArgument, typeDeclaration);
                    // return flags ?? [TraitError.CannotConstructFlags()];
                }
            }
        } else {
            return [TraitError.CannotConstructFlags()];
        }
    }

    static fromSignatures(signatures: TSSignature[]): Flags<true> | { errors: TraitError[]; signatures: TSSignature[] } {
        const names: string[] = [];
        const flags: number[] = [];

        const baseNames = new Set<string>();
        const byName = new ByName();
        const { staticDefault, staticRequired, instanceDefault, instanceRequired } = byName;

        const errors: TraitError[] = [];
        const unknowns = [];

        for (let i = 0; i < signatures.length; i++) {
            const signature = signatures[i]!;

            if (!('key' in signature)) {
                errors.push(TraitError.IdentifierNeLiteral(signature, ''));
                continue;
            }

            if (signature.key.type !== 'Identifier') {
                errors.push(TraitError.IdentifierNeLiteral(signature.key, ''));
                continue;
            }

            const signatureName = signature.key.name;

            if (signature.type === 'TSMethodSignature' && signature.key.type === 'Identifier') {
                //! STATIC
                addFlags(names, flags, signature.optional ? staticDefault : staticRequired, signatureName, STATIC | (signature.optional ? DEFAULT : REQUIRED))
                baseNames.add(signatureName);

            } else if (
                signature.type === 'TSPropertySignature'
                && signature.key.type === 'Identifier'
                && signature.typeAnnotation
            ) {
                const annot = signature.typeAnnotation.typeAnnotation;
                //! INSTANCE
                if (
                    annot.type === 'TSTypeLiteral'
                    && signature.key.name === PROPERTY_INSTANCE_KEY
                ) {
                    const instanceSigs = annot.members;
                    for (let j = 0; j < instanceSigs.length; j++) {
                        const signature = instanceSigs[j]!;
                        if (signature.type === 'TSMethodSignature' && signature.key.type === 'Identifier') {
                            const isDefault = signature.optional,
                                instanceName = signature.key.name;
                            addFlags(names, flags, isDefault ? instanceDefault : instanceRequired, instanceName, INSTANCE | (isDefault ? DEFAULT : REQUIRED))
                            baseNames.add(instanceName);
                        } else {
                            unknowns.push(signature);
                        }
                    }
                } else {
                    // ! CONSTANT
                    if (signatureName !== signatureName.toUpperCase()) {
                        errors.push(TraitError.ConstantNameNeUppercase(signatureName));
                        continue;
                    }

                    if (!(annot.type in CONSTANT_VALUE)) {
                        errors.push(TraitError.ConstantAnnotationInvalid(signatureName));
                        continue;
                    }

                    baseNames.add(signatureName);
                    addFlags(names, flags, staticRequired, signatureName, STATIC | REQUIRED | CONST);
                }
            } else {
                unknowns.push(signature);
                continue
            }
        }
        return errors.length || unknowns.length ? { errors, signatures } : new Flags(
            names,
            flags,
            {}
        );
    }


    get isValid() {
        return this.#isValid;
    }

    get names() {
        return this.#names;
    }

    get nameSet() {
        return this.#nameSet;
    }

    get baseNameSet() {
        return this.#baseNameSet;
    }

    get flags() {
        return this.#flags;
    }

    get derives() {
        return this.#derives;
    }

    serialize(): any {
        return {
            names: this.#names,
            flags: this.#flags,
            derives: Object.fromEntries(Object.entries(this.#derives).map(([id, def]) => [id, def!.serialize()])),
        }
    }

    join<V extends boolean>(derives: TraitDefinition[]): Flags<V> {
        const deriveNames = derives.flatMap(d => d.flags.names);
        const names = structuredClone(this.#names).concat(deriveNames);
        const flags = structuredClone(this.#flags).concat(derives.flatMap(d => d.flags.flags));
        return new Flags(names, flags, derives.reduce((acc, x) => {
            acc[x.name] = x;
            return acc;
        }, Object.create(null)))
    }

    get(flags: number) {
        if (this.#cache.has(flags)) {
            return this.#cache.get(flags)!;
        } else {
            const _flags = this.#flags;
            const names = this.#names;
            const filteredNames = names.filter((_, i) => Boolean(_flags[i]! & flags)) as ReadonlyArray<string>;
            this.#cache.set(flags, filteredNames);
            return filteredNames;
        }
    }

    getFlags(name: string) {
        if (this.#flagsCache.has(name)) {
            return this.#flagsCache.get(name);
        } else {
            const flags = this.#flags;
            const names = this.#names;
            const filteredFlags = { flags: flags.filter((_, i) => names[i]! === name) };
            this.#flagsCache.set(name, filteredFlags);
            return filteredFlags;
        }
    }

    has(name: string, flag: number, isStatic: boolean) {
        if (isStatic) {
            if ((this.#static[name] ?? 0) & flag) {
                return true;
            }
            return this.#staticDerive[name]?.some(f => f & flag) ?? false;
        } else {
            if ((this.#instance[name] ?? 0) & flag) {
                return true;
            }
            return this.#instanceDerive[name]?.some(f => f & flag) ?? false;
        }
    }

    clone(): Flags<Valid> {
        return new Flags(
            this.#names,
            this.#flags,
            this.#derives,
        );
    }


    entries() {
        return new FlagsIterator(this.#flags, this.#names);
    }

    [Symbol.iterator]() {
        return new FlagsIterator(this.#flags, this.#names);
    }
}

export type ParsedDerives = ({ implicit: true; type: Flags } | { implicit: false; type: TraitDefinition })[]

interface FlagsIter {
    next(): IteratorResult<[name: string, flags: number]>;
    clone(): FlagsIter;
    chain(other: FlagsIter): FlagsIter;
    map<T>(mapper: (entry: [name: string, flags: number]) => T): Generator<T>;
    filter(predicate: (entry: [name: string, flags: number]) => boolean): Generator<[name: string, flags: number]>;

    toArray(): [name: string, flags: number][];
    toObject(): Record<string, number>;
    [Symbol.iterator](): FlagsIter;
}

function* MapIter<T>(flags_iter: FlagsIter, mapper: (entry: [name: string, flags: number]) => T) {
    let next
    while (!(next = flags_iter.next()).done) {
        yield mapper(next.value);
    }
}

function* FilterIter(flags_iter: FlagsIter, predicate: (entry: [name: string, flags: number]) => boolean) {
    let next
    while (!(next = flags_iter.next()).done) {
        if (predicate(next.value)) {
            yield next.value;
        }
    }
}

type IterItem = [name: string, flags: number];

class FlagsIterator implements FlagsIter {
    #index: number;
    #flags: readonly number[];
    #names: readonly string[];

    #done: IteratorResult<IterItem>;

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

    clone() {
        return new FlagsIterator(this.#flags, this.#names, this.#index);
    }

    chain(other: FlagsIter) {
        return new ChainedFlagsIterator(this, other);
    }

    map<T>(mapper: (entry: IterItem) => T): Generator<T> {
        return MapIter(this, mapper);
    }

    filter(predicate: (entry: IterItem) => boolean): Generator<IterItem> {
        return FilterIter(this, predicate)
    }


    toArray(): IterItem[] {
        return Array.from(this);
    }

    toObject(): Record<string, number> {
        return Object.fromEntries(this);
    }

    [Symbol.iterator]() {
        return this;
    }
}

class ChainedFlagsIterator implements FlagsIter {
    #aIter: FlagsIter;
    #bIter: FlagsIter;

    constructor(
        a: FlagsIter,
        b: FlagsIter,
    ) {
        this.#aIter = a;
        this.#bIter = b;
    }

    next() {
        const first = this.#aIter.next();
        return first.done ? this.#bIter.next() : first;
    }

    clone(): FlagsIter {
        return new ChainedFlagsIterator(this.#aIter.clone(), this.#bIter.clone())
    }

    map<T>(mapper: (entry: [name: string, flags: number]) => T): Generator<T> {
        return MapIter(this, mapper)
    }

    filter(predicate: (entry: [name: string, flags: number]) => boolean): Generator<[name: string, flags: number]> {
        return FilterIter(this, predicate);
    }

    chain(other: FlagsIterator | ChainedFlagsIterator) {
        return new ChainedFlagsIterator(this, other);
    }

    toArray(): [name: string, flags: number][] {
        return Array.from(this);
    }

    toObject(): Record<string, number> {
        return Object.fromEntries(this);
    }

    [Symbol.iterator]() {
        return this;
    }
}

function addFlags(names: string[], flags: number[], byName: Record<string, number>, name: string, flag: number) {
    names.push(name);
    flags.push(flag);
    byName[name] = flag;
}
