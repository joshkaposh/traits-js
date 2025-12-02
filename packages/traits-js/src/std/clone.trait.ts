import type { instance } from "../lib";
import { impl, trait, type Trait, type ValidClass } from "../lib";

export type Clone<T extends ValidClass = ValidClass> = {
    [instance]: {
        clone(): T;
    }
};

export const Clone = trait<Clone>({});