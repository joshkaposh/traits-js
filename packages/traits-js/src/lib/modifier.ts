import type { DefaultKeysOf } from "./helper-types";

export type instance = typeof instance;
export const instance = Symbol('trait-modifier:instance');

export type include = typeof include;
export const include = Symbol('trait-modifier:include');

export type type = typeof type;
export const type = Symbol('trait-modifier:associated-type');

export interface ModifierRecord<T = {}> {
    [include]?: Partial<Record<DefaultKeysOf<T>, unknown[]>>;
    [type]?: any[];
};

export type Modifier = keyof ModifierRecord & {};