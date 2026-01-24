import type { SinonExpectation, SinonSpy, SinonStub } from 'sinon';
import { mock, spy, stub } from 'sinon';

type Method = (...args: any[]) => unknown;

interface SpiedMethod<T extends Method> {
    method: T;
    spy: SinonSpy<Parameters<T>, ReturnType<T>>;
}

export const spyMethod = <T extends Method>(fn: T): SpiedMethod<T> => {
    const spied = spy(fn);
    return {
        method: spied as unknown as T,
        spy: spied,
    };
};

interface StubbedMethod<T extends Method> extends SpiedMethod<T> {
    stub: SinonStub<Parameters<T>, ReturnType<T>>;
}

export const stubMethod = <T extends Method>(): StubbedMethod<T> => {
    const stubbed = stub<Parameters<T>, ReturnType<T>>();
    return {
        method: stubbed as unknown as T,
        spy: stubbed,
        stub: stubbed,
    };
};

interface MockedMethod<T extends Method> extends StubbedMethod<T> {
    mock: SinonExpectation;
}

export const mockMethod = <T extends Method>(): MockedMethod<T> => {
    const mocked = mock();
    return {
        method: mocked as unknown as T,
        spy: mocked as unknown as SinonSpy<Parameters<T>, ReturnType<T>>,
        stub: mocked as unknown as SinonStub<Parameters<T>, ReturnType<T>>,
        mock: mocked,
    };
};
