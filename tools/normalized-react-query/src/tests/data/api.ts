import { randomUUID } from 'node:crypto';

export interface User {
    id: string;
    data: string[];
    age: number;
}

export const delayImmediate = async (): Promise<void> => {
    await new Promise<void>(resolve => {
        setImmediate(() => {
            resolve();
        });
    });
};

export const listUsers = async (size: number): Promise<User[]> => {
    await delayImmediate();

    const response: User[] = [];
    for (let i = 0; i < size; ++i) {
        response.push({
            id: randomUUID(),
            data: [randomUUID(), Math.random().toString(36)],
            age: Math.round(Math.random() * 100),
        });
    }
    return response;
};

export const getUser = async (id: string): Promise<User> => {
    await delayImmediate();

    return {
        id,
        data: [randomUUID(), Math.random().toString(36)],
        age: Math.round(Math.random() * 100),
    };
};

export const updateUser = async (
    id: string,
    user: Partial<Omit<User, 'id'>>
): Promise<User> => {
    await delayImmediate();

    return {
        id,
        data: [randomUUID(), Math.random().toString(36)],
        age: Math.round(Math.random() * 100),
        ...user,
    };
};
