
export type instance = typeof instance;
export const instance = Symbol('trait-modifier-instance');

export type include = typeof include;
export const include = Symbol('trait-modifier-include');

export type ModifierType = include;

export type ModifierRecord<T, K extends PropertyKey = keyof T> = IncludeModifier<K>;
type IncludeModifier<K extends PropertyKey> = { [include]?: Partial<Record<K, unknown[]>> }
