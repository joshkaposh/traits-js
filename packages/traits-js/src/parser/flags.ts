import type { Class, TSSignature } from "oxc-parser";
import type { TraitDefinition } from "./definition";
import { TraitError } from "./error";

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

// const FLAGS = {
//     evaluate(): number {
//         return 0;
//     },
//     make(isStatic: boolean, isProvided: boolean) {
//         return (isStatic ? STATIC : INSTANCE) | (isProvided ? DEFAULT : REQUIRED);
//     },
//     has(flags: number, flag: number) {
//         return flags & flag;
//     },

//     serialize(name: string, flags: number): SerializedFlags {
//         return `${name}:${flags}`;
//     },

//     deserialize(str: SerializedFlags) {
//         let flags = 0;
//         let index = 0;

//         const [] = str.split(':');

//         while (true) {
//             const char = str[index]!;
//             if (char in CHARS) {
//                 index++;
//                 flags |= CHARS[char]!;
//             } else {
//                 return [flags, str.slice(index)] as [number, string];
//             }
//         }
//     },

//     toString(flags: number) {
//         let result = '';

//         if (flags & INSTANCE) {
//             result += 'instance';
//         } else {
//             result += 'static';
//         }

//         if (flags & DEFAULT) {
//             result += ", provided";
//         } else {
//             result += ', required';
//         }

//         return result;
//     }
// } as const;

export const REQUIRED = 0x00001;
export const DEFAULT = 0x00010;
export const STATIC = 0x00100;
export const INSTANCE = 0x01000;
export const CONST = 0x10000;

export interface FlagsInterface {

    readonly flags: readonly number[];
    readonly names: readonly string[];
    readonly nameSet: NameSet;

    readonly staticNames: NameSet;
    readonly staticDefaultNames: NameSet;
    readonly staticRequiredNames: NameSet;

    readonly instanceNames: NameSet;
    readonly instanceDefaultNames: NameSet;
    readonly instanceRequiredNames: NameSet;

    isDisjointFrom(other: FlagsInterface): boolean
    isDisjointFromDerives(derives: FlagsInterface[]): boolean;

    entries(): FlagsIterator;

    clone(): FlagsInterface;

    [Symbol.iterator](): FlagsIterator;
}

const PROPERTY_INSTANCE_KEY = 'instance';

// 
// 
// 
// 

const CONSTANT_VALUE = {
    TSBooleanKeyword: 0,
    TSNumberKeyword: 1,
    TSBigIntKeyword: 2,
    TSStringKeyword: 3,
} as const;

export type NameSet = ReadonlySet<string>;

export class Flags implements FlagsInterface {

    constructor(
        names: readonly string[],
        flags: readonly number[],
        byName: Record<string, number>,
        nameSet?: NameSet,
        staticNames?: NameSet,
        staticDefaultNames?: NameSet,
        staticRequiredNames?: NameSet,
        instanceNames?: NameSet,
        instanceDefaultNames?: NameSet,
        instanceRequiredNames?: NameSet,
    ) {

        if (!staticNames) {
            const _staticNames = new Set<string>(),
                _staticRequiredNames = new Set<string>(),
                _staticDefaultNames = new Set<string>(),
                _instanceNames = new Set<string>(),
                _instanceRequiredNames = new Set<string>(),
                _instanceDefaultNames = new Set<string>();

            for (let index = 0; index < names.length; index++) {
                const f = flags[index]!;
                const n = names[index]!;
                if (f & STATIC) {
                    _staticNames.add(n);
                    if (f & REQUIRED) {
                        _staticRequiredNames.add(n)
                    } else {
                        _staticDefaultNames.add(n)
                    }
                } else {
                    _instanceNames.add(n);
                    if (f & REQUIRED) {
                        _instanceRequiredNames.add(n)
                    } else {
                        _instanceDefaultNames.add(n)
                    }
                }

            }

            staticNames = _staticNames;
            staticDefaultNames = _staticDefaultNames;
            staticRequiredNames = _staticRequiredNames;
            instanceNames = _instanceNames;
            instanceDefaultNames = _instanceDefaultNames;
            instanceRequiredNames = _instanceRequiredNames;
        }

        this.#names = names;
        this.#flags = flags;
        this.#byName = byName;
        this.#nameSet = nameSet ?? new Set(names);
        this.#static = staticNames;
        this.#staticRequired = staticRequiredNames!;
        this.#staticDefault = staticDefaultNames!;
        this.#instance = instanceNames!;
        this.#instanceRequired = instanceRequiredNames!;
        this.#instanceDefault = instanceDefaultNames!;
    }

