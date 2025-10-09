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

export const REQUIRED = 0x000001;
export const DEFAULT = 0x000010;
export const STATIC = 0x000100;
export const INSTANCE = 0x001000;
export const CONST = 0x010000;
export const DERIVE = 0x100000;

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

export interface FlagsInterface {

    readonly flags: readonly number[];
    readonly names: readonly string[];

    readonly baseNames: ReadonlySet<string>;
    readonly deriveNames: ReadonlySet<string>;
    readonly byName: ByName;
    readonly derivesByName: ByName;


    // isDisjointFrom(other: FlagsInterface): boolean
    // isDisjointFromDerives(derives: FlagsInterface[]): boolean;

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

export type NameSet = Record<string, number>;

export class Flags implements FlagsInterface {

    constructor(
        names: readonly string[] = [],
        flags: readonly number[] = [],
        byName: ByName = new ByName(),
        derivesByName: ByName = new ByName(),
        baseNames: ReadonlySet<string> = new Set(),
        deriveNames: ReadonlySet<string> = new Set()
    ) {

        // if (!staticNames) {
        //     const _staticNames: NameSet = {},
        //         _staticRequiredNames: NameSet = {},
        //         _staticDefaultNames: NameSet = {},
        //         _instanceNames: NameSet = {},
        //         _instanceRequiredNames: NameSet = {},
        //         _instanceDefaultNames: NameSet = {};

        //     for (let index = 0; index < names.length; index++) {
        //         const f = flags[index]!;
        //         const n = names[index]!;
        //         if (f & STATIC) {
        //             _staticNames[n] = f;
        //             if (f & REQUIRED) {
        //                 _staticRequiredNames[n] = f;
        //             } else {
        //                 _staticDefaultNames[n] = f;
        //             }
        //         } else {
        //             _instanceNames[n] = f;
        //             if (f & REQUIRED) {
        //                 _instanceRequiredNames[n] = f
        //             } else {
        //                 _instanceDefaultNames[n] = f
        //             }
        //         }

        //     }

        //     staticNames = _staticNames;
        //     staticDefaultNames = _staticDefaultNames;
        //     staticRequiredNames = _staticRequiredNames;
        //     instanceNames = _instanceNames;
        //     instanceDefaultNames = _instanceDefaultNames;
        //     instanceRequiredNames = _instanceRequiredNames;
        // }

        this.#names = names;
        this.#flags = flags;
        this.#byName = byName;
        this.#derivesByName = derivesByName;
        this.#baseNames = baseNames;
        this.#deriveNames = deriveNames;
        // this.#static = staticNames;
        // this.#staticRequired = staticRequiredNames!;
        // this.#staticDefault = staticDefaultNames!;
        // this.#instance = instanceNames!;
        // this.#instanceRequired = instanceRequiredNames!;
        // this.#instanceDefault = instanceDefaultNames!;
    }

    // static from(names: string[] | readonly string[], flags: number[] | readonly number[]) {
    //     const byName: Record<string, number> = {};
    //     for (let i = 0; i < flags.length; i++) {
    //         byName[names[i]!] = flags[i]!;
    //     }

    //     return new Flags(Object.freeze(names), Object.freeze(flags), Object.freeze(byName));
    // }

    // static fromEntries(entries: Iterable<[name: string, flags: number]>) {
    //     const names = [];
    //     const flags = [];
    //     for (const [name, flag] of entries) {
    //         names.push(name);
    //         flags.push(flag);
    //     }

    //     return new Flags(Object.freeze(names), Object.freeze(flags), Object.freeze(Object.fromEntries(entries)));
    // }

    static fromSignatures(signatures: TSSignature[]) {
        const names: string[] = [];
        const flags: number[] = [];

        const baseNames = new Set<string>();
        const byName = new ByName();

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
                addFlags(names, flags, signature.optional ? byName.staticDefault : byName.staticRequired, signatureName, STATIC | (signature.optional ? DEFAULT : REQUIRED))
                baseNames.add(signatureName);

            } else if (signature.type === 'TSPropertySignature' && signature.key.type === 'Identifier' && signature.typeAnnotation) {
                const annot = signature.typeAnnotation.typeAnnotation;

                if (annot.type === 'TSTypeLiteral' && signature.key.name === PROPERTY_INSTANCE_KEY) {
                    //! INSTANCE
                    const instanceSigs = annot.members;
                    for (let j = 0; j < instanceSigs.length; j++) {
                        const signature = instanceSigs[j]!;
                        if (signature.type === 'TSMethodSignature' && signature.key.type === 'Identifier') {
                            const isDefault = signature.optional,
                                instanceName = signature.key.name;
                            addFlags(names, flags, isDefault ? byName.instanceDefault : byName.instanceRequired, instanceName, INSTANCE | (isDefault ? DEFAULT : REQUIRED))
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
                    addFlags(names, flags, byName.staticRequired, signatureName, CONST);
                }
            } else {
                unknowns.push(signature);
                continue
            }
        }

        return errors.length || unknowns.length ? { errors, signatures } : new Flags(names, flags, byName, new ByName(), baseNames, new Set());
    }

