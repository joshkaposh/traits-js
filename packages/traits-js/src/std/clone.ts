import type { instance } from "../trait/modifier";
import { impl, trait, type Trait, type ValidClass } from "../trait/types";

export type Clone<T extends ValidClass = ValidClass> = {
    [instance]: {
        clone(): T;
    }
};

export const Clone = trait<Clone>({});

class SomeClass { }