    static from(names: string[] | readonly string[], flags: number[] | readonly number[]) {
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

        return new Flags(Object.freeze(names), Object.freeze(flags), Object.freeze(Object.fromEntries(entries)));
    }

    static fromSignatures(signatures: TSSignature[]) {
        const names: string[] = [];
        const flags: number[] = [];
        const byName: Record<string, number> = Object.create(null);
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
                addFlags(names, flags, byName, signatureName, STATIC | (signature.optional ? DEFAULT : REQUIRED))
            } else if (signature.type === 'TSPropertySignature' && signature.key.type === 'Identifier' && signature.typeAnnotation) {
                const annot = signature.typeAnnotation.typeAnnotation;
                console.log(signature.key.name);

                if (annot.type === 'TSTypeLiteral' && signature.key.name === PROPERTY_INSTANCE_KEY) {
                    //! INSTANCE
                    const instanceSigs = annot.members;
                    for (let j = 0; j < instanceSigs.length; j++) {
                        const signature = instanceSigs[j]!;
                        if (signature.type === 'TSMethodSignature' && signature.key.type === 'Identifier') {
                            addFlags(names, flags, byName, signature.key.name, INSTANCE | (signature.optional ? DEFAULT : REQUIRED))
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

                    addFlags(names, flags, byName, signatureName, CONST);
                }
            } else {
                unknowns.push(signature);
                continue
            }
        }

        return errors.length || unknowns.length ? { errors, signatures } : new Flags(names, flags, byName);
    }

