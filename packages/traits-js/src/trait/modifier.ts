import type { DefaultKeysOf } from "./types";

export type instance = typeof instance;
export const instance = Symbol('trait-modifier-instance');

export type include = typeof include;
export const include = Symbol('trait-modifier-include');

export type ModifierRecord<T = {}> = {
    [include]?: Partial<Record<DefaultKeysOf<T>, unknown[]>>
};

export type Modifier = instance | keyof ModifierRecord
