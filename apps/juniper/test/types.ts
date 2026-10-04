type ValueOf<T> = Extract<T[keyof T], string>;

export type AvailableProperties<T> = ValueOf<{
    [key in keyof T]: T[key] extends never ? never : key;
}>;