    static fromDerives(base: FlagsInterface, derives: DerivedFlags) {
        const joinedNames = Array.from(base.names);
        const joinedFlags = Array.from(base.flags);
        const byName = new ByName();
        const deriveNames = new Set<string>()
        const derivesByName: Record<string, FlagsInterface> = Object.create(null);
        const derivedNamesFlags: [name: string, flags: FlagsInterface][] = [];

        for (let i = 0; i < derives.length; i++) {
            const { name, flags } = derives[i]!;
            derivesByName[name] = flags;

            const names = flags.names;
            const flagsOfDerives = flags.flags;
            derivedNamesFlags.push([names[i]!, flags]);

            for (let j = 0; j < names.length; j++) {
                const n = names[j]!;
                const f = flagsOfDerives[j]! | DERIVE;

                deriveNames.add(n);
                joinedFlags.push(f);
                joinedNames.push(n);
                byName[`${(f & (STATIC | CONST)) ? 'static' : 'instance'}${f & DEFAULT ? 'Default' : 'Required'}`][n] = f;
            }
        }

        return new Flags(joinedNames, joinedFlags, base.byName, byName, base.baseNames, deriveNames)
        // return new FlagsWithDerives(
        //     base,
        //     new Flags(
        //         joinedNames,
        //         joinedFlags,
        //         base.byName,
        //         byName,
        //         base.baseNames,
        //         deriveNames
        //     ),
        //     derivedNamesFlags,
        //     derivesByName,
        // );
    }

    // static withDerives(base: FlagsInterface, derivedFlags: DerivedFlags) {
    //     return FlagsWithDerives.fromDerives(base, derivedFlags);
    // }

    get names() {
        return this.#names;
    }

    get flags() {
        return this.#flags;
    }

    get baseNames() {
        return this.#baseNames;
    }

    get deriveNames() {
        return this.#deriveNames;
    }

    get byName() {
        return this.#byName;
    }

    get derivesByName() {
        return this.#derivesByName;
    }


    clone() {
        return new Flags(
            this.#names,
            this.#flags,
            this.#byName,
            this.#derivesByName,
            this.#baseNames,
            this.#deriveNames
            // this.#static,
            // this.#staticDefault,
            // this.#staticRequired,
            // this.#instance,
            // this.#instanceDefault,
            // this.#instanceRequired
        );
    }