    static withDerives(base: FlagsInterface, derivedFlags: DerivedFlags) {
        return FlagsWithDerives.fromDerives(base, derivedFlags);
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

    get staticNames() {
        return this.#static;
    }

    get staticDefaultNames() {
        return this.#staticDefault;
    }

    get staticRequiredNames() {
        return this.#staticRequired;

    }

    get instanceNames() {
        return this.#instance;
    }

    get instanceDefaultNames() {
        return this.#instanceDefault;
    }

    get instanceRequiredNames() {
        return this.#instanceRequired;

    }

    clone() {
        return new Flags(
            this.#names,
            this.#flags,
            this.#byName,
            this.#nameSet,
            this.#static,
            this.#staticDefault,
            this.#staticRequired,
            this.#instance,
            this.#instanceDefault,
            this.#instanceRequired
        );
    }

    static serialize(flags: FlagsInterface) {

        if (flags instanceof FlagsWithDerives) {
            const len = flags.names.length;
            const lastDeriveIndex = len - flags.baseNames.length;
            return {
                type: 'WithDerives',
                baseNames: flags.baseNames,
                baseFlags: flags.baseFlags,
                derivedNames: flags.names.slice(0, lastDeriveIndex),
                derivedFlags: flags.flags.slice(0, lastDeriveIndex)
            } as const
        } else {
            return {
                type: 'Flags',
                names: flags.names,
                flags: flags.flags
            } as const;
        }
    }

    static deserialize(serialized: ReturnType<typeof Flags['serialize']>) {

        if (serialized.type === 'Flags') {
            return Flags.from(serialized.names, serialized.flags)
        } else {
            const { baseFlags, baseNames, derivedFlags, derivedNames } = serialized;
            const base = Flags.from(baseNames, baseFlags);

            // return new FlagsWithDerives(base, )
        }
        // const [names, flags] = serialized;
        // for (let i = 0; i < names.length; i++) {
        //     const element = names[i];

        // }
    }

    isDisjointFrom(other: FlagsInterface) {
        return this.#static.isDisjointFrom(other.staticDefaultNames) && this.#instance.isDisjointFrom(other.instanceDefaultNames);
    }

    isDisjointFromDerives(derives: FlagsInterface[]) {
        const staticNames = this.#static,
            instanceNames = this.#instance;

        for (let i = 0; i < derives.length; i++) {
            const current = derives[i]!;
            const currentStaticNames = current.staticNames,
                currentInstanceNames = current.instanceNames;

            if (!currentStaticNames.isDisjointFrom(staticNames) || !currentInstanceNames.isDisjointFrom(instanceNames)) {
                return false;
            }

            for (let j = 0; j < derives.length; j++) {
                if (i === j) {
                    continue
                }
                const other = derives[j]!;

                if (!currentStaticNames.isDisjointFrom(other.staticNames) || !currentInstanceNames.isDisjointFrom(other.instanceNames)) {
                    return false;
                }
            }

        }

        return true;
    }

    entries() {
        return new FlagsIterator(this.#flags, this.#names);
    }

    [Symbol.iterator]() {
        return new FlagsIterator(this.#flags, this.#names);
    }

    #names: readonly string[];
    #flags: readonly number[];

    #nameSet: NameSet;

    #static: NameSet;
    #staticRequired: NameSet;
    #staticDefault: NameSet;
    #instance: NameSet;
    #instanceRequired: NameSet;
    #instanceDefault: NameSet;

    #byName: Record<string, number>;
}

export type ParsedDerives = ({ implicit: true; type: FlagsInterface } | { implicit: false; type: TraitDefinition })[]

export type DerivedFlags = Array<{ name: string; flags: FlagsInterface }>;

class FlagsWithDerives implements FlagsInterface {
    #baseFlags: FlagsInterface;
    #joined: FlagsInterface;
    #derives: [string, FlagsInterface][];
    #derivesByName: Record<string, FlagsInterface>;

    constructor(base: FlagsInterface, joined: FlagsInterface, derives: [string, FlagsInterface][], derivesByName: Record<string, FlagsInterface>) {
        this.#baseFlags = base;
        this.#joined = joined;
        this.#derives = derives;
        this.#derivesByName = derivesByName;
    }

    static fromDerives(base: FlagsInterface, derives: DerivedFlags) {
        const derivesByName: Record<string, FlagsInterface> = Object.create(null);
        const derivedNamesFlags: [name: string, flags: FlagsInterface][] = [];
        const byName: Record<string, number> = Object.create(null);
        const joinedNames = [];
        const joinedFlags = [];

        for (let i = 0; i < derives.length; i++) {
            const { name, flags } = derives[i]!;
            derivesByName[name] = flags;

            const names = flags.names;
            const flagsFlags = flags.flags;
            derivedNamesFlags.push([names[i]!, flags]);

            for (let j = 0; j < names.length; j++) {
                const n = names[j]!;
                const f = flagsFlags[j]!;
                byName[n] = f;
                joinedFlags.push(f);
                joinedNames.push(n);
            }
        }

        joinedNames.push(...base.names);
        joinedFlags.push(...base.flags);


        return new FlagsWithDerives(
            base,
            new Flags(
                joinedNames,
                joinedFlags,
                byName
            ),
            derivedNamesFlags,
            derivesByName,
        );
    }

    get names() {
        return this.#joined.names;
    }

    get nameSet() {
        return this.#joined.nameSet;
    }

    get staticNames() {
        return this.#joined.staticNames;
    }

    get staticDefaultNames() {
        return this.#joined.staticDefaultNames;
    }

    get staticRequiredNames() {
        return this.#joined.staticRequiredNames;
    }

    get instanceNames() {
        return this.#joined.instanceNames;
    }

    get instanceDefaultNames() {
        return this.#joined.instanceDefaultNames;
    }

    get instanceRequiredNames() {
        return this.#joined.instanceRequiredNames;

    }

    get flags() {
        return this.#joined.flags;
    }

    get baseNames() {
        return this.#baseFlags.names;
    }

    get baseNameSet() {
        return this.#baseFlags.nameSet;
    }

    get baseFlags() {
        return this.#baseFlags.flags;
    }

    clone(): FlagsInterface {
        const derives = this.#derives.map((e) => [e[0], e[1].clone()] as [string, FlagsInterface]);
        const derivesByName = Object.fromEntries(derives.map((e) => [e[0], e[1].clone()] as [string, FlagsInterface]));
        return new FlagsWithDerives(
            this.#baseFlags.clone(),
            this.#joined.clone(),
            derives,
            derivesByName
        )
    }


    isDisjointFrom(other: FlagsInterface) {
        return this.#joined.isDisjointFrom(other);
    }

    isDisjointFromDerives(derives: FlagsInterface[]) {
        return this.#joined.isDisjointFromDerives(derives);
    }

    entries() {
        return new FlagsIterator(this.flags, this.names);
    }

    [Symbol.iterator]() {
        return this.entries();
    }



}

interface FlagsIter {
    next(): IteratorResult<[name: string, flags: number]>;
    clone(): FlagsIter;
    chain(other: FlagsIter): FlagsIter;
    toArray(): [name: string, flags: number][];
    toObject(): Record<string, number>;
    [Symbol.iterator](): FlagsIter;
}

class FlagsIterator implements FlagsIter {
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

    chain(other: FlagsIter) {
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

    clone(): FlagsIter {
        return new ChainedFlagsIterator(this.#aIter.clone(), this.#bIter.clone())
    }

    next() {
        const first = this.#aIter.next();
        return first.done ? this.#bIter.next() : first;
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
