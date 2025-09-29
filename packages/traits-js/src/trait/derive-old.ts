import type { DeriveFn, InferTypes, TraitClass, ValidClass } from "./types";

// export function deriveOld<const C extends ValidClass, const Derives extends DeriveFn[]>(target: C, ..._traits: Derives): TraitClass<C, InferTypes<Derives>> {
//     return target as unknown as TraitClass<C, InferTypes<Derives>>;
// };


export function deriveNew<const C extends ValidClass, const Derives extends DeriveFn[]>(target: C, ..._traits: Derives): TraitClass<C, InferTypes<Derives>> {
    return target as unknown as TraitClass<C, InferTypes<Derives>>;
};