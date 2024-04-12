/**
 * **DEFAULT SCOPE**
 *
 * Provider will be invoked for every dependency.
 *
 * **Example:**
 *
 * `A` depends on `B` + `C`.
 *
 * `B` and `C` both separately depend on `D`.
 *
 * `D` is scoped as transient.
 *
 * Instantiating `A` will result in two separate instances of `D`,
 * `A.B.D !== A.C.D`.
 */
export const transientScope = Symbol('transient');
/**
 * Provider will be invoked at most once in the entire lifecycle of the container.
 *
 * **Example:**
 *
 * `A` depends on `B` + `C`.
 *
 * `B` and `C` both separately depend on `D`.
 *
 * `D` is scoped as singleton.
 *
 * Instantiating `A` twice will result in the same instance of `D`,
 * `A.B.D === A.C.D === A2.B.D`
 */
export const singletonScope = Symbol('singleton');
/**
 * Same bevahior as singleton scope.
 *
 * Can be "optimistically" instantiated during container setup via `container.preload() / container.preloadSync`.
 * Helpful to catch any errors and peform potentially expensive calculations/loads
 * before any interfaces are in use.
 *
 * Can be utilized to allow synchronous suppliers with an underlying async provider.
 *
 * **NOTE**
 *
 * Instance bindings are implicitly optimistic singleton scope.
 */
export const optimisticSingletonScope = Symbol('optimistic-singleton');
/**
 * Provider will be invoked at most once per container request.
 *
 * **NOTE**
 * Suppliers act as a requests against the container for an instance,
 * and _by default_ dot no share the share the parent's request scope.
 *
 * If you want a dependency internal to a supplier to "inherit" the scope of the parent request,
 * set the supplier as `propagateScope`.
 *
 * **Example:**
 *
 * `A` depends on `B` + `C` + a _supplier_ of `D`.
 *
 * `B`, `C` and `D` all separately depend on `E`.
 *
 * `E` is scoped as request.
 *
 * Instantiating `A` will result in the same instance of `E` internally.
 * However a new instance of `A` will result in a new `E`.
 *
 * Instances of `D` supplied to `A` will have a different `E`.
 *
 * `A.B.E === A.C.E`
 * `A.B.E !== A.D().E`
 * `A.D().E !== A.D().E`.
 * `A.B.E !== A2.B.E`.
 *
 * If you want a dependency internal to a supplier to "inherit" the scope of the parent request,
 * set the supplier as `propagateScope`.
 *
 * If the `D` supplier had been set with `propagateScope: true` in the above example,
 * `A.B.E === A.D().E`.
 */
export const requestScope = Symbol('request');
/**
 * Same bevahior as request scope.
 *
 * Can be "optimistically" instantiated during the request to the the container.
 * Helpful to catch any errors and peform potentially expensive calculations/loads
 * before any interfaces are in use.
 *
 * Can be utilized to allow synchronous suppliers with an underlying async provider.
 *
 * **Example:**
 *
 * `A` depends on a _supplier_ of `B`, and propagates its scope.
 *
 * `B` depends on `C`.
 * `C` is scoped as `optimistic-request`.
 *
 * `A.B()` can be called synchronously, because `C` already exists.
 *
 * **NOTE**
 * Instances will only be optimistically instantiated if they are in the dependency graph
 *
 * **Example:**
 * `A` depends on `B`
 * `C` depends on `D`
 *
 * Both `B` and `D` are `optimistic-request`.
 *
 * A request for `A` will only instantiate `B`, not `D`.
 */
export const optimisticRequestScope = Symbol('optimistic-request');
/**
 * Similar to `request` scope, but "opts out" of the propagated scope from the parent request.
 *
 * If a `supplier` scope occurs at the top level of a container request, or the parent supplier did
 * not propagate scope, it acts exactly the same as `request` scope.
 *
 * **Example:**
 *
 * `A` depends on a B, and _supplier_ `C`, which propagates scope.
 * `C` depends on `D` + `E`, which both depend on `B`.
 *
 * `B` is scoped as supplier.
 *
 * `A.B !== A.C().D.B`
 * `const C = A.C()`
 * `C.D.B === C.E.B`.
 */
export const supplierScope = Symbol('supplier');

export type Scopes =
    | typeof optimisticRequestScope
    | typeof optimisticSingletonScope
    | typeof requestScope
    | typeof singletonScope
    | typeof supplierScope
    | typeof transientScope;