    entries() {
        return new FlagsIterator(this.#flags, this.#names);
    }

    [Symbol.iterator]() {
        return new FlagsIterator(this.#flags, this.#names);
    }


    // static serialize(flags: FlagsInterface) {

    //     if (flags instanceof FlagsWithDerives) {
    //         const len = flags.names.length;
    //         const lastDeriveIndex = len - flags.joinedBaseNames.length;
    //         return {
    //             type: 'WithDerives',
    //             baseNames: flags.baseNames,
    //             baseFlags: flags.baseFlags,
    //             derivedNames: flags.names.slice(0, lastDeriveIndex),
    //             derivedFlags: flags.flags.slice(0, lastDeriveIndex)
    //         } as const
    //     } else {
    //         return {
    //             type: 'Flags',
    //             names: flags.names,
    //             flags: flags.flags
    //         } as const;
    //     }
    // }

    // static deserialize(serialized: ReturnType<typeof Flags['serialize']>) {
    //     if (serialized.type === 'Flags') {
    //         return Flags.from(serialized.names, serialized.flags)
    //     } else {
    //         // const { baseFlags, baseNames, derivedFlags, derivedNames } = serialized;
    //         // const base = Flags.from(baseNames, baseFlags);

    //         // return new FlagsWithDerives(base, )
    //     }
    //     // const [names, flags] = serialized;
    //     // for (let i = 0; i < names.length; i++) {
    //     //     const element = names[i];

    //     // }
    // }

    // isDisjointFrom(other: FlagsInterface) {
    //     return this.#static.isDisjointFrom(other.staticDefaultNames) && this.#instance.isDisjointFrom(other.instanceDefaultNames);
    // }

    // isDisjointFromDerives(derives: FlagsInterface[]) {
    //     const staticNames = this.#static,
    //         instanceNames = this.#instance;

    //     for (let i = 0; i < derives.length; i++) {
    //         const current = derives[i]!;
    //         const currentStaticNames = current.staticNames,
    //             currentInstanceNames = current.instanceNames;

    //         if (!currentStaticNames.isDisjointFrom(staticNames) || !currentInstanceNames.isDisjointFrom(instanceNames)) {
    //             return false;
    //         }

    //         for (let j = 0; j < derives.length; j++) {
    //             if (i === j) {
    //                 continue
    //             }
    //             const other = derives[j]!;

    //             if (!currentStaticNames.isDisjointFrom(other.staticNames) || !currentInstanceNames.isDisjointFrom(other.instanceNames)) {
    //                 return false;
    //             }
    //         }

    //     }

    //     return true;
    // }


    #names: readonly string[];
    #flags: readonly number[];

    #byName: ByName;
    #derivesByName: ByName;

    #baseNames: ReadonlySet<string>;
    #deriveNames: ReadonlySet<string>;


    // #static: NameSet;
    // #staticRequired: NameSet;
    // #staticDefault: NameSet;
    // #instance: NameSet;
    // #instanceRequired: NameSet;
    // #instanceDefault: NameSet;

}

export type ParsedDerives = ({ implicit: true; type: FlagsInterface } | { implicit: false; type: TraitDefinition })[]

export type DerivedFlags = Array<{ name: string; flags: FlagsInterface }>;

// class FlagsWithDerives implements FlagsInterface {
//     #baseFlags: FlagsInterface;
//     #joined: FlagsInterface;
//     // #derives: [string, FlagsInterface][];
//     #deriveFlagsByName: Record<string, FlagsInterface>;
//     #derivesByName: ByName;

//     constructor(base: FlagsInterface, joined: FlagsInterface, deriveFlagsByName: Record<string, FlagsInterface>) {
//         const sd: NameSet = {},
//             sr: NameSet = {},
//             id: NameSet = {},
//             ir: NameSet = {};

//         for (const traitName in deriveFlagsByName) {
//             const deriveFlags = deriveFlagsByName[traitName]!;
//             for (const [name, flags] of deriveFlags) {

//             }

//         }

//         this.#baseFlags = base;
//         this.#joined = joined;
//         this.#derivesByName = new ByName(sd, sr, id, ir);
//         this.#deriveFlagsByName = deriveFlagsByName;

//     }

//     static fromDerives(base: FlagsInterface, derives: DerivedFlags) {
//         const joinedNames = Array.from(base.names);
//         const joinedFlags = Array.from(base.flags);
//         const byName = new ByName();
//         const deriveNames = new Set<string>()
//         const derivesByName: Record<string, FlagsInterface> = Object.create(null);
//         const derivedNamesFlags: [name: string, flags: FlagsInterface][] = [];

//         for (let i = 0; i < derives.length; i++) {
//             const { name, flags } = derives[i]!;
//             derivesByName[name] = flags;

//             const names = flags.names;
//             const flagsOfDerives = flags.flags;
//             derivedNamesFlags.push([names[i]!, flags]);

//             for (let j = 0; j < names.length; j++) {
//                 const n = names[j]!;
//                 const f = flagsOfDerives[j]! | DERIVE;
//                 byName[`${f & STATIC ? 'static' : 'instance'}${f & DEFAULT ? 'Default' : 'Required'}`][n] = f;
//                 deriveNames.add(n);
//                 joinedFlags.push(f);
//                 joinedNames.push(n);
//             }
//         }

//         return new FlagsWithDerives(
//             base,
//             new Flags(
//                 joinedNames,
//                 joinedFlags,
//                 base.byName,
//                 byName,
//                 base.baseNames,
//                 deriveNames
//             ),
//             derivedNamesFlags,
//             derivesByName,
//         );
//     }

//     get names() {
//         return this.#joined.names;
//     }

//     get flags() {
//         return this.#joined.flags;
//     }

//     get baseNames() {
//         return this.#joined.baseNames;
//     }

//     get deriveNames() {

//     }

//     get byName() {
//         return this.#baseFlags.byName;
//     }

//     get derivesByName() {
//         return this.#derives
//     }

//     get baseFlags() {
//         return this.#baseFlags.flags;
//     }

//     clone(): FlagsInterface {
//         const derives = Object.entries(this.#derivesByName).map((e) => [e[0], e[1].clone()] as [string, FlagsInterface]);
//         const derivesByName = Object.fromEntries(derives.map((e) => [e[0], e[1].clone()] as [string, FlagsInterface]));
//         return new FlagsWithDerives(
//             this.#baseFlags.clone(),
//             this.#joined.clone(),
//             derives,
//             derivesByName
//         )
//     }

//     // isDisjointFrom(other: FlagsInterface) {
//     //     return this.#joined.isDisjointFrom(other);
//     // }

//     // isDisjointFromDerives(derives: FlagsInterface[]) {
//     //     return this.#joined.isDisjointFromDerives(derives);
//     // }

//     entries() {
//         return new FlagsIterator(this.flags, this.names);
//     }

//     [Symbol.iterator]() {
//         return this.entries();
//     }



// }

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
